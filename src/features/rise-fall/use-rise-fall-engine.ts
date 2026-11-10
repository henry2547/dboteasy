/**
 * React orchestration for the Rise/Fall engine (its own tab, right after the Bot
 * Builder).
 *
 * The hook owns the single execution service instance and feeds it the genuine
 * tick stream. Strategies only produce signals; every entry — from the panel or
 * from a Blockly block through the runtime bridge — still goes through
 * `RiseFallExecutionService.enter()`, so no path can bypass risk or account
 * verification.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiBase } from '@/hooks/useApiBase';
import { riseFallRuntime } from '@/utils/rise-fall-runtime';
import { rankStrategies, type BacktestResult } from './backtest';
import type { GeneratedBot } from './bot-generator';
import { RiseFallExecutionService, maskLoginId } from './execution-service';
import { createDerivRiseFallBroker, type DerivRiseFallBroker } from './live-broker';
import { classifyRegime } from './regime';
import type { RiskConfig } from './risk-engine';
import {
    DEFAULT_STRATEGY_CONFIG,
    evaluateAllStrategies,
    strategyLabel,
    type StrategyConfig,
} from './strategies';
import { useTickFeed } from './use-tick-feed';
import type { ExecutionMode, JournalEntry, RiseFallSignal, StrategyId } from './types';
import type { AuthTradingWebSocket, AuthWsStatus } from '@/features/ai-bot/auth-ws';

export const DEFAULT_DURATION_TICKS = 5;

/** The backtester needs a real sample before its numbers mean anything. */
export const MIN_BACKTEST_TICKS = 150;

export interface LiveConnectionState {
    active: boolean;
    status: AuthWsStatus | null;
    error: string | null;
}

export interface RiseFallEngine {
    signals: RiseFallSignal[];
    signal: RiseFallSignal;
    strategyId: StrategyId;
    regime: ReturnType<typeof classifyRegime>;
    feed: ReturnType<typeof useTickFeed>;
    snapshot: ReturnType<RiseFallExecutionService['snapshot']>;
    journal: JournalEntry[];
    config: StrategyConfig;
    durationTicks: number;
    /** The generated bot whose settings this mode is running, or null. */
    appliedBot: GeneratedBot | null;
    notice: string | null;
    live: LiveConnectionState;
    backtest: BacktestResult[] | null;
    backtestNotice: string | null;
    setStrategyId: (id: StrategyId) => void;
    updateConfig: (patch: Partial<StrategyConfig>) => void;
    setDurationTicks: (ticks: number) => void;
    setMode: (mode: ExecutionMode) => void;
    setRiskField: (field: keyof RiskConfig, value: number) => void;
    applyBot: (bot: GeneratedBot) => void;
    clearAppliedBot: () => void;
    runBacktest: () => void;
    armReal: (armed: boolean) => void;
    confirmEntry: () => void;
    cancelPendingEntry: () => void;
    start: () => void;
    pause: () => void;
    stop: () => void;
    emergencyStop: () => void;
    releaseEmergencyStop: () => void;
    clearJournal: () => void;
    reconnectAccount: () => void;
}

