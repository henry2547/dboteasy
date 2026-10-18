/**
 * useStrategyEngine — the reactive evaluation layer for the Strategy Engine tab.
 *
 * It consumes the shared Digits feed (`ticks` already normalized string-safe
 * upstream) and runs the pure evaluators from `strategy-engine-core.ts` over a
 * rolling analysis window. Evaluation is decoupled from the high-frequency tick
 * stream by a throttle boundary (max one full dispatch every `EVAL_THROTTLE_MS`)
 * so the UI thread never locks up.
 *
 * It also owns the per-strategy runtime state: simulated outcome tracking, the
 * circuit breaker (3 consecutive losses → OFF + 5-minute cool-down) and the
 * flat-stake anti-Martingale guard. No progressive staking exists anywhere here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CIRCUIT_BREAKER_COOLDOWN_MS,
    CIRCUIT_BREAKER_LOSSES,
    EVAL_THROTTLE_MS,
    FLAT_STAKE,
    STRATEGY_NAMES,
    type ExecutionSignal,
    type StrategyName,
    type StrategyOutcome,
    evaluateStrategy,
    resolveOutcome,
} from './strategy-engine-core';
import type { NormalizedTick } from '../digits/types';

export interface StrategyRuntime {
    /** Circuit breaker: is the strategy allowed to fire entries. */
    active: boolean;
    consecutiveLosses: number;
    cooldownUntil: number | null;
    /** A fired signal awaiting resolution on the next tick. */
    pending: { targetDigit: number; entryDigit: number; entryTimestamp: number } | null;
    lastSignal: ExecutionSignal | null;
    lastOutcome: 'win' | 'loss' | null;
    totalSignals: number;
    wins: number;
    losses: number;
}

export type StrategyRuntimeMap = Record<StrategyName, StrategyRuntime>;

export interface FlashEvent {
    strategyName: StrategyName;
    signal: ExecutionSignal;
    timestamp: number;
}

function createRuntime(): StrategyRuntime {
    return {
        active: true,
        consecutiveLosses: 0,
        cooldownUntil: null,
        pending: null,
        lastSignal: null,
        lastOutcome: null,
        totalSignals: 0,
        wins: 0,
        losses: 0,
    };
}

function createRuntimeMap(): StrategyRuntimeMap {
    const map = {} as StrategyRuntimeMap;
    STRATEGY_NAMES.forEach(name => {
        map[name] = createRuntime();
    });
    return map;
}

function cloneRuntimeMap(map: StrategyRuntimeMap): StrategyRuntimeMap {
    const next = {} as StrategyRuntimeMap;
    STRATEGY_NAMES.forEach(name => {
        next[name] = { ...map[name], pending: map[name].pending ? { ...map[name].pending } : null };
    });
    return next;
}

export interface UseStrategyEngineResult {
    signals: Record<StrategyName, ExecutionSignal | null>;
    runtime: StrategyRuntimeMap;
    flash: FlashEvent | null;
    outcomes: StrategyOutcome[];
    flatStake: number;
    latestDigit: number | null;
    windowDigits: number[];
    /** Manually reset a tripped circuit breaker before its cool-down ends. */
    resetStrategy: (name: StrategyName) => void;
    /** Manually toggle a strategy's active state. */
    toggleStrategy: (name: StrategyName) => void;
}

const FLASH_DURATION_MS = 2200;
const MAX_OUTCOMES = 50;

