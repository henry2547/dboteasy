/**
 * React orchestration for the Rise/Fall engine inside the Blockly Bot Builder.
 *
 * The hook owns the single execution service instance and feeds it the genuine
 * tick stream. Strategies only produce signals; every entry still goes through
 * `RiseFallExecutionService.enter()`, so no UI path can bypass risk or account
 * verification.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiseFallExecutionService } from './execution-service';
import type { RiskConfig } from './risk-engine';
import { classifyRegime } from './regime';
import {
    DEFAULT_TREND_CONTINUATION,
    evaluateTrendContinuation,
    type TrendContinuationConfig,
} from './strategies/trend-continuation';
import { useTickFeed } from './use-tick-feed';
import type { ExecutionMode, JournalEntry, RiseFallSignal } from './types';

export const DEFAULT_DURATION_TICKS = 5;

export interface RiseFallEngine {
    signal: RiseFallSignal;
    regime: ReturnType<typeof classifyRegime>;
    feed: ReturnType<typeof useTickFeed>;
    snapshot: ReturnType<RiseFallExecutionService['snapshot']>;
    journal: JournalEntry[];
    trendConfig: TrendContinuationConfig;
    durationTicks: number;
    notice: string | null;
    updateTrendConfig: (patch: Partial<TrendContinuationConfig>) => void;
    setDurationTicks: (ticks: number) => void;
    setMode: (mode: ExecutionMode) => void;
    setRiskField: (field: keyof RiskConfig, value: number) => void;
    start: () => void;
    pause: () => void;
    stop: () => void;
    emergencyStop: () => void;
    releaseEmergencyStop: () => void;
    clearJournal: () => void;
}

export function useRiseFallEngine(enabled: boolean): RiseFallEngine {
    const serviceRef = useRef<RiseFallExecutionService | null>(null);
    if (!serviceRef.current) serviceRef.current = new RiseFallExecutionService();
    const service = serviceRef.current;

    const [version, setVersion] = useState(0);
    const [trendConfig, setTrendConfig] = useState<TrendContinuationConfig>(DEFAULT_TREND_CONTINUATION);
    const [durationTicks, setDurationState] = useState(DEFAULT_DURATION_TICKS);
    const [notice, setNotice] = useState<string | null>(null);

    const bump = useCallback(() => setVersion(current => current + 1), []);

    const feed = useTickFeed(enabled);
    const snapshot = useMemo(() => service.snapshot(), [service, version]);
    const journal = useMemo(() => service.journalEntries(), [service, version, snapshot.mode]);

    const symbol = feed.market?.apiSymbol ?? '';
    const regime = useMemo(() => classifyRegime(feed.ticks), [feed.ticks]);
    const signal = useMemo(
        () => evaluateTrendContinuation(feed.ticks, symbol, trendConfig, regime),
        [feed.ticks, symbol, trendConfig, regime]
    );

    const processedRef = useRef<string>('');
    const attemptedRef = useRef<string>('');
    const lastTick = feed.ticks[feed.ticks.length - 1];

    // One pass per genuine tick: settle the open contract, then (only while the
    // engine is running) offer the fresh signal to the central executor. The
    // duplicate guard and the executor's own checks decide what happens.
    useEffect(() => {
        if (!lastTick || !symbol) return;
        const key = `${symbol}:${lastTick.epoch}`;
        if (processedRef.current === key) return;
        processedRef.current = key;

        let changed = false;
        const settled = service.onTick(lastTick);
        if (settled) changed = true;

        const current = service.snapshot().modes[service.getMode()];
        const actionable =
            current.state === 'running' &&
            !current.openContract &&
            signal.direction !== 'none' &&
            signal.suitable &&
            feed.integrity.healthy;

        if (actionable && attemptedRef.current !== signal.fingerprint) {
            attemptedRef.current = signal.fingerprint;
            const outcome = service.enter({
                signal,
                stake: current.risk.stake,
                durationTicks,
                entryTick: lastTick,
                integrity: feed.integrity,
                now: Date.now(),
            });
            changed = true;
            if (outcome.status === 'halted') setNotice(outcome.reason);
        }

        if (changed) bump();
    }, [lastTick, symbol, signal, durationTicks, feed.integrity, service, bump]);

    const updateTrendConfig = useCallback((patch: Partial<TrendContinuationConfig>) => {
        setTrendConfig(current => ({ ...current, ...patch }));
    }, []);

    const setDurationTicks = useCallback((ticks: number) => {
        if (!Number.isFinite(ticks)) return;
        setDurationState(Math.min(300, Math.max(1, Math.round(ticks))));
    }, []);

    const setMode = useCallback(
        (mode: ExecutionMode) => {
            const result = service.setMode(mode);
            setNotice(result.ok ? null : result.reason);
            bump();
        },
        [service, bump]
    );

    const setRiskField = useCallback(
        (field: keyof RiskConfig, value: number) => {
            const next = service.setRisk({ [field]: value } as Partial<RiskConfig>);
            setNotice(`Risk limits updated — stake ${next.stake}, maximum stake ${next.maxStake}.`);
            bump();
        },
        [service, bump]
    );

    const start = useCallback(() => {
        const result = service.start();
        setNotice(result.ok ? 'Engine running — entries follow the strategy, the risk engine and the feed.' : result.reason);
        bump();
    }, [service, bump]);

    const pause = useCallback(() => {
        service.pause();
        setNotice('Paused — no new entries. An open contract keeps being monitored.');
        bump();
    }, [service, bump]);

    const stop = useCallback(() => {
        service.stop();
        setNotice('Stopped — no new entries. An open contract keeps being monitored.');
        bump();
    }, [service, bump]);

    const emergencyStop = useCallback(() => {
        service.emergencyStop();
        setNotice('Emergency stop engaged — all new entries are blocked on this mode.');
        bump();
    }, [service, bump]);

    const releaseEmergencyStop = useCallback(() => {
        service.releaseEmergencyStop();
        setNotice('Emergency stop released. The engine is idle.');
        bump();
    }, [service, bump]);

    const clearJournal = useCallback(() => {
        service.clearJournal();
        setNotice('Journal cleared for this mode only.');
        bump();
    }, [service, bump]);

    return {
        signal,
        regime,
        feed,
        snapshot,
        journal,
        trendConfig,
        durationTicks,
        notice,
        updateTrendConfig,
        setDurationTicks,
        setMode,
        setRiskField,
        start,
        pause,
        stop,
        emergencyStop,
        releaseEmergencyStop,
        clearJournal,
    };
}
