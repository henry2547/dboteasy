/**
 * use-confluence-engine — drives the weighted multi-window engine from the
 * shared Digits feed.
 *
 * The feed already holds the market's tick history, so the engine never opens
 * a socket of its own: it re-reads the same rolling digits on every new tick
 * and keeps the small amount of state a tick-based engine needs (tick counter,
 * previous micro delta for flip detection, cooldown deadline).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedTick } from '../digits/types';
import { evaluateConfluence, type ConfluenceResult, type StrategyId } from './engine-scoring';

interface EngineState {
    tickIndex: number;
    previousMicroDelta: number | null;
    cooldownUntilTick: number;
    lastTickKey: string | null;
    strategyId: StrategyId | null;
}

export interface UseConfluenceEngineResult {
    result: ConfluenceResult | null;
    /** Digits the engine currently holds (most recent 500 are read). */
    sample: number;
}

export function useConfluenceEngine(ticks: NormalizedTick[], strategyId: StrategyId): UseConfluenceEngineResult {
    const digits = useMemo(
        () => ticks.map(t => t.lastDigit).filter(d => Number.isInteger(d) && d >= 0 && d <= 9),
        [ticks]
    );

    const [result, setResult] = useState<ConfluenceResult | null>(null);
    const stateRef = useRef<EngineState>({
        tickIndex: 0,
        previousMicroDelta: null,
        cooldownUntilTick: 0,
        lastTickKey: null,
        strategyId: null,
    });

    useEffect(() => {
        if (ticks.length === 0) {
            setResult(null);
            return;
        }

        const state = stateRef.current;
        const latestKey = ticks[ticks.length - 1].key;
        const isNewTick = latestKey !== state.lastTickKey;
        const strategyChanged = state.strategyId !== null && state.strategyId !== strategyId;
        if (!isNewTick && !strategyChanged) return;

        if (isNewTick) {
            state.tickIndex += 1;
            state.lastTickKey = latestKey;
        }
        // A strategy switch is not a momentum flip: start its flip detection fresh.
        if (strategyChanged) state.previousMicroDelta = null;
        state.strategyId = strategyId;

        const next = evaluateConfluence({
            digits,
            strategyId,
            tickIndex: state.tickIndex,
            previousMicroDelta: state.previousMicroDelta,
            cooldownUntilTick: state.cooldownUntilTick,
        });

        state.previousMicroDelta = next.windows.micro.deltaPp;
        state.cooldownUntilTick = next.cooldownUntilTick;
        setResult(next);
    }, [ticks, digits, strategyId]);

    return { result, sample: digits.length };
}