export function useStrategyEngine(ticks: NormalizedTick[], analysisWindow: number): UseStrategyEngineResult {
    const [signals, setSignals] = useState<Record<StrategyName, ExecutionSignal | null>>(() => {
        const s = {} as Record<StrategyName, ExecutionSignal | null>;
        STRATEGY_NAMES.forEach(n => (s[n] = null));
        return s;
    });
    const [runtime, setRuntime] = useState<StrategyRuntimeMap>(createRuntimeMap);
    const [flash, setFlash] = useState<FlashEvent | null>(null);
    const [outcomes, setOutcomes] = useState<StrategyOutcome[]>([]);

    const runtimeRef = useRef<StrategyRuntimeMap>(createRuntimeMap());
    const lastEvalRef = useRef(0);
    const lastTickKeyRef = useRef<string | null>(null);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const windowRef = useRef(analysisWindow);

    useEffect(() => {
        windowRef.current = analysisWindow;
    }, [analysisWindow]);

    const digits = useMemo(() => ticks.map(t => t.lastDigit).filter(d => Number.isInteger(d) && d >= 0 && d <= 9), [ticks]);

    const resetStrategy = useCallback((name: StrategyName) => {
        const rt = runtimeRef.current;
        rt[name] = createRuntime();
        setRuntime(cloneRuntimeMap(runtimeRef.current));
    }, []);

    const toggleStrategy = useCallback((name: StrategyName) => {
        const rt = runtimeRef.current[name];
        rt.active = !rt.active;
        if (rt.active) {
            rt.cooldownUntil = null;
            rt.consecutiveLosses = 0;
            rt.pending = null;
        }
        setRuntime(cloneRuntimeMap(runtimeRef.current));
    }, []);

    // The core evaluation pass — runs on a new tick, throttled to EVAL_THROTTLE_MS.
    const evaluate = useCallback(
        (tick: NormalizedTick) => {
            const now = Date.now();
            if (now - lastEvalRef.current < EVAL_THROTTLE_MS) return; // throttle boundary
            lastEvalRef.current = now;

            const window = windowRef.current;
            const windowDigits = digits.slice(-window);
            const latest = tick.lastDigit;
            const symbol = tick.symbol;
            const rt = runtimeRef.current;

            // 1. Resolve any pending outcomes against THIS tick (the settle tick).
            const resolved: StrategyOutcome[] = [];
            STRATEGY_NAMES.forEach(name => {
                const r = rt[name];
                if (!r.pending) return;
                const result = resolveOutcome(name, latest, r.pending.targetDigit);
                r.pending = null;
                r.lastOutcome = result;
                if (result === 'loss') {
                    r.consecutiveLosses += 1;
                    r.losses += 1;
                    // Circuit breaker: 3 consecutive losses trip the strategy.
                    if (r.consecutiveLosses >= CIRCUIT_BREAKER_LOSSES) {
                        r.active = false;
                        r.cooldownUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
                        r.consecutiveLosses = 0;
                        r.pending = null; // flush memory state
                    }
                } else {
                    r.consecutiveLosses = 0;
                    r.wins += 1;
                }
                resolved.push({
                    strategyName: name,
                    result,
                    entryDigit: r.pending?.entryDigit ?? latest,
                    settleDigit: latest,
                    targetDigit: r.pending?.targetDigit ?? latest,
                    timestamp: now,
                });
            });

            // 2. Expire cool-downs whose 5-minute window has elapsed.
            STRATEGY_NAMES.forEach(name => {
                const r = rt[name];
                if (!r.active && r.cooldownUntil !== null && now >= r.cooldownUntil) {
                    r.active = true;
                    r.cooldownUntil = null;
                    r.consecutiveLosses = 0;
                }
            });

            // 3. Evaluate every strategy and fire entries where conditions align.
            const newSignals = {} as Record<StrategyName, ExecutionSignal | null>;
            let fired: FlashEvent | null = null;
            STRATEGY_NAMES.forEach(name => {
                const r = rt[name];
                const sig = evaluateStrategy(name, windowDigits, latest, symbol, window);
                newSignals[name] = sig;
                r.lastSignal = sig;
                // Only fire when active, not in cool-down, and not awaiting an outcome.
                if (sig.shouldTriggerSignal && r.active && r.cooldownUntil === null && !r.pending) {
                    r.pending = {
                        targetDigit: sig.targetTriggerDigit,
                        entryDigit: latest,
                        entryTimestamp: now,
                    };
                    r.totalSignals += 1;
                    if (!fired) fired = { strategyName: name, signal: sig, timestamp: now };
                }
            });

            setSignals(newSignals);
            setRuntime(cloneRuntimeMap(rt));
            if (resolved.length) {
                setOutcomes(prev => [...resolved.reverse(), ...prev].slice(0, MAX_OUTCOMES));
            }
            if (fired) {
                setFlash(fired);
                if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
                flashTimerRef.current = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
            }
        },
        [digits]
    );

    // Drive evaluation from the live tick stream. Each new tick (by key) triggers
    // one throttled evaluation pass.
    useEffect(() => {
        if (ticks.length === 0) return;
        const latest = ticks[ticks.length - 1];
        if (latest.key === lastTickKeyRef.current) return;
        lastTickKeyRef.current = latest.key;
        evaluate(latest);
    }, [ticks, evaluate]);

    // Clean up the flash timer on unmount.
    useEffect(() => {
        return () => {
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        };
    }, []);

    const latestDigit = ticks.length > 0 ? ticks[ticks.length - 1].lastDigit : null;
    const windowDigits = digits.slice(-analysisWindow);

    return {
        signals,
        runtime,
        flash,
        outcomes,
        flatStake: FLAT_STAKE,
        latestDigit,
        windowDigits,
        resetStrategy,
        toggleStrategy,
    };
}