export function useRiseFallEngine(enabled: boolean): RiseFallEngine {
    const serviceRef = useRef<RiseFallExecutionService | null>(null);
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(current => current + 1), []);
    if (!serviceRef.current) serviceRef.current = new RiseFallExecutionService({ onChange: () => bump() });
    const service = serviceRef.current;

    const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
    const [strategyId, setStrategyIdState] = useState<StrategyId>('trend_continuation');
    const [durationTicks, setDurationState] = useState(DEFAULT_DURATION_TICKS);
    const [appliedBot, setAppliedBot] = useState<GeneratedBot | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [backtest, setBacktest] = useState<BacktestResult[] | null>(null);
    const [backtestNotice, setBacktestNotice] = useState<string | null>(null);
    const [liveStatus, setLiveStatus] = useState<AuthWsStatus | null>(null);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [connectionNonce, setConnectionNonce] = useState(0);

    const feed = useTickFeed(enabled);
    const snapshot = useMemo(() => service.snapshot(), [service, version]);
    const journal = useMemo(() => service.journalEntries(), [service, version, snapshot.mode]);

    const symbol = feed.market?.apiSymbol ?? '';
    const regime = useMemo(() => classifyRegime(feed.ticks), [feed.ticks]);
    const signals = useMemo(
        () => evaluateAllStrategies(feed.ticks, symbol, config, regime),
        [feed.ticks, symbol, config, regime]
    );
    const signal = signals.find(item => item.strategyId === strategyId) ?? signals[0];

    const mode = snapshot.mode;
    const active = snapshot.modes[mode];
    const lastTick = feed.ticks[feed.ticks.length - 1];

    // ── The authenticated connection (Demo / Real only) ───────────────────────
    const { isAuthorized, activeLoginid } = useApiBase();
    const clientRef = useRef<AuthTradingWebSocket | null>(null);
    const brokerRef = useRef<DerivRiseFallBroker | null>(null);
    const modeRef = useRef<ExecutionMode>(mode);
    modeRef.current = mode;

    useEffect(() => {
        const wantsLive = enabled && (mode === 'demo' || mode === 'real');

        if (!wantsLive || !isAuthorized) {
            brokerRef.current?.destroy();
            brokerRef.current = null;
            clientRef.current?.disconnect();
            clientRef.current = null;
            service.setBroker(null);
            setLiveStatus(null);
            setLiveError(null);
            return;
        }

        let cancelled = false;
        let client: AuthTradingWebSocket | null = null;

        // Loaded lazily so the authenticated socket module is never pulled in
        // for a visitor who only uses the virtual ledger.
        void import('@/features/ai-bot/auth-ws').then(module => {
            if (cancelled) return;
            client = new module.AuthTradingWebSocket();
            clientRef.current = client;
            const broker = createDerivRiseFallBroker(client, update => service.onContractUpdate(update));
            brokerRef.current = broker;
            service.setBroker(broker);

            client.onStatus(status => {
                if (cancelled) return;
                setLiveStatus(status);
                const target = modeRef.current;
                if (target === 'virtual') return;

                if (status.authorized && status.loginid && status.currency) {
                    const isDemoAccount = status.isVirtual;
                    if (isDemoAccount === (target === 'demo')) {
                        service.verifyAccount(target, {
                            verified: true,
                            accountType: isDemoAccount ? 'demo' : 'real',
                            maskedLoginId: maskLoginId(status.loginid),
                            currency: status.currency,
                            balance: status.balance,
                            tradePermitted: true,
                            verifiedAt: Date.now(),
                            reason: null,
                        });
                    } else {
                        service.clearAccount(
                            target,
                            `The connected account is a ${isDemoAccount ? 'Demo' : 'Real'} account — switch to the other account in the header, or change the mode.`
                        );
                    }
                } else if (status.authPhase === 'failed' || status.authPhase === 'no_token' || status.authPhase === 'balance_error') {
                    service.clearAccount(target, status.error ?? 'The account could not be verified.');
                }
            });

            client.connect().catch((error: Error) => {
                if (!cancelled) setLiveError(error.message);
            });
        });

        return () => {
            cancelled = true;
            brokerRef.current?.destroy();
            brokerRef.current = null;
            clientRef.current?.disconnect();
            clientRef.current = null;
            service.setBroker(null);
        };
    }, [enabled, mode, isAuthorized, activeLoginid, connectionNonce, service]);

    // ── One pass per genuine tick ─────────────────────────────────────────────
    const processedRef = useRef('');
    const attemptedRef = useRef('');

    useEffect(() => {
        if (!lastTick || !symbol) return;
        const key = `${symbol}:${lastTick.epoch}`;
        if (processedRef.current === key) return;
        processedRef.current = key;

        service.onTick(lastTick);
        // A live contract settles on Deriv's own report, not on ticks.

        const current = service.snapshot().modes[service.getMode()];
        const actionable =
            current.state === 'running' &&
            !current.openContract &&
            !current.pendingContract &&
            signal.direction !== 'none' &&
            (!appliedBot || signal.direction === appliedBot.direction) &&
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
            if (outcome.status === 'halted') setNotice(outcome.reason);
            if (outcome.status === 'confirmation-required') {
                setNotice('A real-money entry is waiting for your confirmation below.');
            }
        }
    }, [lastTick, symbol, signal, durationTicks, appliedBot, feed.integrity, service]);

    // ── The Bot Builder bridge ────────────────────────────────────────────────
    const latestRef = useRef({ signal, signals, snapshot, backtest, symbol, durationTicks, feed, appliedBot });
    latestRef.current = { signal, signals, snapshot, backtest, symbol, durationTicks, feed, appliedBot };

    useEffect(() => {
        if (!enabled) return undefined;

        return riseFallRuntime.register({
            snapshot: () => {
                const current = latestRef.current;
                const modeSnapshot = current.snapshot.modes[current.snapshot.mode];
                const reading = current.signal;
                const stats = modeSnapshot.stats;
                const score = Math.max(reading.riseScore, reading.fallScore);
                const best = current.backtest?.find(result => result.qualified) ?? null;
                return {
                    connected: true,
                    running: modeSnapshot.state === 'running',
                    mode: current.snapshot.mode,
                    symbol: current.symbol,
                    strategyId: reading.strategyId,
                    strategyLabel: strategyLabel(reading.strategyId),
                    regime: reading.regime,
                    direction: reading.direction,
                    suitable: reading.suitable,
                    riseScore: reading.riseScore,
                    fallScore: reading.fallScore,
                    explanation: reading.explanation,
                    bestStrategy: best?.label ?? null,
                    bestScore: best ? best.score : null,
                    stats: {
                        trades: stats.trades,
                        wins: stats.wins,
                        losses: stats.losses,
                        net: Number(stats.netProfit.toFixed(2)),
                        open: modeSnapshot.openContract ? 1 : 0,
                    },
                    tickEpoch: Math.round(reading.evaluatedAt / 1000),
                    detail: `${reading.strategyId} · ${reading.direction.toUpperCase()} ${score}/100 · ${
                        reading.regime
                    } · ${current.snapshot.mode.toUpperCase()} ${modeSnapshot.state}`,
                };
            },
            requestEntry: ({ stake, durationTicks: requestedDuration } = {}) => {
                const current = latestRef.current;
                const tick = current.feed.ticks[current.feed.ticks.length - 1];
                if (!tick) return { ok: false, reason: 'No genuine tick has arrived yet.' };
                const gate = current.appliedBot;
                if (gate && current.signal.direction !== gate.direction) {
                    return {
                        ok: false,
                        reason: `${gate.name} only takes ${
                            gate.direction === 'rise' ? 'Rise' : 'Fall'
                        } entries — the engine refused this one.`,
                    };
                }
                const modeSnapshot = current.snapshot.modes[current.snapshot.mode];
                const outcome = service.enter({
                    signal: current.signal,
                    stake: typeof stake === 'number' && Number.isFinite(stake) ? stake : modeSnapshot.risk.stake,
                    durationTicks:
                        typeof requestedDuration === 'number' && Number.isFinite(requestedDuration)
                            ? Math.round(requestedDuration)
                            : current.durationTicks,
                    entryTick: tick,
                    integrity: current.feed.integrity,
                    now: Date.now(),
                });
                if (outcome.status === 'opened') return { ok: true, reason: '' };
                if (outcome.status === 'confirmation-required') {
                    return { ok: false, reason: 'The entry is waiting for the real-money confirmation inside the Rise/Fall tab.' };
                }
                return { ok: false, reason: outcome.reason ?? 'The engine refused the entry.' };
            },
            report: () => {
                const current = latestRef.current;
                const modeSnapshot = current.snapshot.modes[current.snapshot.mode];
                const lines = current.signals.map(
                    reading =>
                        `${strategyLabel(reading.strategyId)}: ${reading.direction.toUpperCase()} ${Math.max(
                            reading.riseScore,
                            reading.fallScore
                        )}/100${reading.suitable ? '' : ' (no entry)'}`
                );
                const best = current.backtest?.find(result => result.qualified);
                return [
                    `Rise/Fall ${current.snapshot.mode.toUpperCase()} on ${current.symbol || 'no market'} · ${modeSnapshot.state}`,
                    ...lines,
                    best
                        ? `Backtest best: ${best.label} — ${best.trades} trades, ${(
                              (best.winRate ?? 0) * 100
                          ).toFixed(1)}% wins, edge ${((best.edge ?? 0) * 100).toFixed(1)} points (ESTIMATED).`
                        : 'Backtest: no strategy qualifies yet.',
                ].join('\n');
            },
        });
    }, [enabled, service]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const setStrategyId = useCallback((id: StrategyId) => {
        setStrategyIdState(id);
        setNotice(`${strategyLabel(id)} selected — the engine trades this strategy only.`);
    }, []);

    const updateConfig = useCallback((patch: Partial<StrategyConfig>) => {
        setConfig(current => ({ ...current, ...patch }));
    }, []);

    const setDurationTicks = useCallback((ticks: number) => {
        if (!Number.isFinite(ticks)) return;
        setDurationState(Math.min(300, Math.max(1, Math.round(ticks))));
    }, []);

    const setMode = useCallback(
        (next: ExecutionMode) => {
            const result = service.setMode(next);
            if (!result.ok) {
                setNotice(result.reason);
                return;
            }
            // A generated bot belongs to the mode it was applied to — the new mode starts clean.
            setAppliedBot(null);
            setNotice(`${next.toUpperCase()} mode selected.`);
        },
        [service]
    );

    /** Puts the generated bot's settings on the active mode: strategy, stake, duration and side. */
    const applyBot = useCallback(
        (bot: GeneratedBot) => {
            setStrategyIdState(bot.strategyId);
            setDurationState(Math.min(300, Math.max(1, Math.round(bot.durationTicks))));
            const risk = service.setRisk({ stake: bot.stake });
            setAppliedBot(bot);
            const side = bot.direction === 'rise' ? 'Rise' : 'Fall';
            setNotice(
                bot.stake > risk.maxStake
                    ? `${bot.name} applied — its ${bot.stake} stake is above this mode's ${risk.maxStake} maximum, so raise that limit or entries will be refused.`
                    : `${bot.name} applied — this mode now takes ${side} entries only, at a flat ${bot.stake} stake.`
            );
        },
        [service]
    );

    const clearAppliedBot = useCallback(() => {
        setAppliedBot(null);
        setNotice('Bot removed — the engine follows every strategy signal again.');
    }, []);

    const setRiskField = useCallback(
        (field: keyof RiskConfig, value: number) => {
            const next = service.setRisk({ [field]: value } as Partial<RiskConfig>);
            setNotice(`Risk limits updated — stake ${next.stake}, maximum stake ${next.maxStake}.`);
        },
        [service]
    );

    const runBacktest = useCallback(() => {
        if (feed.ticks.length < MIN_BACKTEST_TICKS) {
            setBacktest(null);
            setBacktestNotice(
                `Waiting for ${MIN_BACKTEST_TICKS - feed.ticks.length} more genuine ticks — a ranking on less than ${MIN_BACKTEST_TICKS} ticks is noise.`
            );
            return;
        }
        setBacktestNotice(null);
        const ranked = rankStrategies(feed.ticks, symbol, { config, durationTicks });
        setBacktest(ranked);
        const best = ranked.find(result => result.qualified);
        setBacktestNotice(
            best
                ? `Walk-forward over ${feed.ticks.length} genuine ticks — ${best.label} ranks first (ESTIMATED).`
                : `Walk-forward over ${feed.ticks.length} genuine ticks — no strategy qualified.`
        );
    }, [feed.ticks, symbol, config, durationTicks]);

    const armReal = useCallback(
        (armed: boolean) => {
            const result = service.armReal(armed);
            setNotice(result.ok ? (armed ? 'Real-money entries armed for this session.' : 'Real-money entries disarmed.') : result.reason);
        },
        [service]
    );

    const confirmEntry = useCallback(() => {
        const result = service.confirmEntry();
        setNotice(result.ok ? 'Confirmed — the purchase is being sent to Deriv.' : result.reason);
    }, [service]);

    const cancelPendingEntry = useCallback(() => {
        service.cancelPendingEntry();
        setNotice('Real-money entry cancelled — nothing was bought.');
    }, [service]);

    const start = useCallback(() => {
        const result = service.start();
        setNotice(result.ok ? 'Engine running — entries follow the strategy, the risk engine and the feed.' : result.reason);
    }, [service]);

    const pause = useCallback(() => {
        service.pause();
        setNotice('Paused — no new entries. An open contract keeps being monitored.');
    }, [service]);

    const stop = useCallback(() => {
        service.stop();
        setNotice('Stopped — no new entries. An open contract keeps being monitored.');
    }, [service]);

    const emergencyStop = useCallback(() => {
        service.emergencyStop();
        setNotice('Emergency stop engaged — all new entries are blocked on this mode.');
    }, [service]);

    const releaseEmergencyStop = useCallback(() => {
        service.releaseEmergencyStop();
        setNotice('Emergency stop released. The engine is idle.');
    }, [service]);

    const clearJournal = useCallback(() => {
        service.clearJournal();
        setNotice('Journal cleared for this mode only.');
    }, [service]);

    const reconnectAccount = useCallback(() => {
        setLiveError(null);
        setConnectionNonce(current => current + 1);
    }, []);

    return {
        signals,
        signal,
        strategyId,
        regime,
        feed,
        snapshot,
        journal,
        config,
        durationTicks,
        appliedBot,
        notice,
        live: { active: mode === 'demo' || mode === 'real', status: liveStatus, error: liveError },
        backtest,
        backtestNotice,
        setStrategyId,
        updateConfig,
        setDurationTicks,
        setMode,
        setRiskField,
        applyBot,
        clearAppliedBot,
        runBacktest,
        armReal,
        confirmEntry,
        cancelPendingEntry,
        start,
        pause,
        stop,
        emergencyStop,
        releaseEmergencyStop,
        clearJournal,
        reconnectAccount,
    };
}

export type { BacktestResult };
