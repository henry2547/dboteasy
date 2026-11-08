/**
 * GUI Trading Engine — orchestration.
 *
 * Owns the engine's own runtime (independent of the Blockly Bot Builder): a
 * per-strategy primary controller, a recovery controller, the session ledger,
 * the risk gate and the connection to the app's single authorized Deriv socket.
 *
 * Every purchase follows the same path:
 *   confirm → fresh frequency revalidation → balance + risk gate → proposal →
 *   buy → open-contract monitoring → settlement → ledger + reporting.
 *
 * Nothing is ever written to the ledger unless Deriv confirmed the purchase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageTypes } from '@/external/bot-skeleton';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import {
    DEFAULT_CONFIG,
    ENGINE_WINDOW,
    PRIMARY_DIGIT_CEILING,
    PRIMARY_STRATEGIES,
    hasConfigErrors,
    strategiesFor,
    strategyLabel,
    tradeSourceLabel,
    validateConfig,
} from './config';
import {
    fetchBalance,
    fetchContract,
    purchaseContract,
    requestProposal,
    watchContracts,
    type ContractUpdate,
} from './deriv-execution';
import { computeDigitStats, computeParityStats } from './digit-window';
import { loadStoredConfig, loadStoredSession, saveStoredConfig, saveStoredSession } from './persistence';
import {
    createPrimaryRuntime,
    evaluatePrimaryTick,
    frequencyPermission,
    pausePrimaryForRecovery,
    resumePrimaryRuntime,
    setPrimaryState,
    stopPrimaryRuntime,
} from './primary-strategy';
import { subscribeGuiEngineRequests, consumeGuiEngineRequest, peekGuiEngineRequest } from './open-request';
import {
    abortRecoveryAttempt,
    activateRecovery,
    createRecoveryRuntime,
    evaluateRecoveryTick,
    markRecoveryContractOpen,
    markRecoveryPurchasePending,
    settleRecovery,
    stopRecoveryRuntime,
} from './recovery';
import { emptySession, progressionLosses, riskVerdict, roundMoney, stakeFor, stakePreview, winRate } from './risk';
import type {
    DigitWindowStats,
    EngineConfig,
    EngineJournalEntry,
    EngineStatus,
    EngineTrade,
    ParityStats,
    PrimaryRuntime,
    PrimaryStrategyId,
    RecoverySignal,
    RecoveryRuntime,
    SessionMetrics,
    StakePreview,
    TradeSource,
} from './types';
import { useEngineFeed } from './use-engine-feed';

export interface EngineDecision {
    allowed: boolean;
    reason: string | null;
    at: number;
    label: string;
}

function journalId(): string {
    return `gj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function tradeId(): string {
    return `gt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useGuiEngine() {
    const feed = useEngineFeed();
    const { isAuthorized, authData, activeLoginid } = useApiBase();
    const { journal: journalStore, summary_card, transactions } = useStore();

    const [config, setConfigState] = useState<EngineConfig>(() => ({
        ...DEFAULT_CONFIG,
        ...(loadStoredConfig() ?? {}),
    }));
    const [status, setStatusState] = useState<EngineStatus>('stopped');
    const [haltReason, setHaltReason] = useState<string | null>(null);
    const [session, setSession] = useState<SessionMetrics>(emptySession);
    const [trades, setTrades] = useState<EngineTrade[]>([]);
    const [log, setLog] = useState<EngineJournalEntry[]>([]);
    const [primaryViews, setPrimaryViews] = useState<Record<PrimaryStrategyId, PrimaryRuntime>>(() => ({
        over1: createPrimaryRuntime('over1'),
        under8: createPrimaryRuntime('under8'),
    }));
    const [recoveryView, setRecoveryView] = useState<RecoveryRuntime>(createRecoveryRuntime);
    const [decision, setDecision] = useState<EngineDecision | null>(null);
    const [balance, setBalance] = useState<number | null>(null);
    const [isPurchasing, setIsPurchasing] = useState(false);

    const statusRef = useRef<EngineStatus>('stopped');
    const configRef = useRef(config);
    const primaryRef = useRef<Record<PrimaryStrategyId, PrimaryRuntime>>(primaryViews);
    const recoveryRef = useRef<RecoveryRuntime>(recoveryView);
    const sessionRef = useRef<SessionMetrics>(session);
    const tradesRef = useRef<EngineTrade[]>(trades);
    const logRef = useRef<EngineJournalEntry[]>(log);
    const processedEpochRef = useRef(0);
    const purchasingRef = useRef(false);
    const trackedContractsRef = useRef(new Set<number>());
    const settledRef = useRef(new Set<number>());
    const consumedSetupsRef = useRef(new Set<string>());
    const feedRef = useRef(feed);
    const accountIdRef = useRef('');

    // The panels show the rolling window at all times — the strategies only run
    // while the engine is running, but the market reading is not engine state.
    const liveStats = useMemo(() => computeDigitStats(feed.ticks), [feed.ticks]);
    const liveParity = useMemo(() => computeParityStats(feed.ticks), [feed.ticks]);

    feedRef.current = feed;
    configRef.current = config;

    const setStatus = useCallback((next: EngineStatus) => {
        statusRef.current = next;
        setStatusState(next);
    }, []);

    const pushJournal = useCallback(
        (entry: Omit<EngineJournalEntry, 'id' | 'at'> & { at?: number }) => {
            const item: EngineJournalEntry = {
                id: journalId(),
                at: entry.at ?? Date.now(),
                type: entry.type,
                level: entry.level,
                strategy: entry.strategy,
                market: entry.market,
                message: entry.message,
                details: entry.details ?? {},
            };
            const nextLog = [...logRef.current, item].slice(-400);
            logRef.current = nextLog;
            setLog(nextLog);

            // The app's existing Journal tab reads this store — engine lines land
            // there exactly like bot lines do.
            const messageType =
                entry.level === 'error'
                    ? MessageTypes.ERROR
                    : entry.level === 'success'
                      ? MessageTypes.SUCCESS
                      : MessageTypes.NOTIFY;
            try {
                journalStore.pushMessage(`GUI engine · ${entry.message}`, messageType, '');
            } catch {
                /* journal store unavailable (tests) — the engine log still holds the line */
            }
            return item;
        },
        [journalStore]
    );

    const updateSession = useCallback((mutate: (current: SessionMetrics) => SessionMetrics) => {
        const next = mutate({ ...sessionRef.current });
        sessionRef.current = next;
        setSession(next);
    }, []);

    const updateTrade = useCallback((contractId: number, patch: Partial<EngineTrade>) => {
        const next = tradesRef.current.map(trade =>
            trade.contractId === contractId ? { ...trade, ...patch } : trade
        );
        tradesRef.current = next;
        setTrades(next);
    }, []);

    const addTrade = useCallback((trade: EngineTrade) => {
        const next = [...tradesRef.current, trade];
        tradesRef.current = next;
        setTrades(next);
    }, []);

    /** Mirrors a real contract update into Summary + Transactions. */
    const pushReporting = useCallback(
        (update: ContractUpdate) => {
            const payload = {
                ...update.raw,
                id: String(update.contractId),
                contract_id: update.contractId,
                is_sold: update.isSold ? 1 : 0,
                profit: update.profit,
                buy_price: update.buyPrice,
                sell_price: update.sellPrice,
                payout: update.payout,
            };
            try {
                // The reporting stores accept the same contract shape the bot broadcasts.
                const onContract = summary_card.onBotContractEvent as unknown as (
                    contract: Record<string, unknown>
                ) => void;
                const onTransaction = transactions.onBotContractEvent as unknown as (
                    contract: Record<string, unknown>
                ) => void;
                onContract(payload);
                onTransaction(payload);
            } catch {
                /* reporting stores unavailable (tests) */
            }
        },
        [summary_card, transactions]
    );

    const halt = useCallback(
        (reason: string) => {
            setHaltReason(reason);
            setStatus('halted');
            const stopped = { ...primaryRef.current };
            (Object.keys(stopped) as PrimaryStrategyId[]).forEach(key => {
                stopped[key] = stopPrimaryRuntime(stopped[key]);
            });
            primaryRef.current = stopped;
            setPrimaryViews(stopped);
            recoveryRef.current = stopRecoveryRuntime(recoveryRef.current);
            setRecoveryView(recoveryRef.current);
            pushJournal({
                type: 'engine',
                level: 'warn',
                strategy: 'Engine',
                market: feedRef.current.selectedMarket?.displayName ?? '—',
                message: `Engine halted · ${reason}`,
                details: { reason },
            });
        },
        [pushJournal, setStatus]
    );

    /** Applies a genuine contract update exactly once per settlement. */
    const applyContractUpdate = useCallback(
        (update: ContractUpdate) => {
            const trade = tradesRef.current.find(item => item.contractId === update.contractId);
            if (!trade) return;

            pushReporting(update);

            updateTrade(update.contractId, {
                profit: update.profit,
                buyPrice: update.buyPrice || trade.buyPrice,
                sellPrice: update.sellPrice,
                payout: update.payout || trade.payout,
                status: update.isSold ? 'settled' : 'open',
            });

            if (!update.isSold || settledRef.current.has(update.contractId)) return;
            settledRef.current.add(update.contractId);
            trackedContractsRef.current.delete(update.contractId);

            const profit = roundMoney(update.profit);
            const won = profit > 0;
            const isRecovery = trade.source === 'gui_recovery';

            updateTrade(update.contractId, {
                outcome: won ? 'won' : 'lost',
                settlementAt: Date.now(),
                profit,
                sellPrice: update.sellPrice,
                status: 'settled',
            });

            updateSession(current => {
                const next: SessionMetrics = {
                    ...current,
                    wins: current.wins + (won ? 1 : 0),
                    losses: current.losses + (won ? 0 : 1),
                    profit: roundMoney(current.profit + profit),
                    consecutiveLosses: won ? 0 : current.consecutiveLosses + 1,
                    openContracts: Math.max(0, current.openContracts - 1),
                };
                if (isRecovery) {
                    next.recoveryAttempts = current.recoveryAttempts + 1;
                    next.recoveryWins = current.recoveryWins + (won ? 1 : 0);
                    next.recoveryLosses = current.recoveryLosses + (won ? 0 : 1);
                    next.recoveryConsecutiveLosses = won ? 0 : current.recoveryConsecutiveLosses + 1;
                }
                return next;
            });

            pushJournal({
                type: 'settlement',
                level: won ? 'success' : 'warn',
                strategy: trade.strategyLabel,
                market: trade.marketName,
                message: `${trade.strategyLabel} contract ${update.contractId} settled ${won ? 'WON' : 'LOST'} · P/L ${profit.toFixed(2)}`,
                details: {
                    contractId: update.contractId,
                    stake: trade.stake,
                    profit,
                    settlementStatus: update.status,
                },
            });

            const settledSession = sessionRef.current;

            if (isRecovery) {
                const outcome = settleRecovery(recoveryRef.current, won ? 'won' : 'lost', configRef.current);
                recoveryRef.current = outcome.runtime;
                setRecoveryView(outcome.runtime);
                pushJournal({
                    type: 'recovery',
                    level: won ? 'success' : 'warn',
                    strategy: 'Even/Odd Recovery',
                    market: trade.marketName,
                    message: won
                        ? 'Recovery trade won — recovery counters reset, returning to primary evaluation.'
                        : `Recovery trade lost · attempts used ${outcome.runtime.attempts}/${configRef.current.maxRecoveryTrades}.`,
                    details: {
                        attempts: outcome.runtime.attempts,
                        limitReached: outcome.limitReached,
                        profit,
                    },
                });
                if (outcome.limitReached) {
                    halt(`Maximum recovery trades reached (${outcome.runtime.attempts}/${configRef.current.maxRecoveryTrades}).`);
                    return;
                }
            } else if (!won) {
                const activation = activateRecovery(recoveryRef.current, String(update.contractId), configRef.current);
                recoveryRef.current = activation.runtime;
                setRecoveryView(activation.runtime);
                if (activation.activated) {
                    primaryRef.current = pausePrimaryForRecovery(primaryRef.current);
                    setPrimaryViews({ ...primaryRef.current });
                    consumedSetupsRef.current = new Set();
                }
                pushJournal({
                    type: 'recovery',
                    level: 'info',
                    strategy: 'Even/Odd Recovery',
                    market: trade.marketName,
                    message: activation.activated
                        ? `Primary loss ${update.contractId} opened recovery evaluation — primary entries pause while the parity pattern is watched.`
                        : `Recovery not activated · ${activation.reason}`,
                    details: { contractId: update.contractId, activated: activation.activated },
                });
            }

            const limit = hardLimitCheck(configRef.current, settledSession);
            if (limit) halt(limit);
        },
        [halt, pushJournal, pushReporting, setPrimaryViews, updateSession, updateTrade]
    );

    const applyUpdateRef = useRef(applyContractUpdate);
    applyUpdateRef.current = applyContractUpdate;

    // One subscription to the account's existing contract stream.
    useEffect(() => {
        const unsubscribe = watchContracts(
            contractId => trackedContractsRef.current.has(contractId),
            update => applyUpdateRef.current(update)
        );
        return () => unsubscribe();
    }, []);

    const purchase = useCallback(
        async (params: {
            source: TradeSource;
            strategyLabel: string;
            contractType: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
            barrier: number | null;
            kind: 'primary' | 'recovery';
            label: string;
            setupId: string | null;
            noteDetails: Record<string, unknown>;
        }) => {
            /**
             * A recovery entry that never reached a purchase must hand the
             * recovery controller back to pattern monitoring. Without this the
             * controller stayed in RECOVERY_PURCHASE_PENDING for the rest of the
             * session and the Even/Odd leg never evaluated another tick.
             */
            const releaseRecovery = (reason: string) => {
                if (params.kind !== 'recovery') return;
                if (recoveryRef.current.state !== 'RECOVERY_PURCHASE_PENDING') return;
                recoveryRef.current = abortRecoveryAttempt(recoveryRef.current, reason);
                setRecoveryView(recoveryRef.current);
            };

            if (purchasingRef.current) {
                const reason = 'A purchase is already pending — duplicate entry prevented.';
                setDecision({ allowed: false, reason, at: Date.now(), label: params.label });
                releaseRecovery(reason);
                return;
            }

            const market = feedRef.current.selectedMarket;
            const cfg = configRef.current;

            if (!market || !market.isOpen || market.isSuspended) {
                setDecision({ allowed: false, reason: 'The selected market is not available.', at: Date.now(), label: params.label });
                pushJournal({
                    type: 'blocked',
                    level: 'warn',
                    strategy: params.strategyLabel,
                    market: market?.displayName ?? '—',
                    message: `Purchase blocked · the selected market is not available.`,
                    details: params.noteDetails,
                });
                releaseRecovery('The selected market is not available.');
                return;
            }
            if (!isAuthorized) {
                setDecision({
                    allowed: false,
                    reason: 'The Deriv account is not authorized.',
                    at: Date.now(),
                    label: params.label,
                });
                releaseRecovery('The Deriv account is not authorized.');
                return;
            }

            purchasingRef.current = true;
            setIsPurchasing(true);

            try {
                // One shared loss progression, so a recovery trade after a primary
                // loss carries the multiplier instead of restarting at the base stake.
                const stake = stakeFor(cfg, params.kind, progressionLosses(sessionRef.current));

                const freshBalance = await fetchBalance();
                if (freshBalance !== null) setBalance(freshBalance);

                const verdict = riskVerdict({
                    config: cfg,
                    session: sessionRef.current,
                    kind: params.kind,
                    stake,
                    balance: freshBalance ?? balance,
                    connectionOk: feedRef.current.connection.status === 'connected',
                    dataFresh: feedRef.current.isDataFresh && feedRef.current.windowFull,
                    purchasePending: false,
                    entriesAllowed: statusRef.current === 'running',
                    haltReason,
                });

                setDecision({
                    allowed: verdict.allowed,
                    reason: verdict.reason,
                    at: Date.now(),
                    label: params.label,
                });

                if (!verdict.allowed) {
                    pushJournal({
                        type: 'blocked',
                        level: 'warn',
                        strategy: params.strategyLabel,
                        market: market.displayName,
                        message: `Purchase blocked · ${verdict.reason}`,
                        details: { ...params.noteDetails, stake, reason: verdict.reason },
                    });
                    releaseRecovery(verdict.reason ?? 'The risk check blocked this entry.');
                    return;
                }

                const currency = authData?.currency ?? 'USD';
                const proposal = await requestProposal({
                    symbol: market.apiSymbol,
                    contractType: params.contractType,
                    stake,
                    barrier: params.barrier ?? undefined,
                    currency,
                    duration: 1,
                    durationUnit: 't',
                });

                const bought = await purchaseContract(proposal);

                const trade: EngineTrade = {
                    id: tradeId(),
                    source: params.source,
                    strategyLabel: params.strategyLabel,
                    market: market.apiSymbol,
                    marketName: market.displayName,
                    contractType: params.contractType,
                    barrier: params.barrier,
                    stake,
                    buyPrice: bought.buyPrice,
                    sellPrice: null,
                    payout: bought.payout,
                    profit: null,
                    transactionId: bought.transactionId,
                    contractId: bought.contractId,
                    entryAt: (bought.startTime ?? Math.floor(Date.now() / 1000)) * 1000,
                    settlementAt: null,
                    outcome: 'open',
                    status: 'open',
                    setupId: params.setupId,
                };

                addTrade(trade);
                trackedContractsRef.current.add(bought.contractId);

                updateSession(current => ({
                    ...current,
                    totalTrades: current.totalTrades + 1,
                    primaryTrades: current.primaryTrades + (params.kind === 'primary' ? 1 : 0),
                    recoveryTrades: current.recoveryTrades + (params.kind === 'recovery' ? 1 : 0),
                    totalStake: roundMoney(current.totalStake + stake),
                    openContracts: current.openContracts + 1,
                }));

                pushReporting({
                    contractId: bought.contractId,
                    isSold: false,
                    profit: 0,
                    buyPrice: bought.buyPrice,
                    sellPrice: null,
                    payout: bought.payout,
                    status: 'open',
                    entrySpot: proposal.spot,
                    exitSpot: null,
                    entryTickTime: bought.startTime,
                    exitTickTime: null,
                    raw: {
                        contract_id: bought.contractId,
                        contract_type: params.contractType,
                        underlying_symbol: market.apiSymbol,
                        buy_price: bought.buyPrice,
                        payout: bought.payout,
                        transaction_ids: { buy: bought.transactionId },
                        date_start: bought.startTime,
                        currency,
                        longcode: proposal.longcode,
                        barrier: params.barrier === null ? undefined : String(params.barrier),
                    },
                });

                pushJournal({
                    type: 'purchase',
                    level: 'info',
                    strategy: params.strategyLabel,
                    market: market.displayName,
                    message: `Bought ${params.contractType}${params.barrier !== null ? ` barrier ${params.barrier}` : ''} · stake ${stake} · contract ${bought.contractId} · tx ${bought.transactionId} · ${tradeSourceLabel(params.source)}`,
                    details: {
                        ...params.noteDetails,
                        contractId: bought.contractId,
                        transactionId: bought.transactionId,
                        stake,
                        buyPrice: bought.buyPrice,
                        payout: bought.payout,
                        proposalId: proposal.id,
                        askPrice: proposal.askPrice,
                    },
                });

                if (params.kind === 'recovery') {
                    recoveryRef.current = markRecoveryContractOpen(recoveryRef.current);
                    setRecoveryView(recoveryRef.current);
                } else {
                    const strategy = params.source === 'gui_over1' ? 'over1' : 'under8';
                    const updated = setPrimaryState(primaryRef.current[strategy], 'CONTRACT_OPEN');
                    primaryRef.current = { ...primaryRef.current, [strategy]: updated };
                    setPrimaryViews({ ...primaryRef.current });
                }
            } catch (error) {
                const message = (error as Error).message || 'The purchase failed.';
                setDecision({ allowed: false, reason: message, at: Date.now(), label: params.label });
                pushJournal({
                    type: 'error',
                    level: 'error',
                    strategy: params.strategyLabel,
                    market: market.displayName,
                    message: `Purchase failed · ${message}`,
                    details: { ...params.noteDetails, error: message },
                });
                if (params.kind === 'recovery') {
                    releaseRecovery(message);
                } else {
                    const strategy = params.source === 'gui_over1' ? 'over1' : 'under8';
                    const updated = setPrimaryState(primaryRef.current[strategy], 'SETUP_BLOCKED');
                    primaryRef.current = { ...primaryRef.current, [strategy]: updated };
                    setPrimaryViews({ ...primaryRef.current });
                }
            } finally {
                purchasingRef.current = false;
                setIsPurchasing(false);
            }
        },
        [addTrade, authData?.currency, balance, haltReason, isAuthorized, pushJournal, pushReporting, setPrimaryViews, updateSession]
    );

    const attemptRecoveryPurchase = useCallback(
        (signal: RecoverySignal) => {
            const market = feedRef.current.selectedMarket;
            const runtime = recoveryRef.current;
            if (!market) return;

            recoveryRef.current = markRecoveryPurchasePending(runtime);
            setRecoveryView(recoveryRef.current);

            void purchase({
                source: 'gui_recovery',
                strategyLabel: 'Even/Odd Recovery',
                contractType: signal.direction === 'ODD' ? 'DIGITODD' : 'DIGITEVEN',
                barrier: null,
                kind: 'recovery',
                label: `${signal.direction} recovery · ${signal.digits.join('')}`,
                setupId: null,
                noteDetails: {
                    pattern: signal.pattern,
                    direction: signal.direction,
                    digits: signal.digits,
                    evenPercent: signal.frequency.evenPercent,
                    oddPercent: signal.frequency.oddPercent,
                    maxEvenPercent: signal.frequency.maxEvenPercent,
                    maxOddPercent: signal.frequency.maxOddPercent,
                    filterEnabled: signal.frequency.enabled,
                    primaryContractId: runtime.contractId,
                },
            });
        },
        [purchase]
    );

    const evaluateTick = useCallback(
        (tickDigit: number, windowTicks: { epoch: number }[], windowStats: DigitWindowStats, parity: ParityStats) => {
            if (statusRef.current !== 'running') return;

            const cfg = configRef.current;
            const market = feedRef.current.selectedMarket;
            if (!market) return;

            const strategies = strategiesFor(cfg.strategy);

            // Primary evaluation pauses while a recovery episode is open: both legs
            // share the single open-contract slot, so a primary entry taken here
            // would refuse the recovery purchase and leave Even/Odd looking dead.
            if (!recoveryRef.current.active)
                strategies.forEach(strategyId => {
                const runtime = primaryRef.current[strategyId];
                const definition = PRIMARY_STRATEGIES[strategyId];
                const result = evaluatePrimaryTick(runtime, {
                    digit: tickDigit,
                    epoch: windowTicks[windowTicks.length - 1]?.epoch ?? Math.floor(Date.now() / 1000),
                    now: Date.now(),
                    stats: windowStats,
                    market: market.apiSymbol,
                    marketName: market.displayName,
                });
                primaryRef.current = { ...primaryRef.current, [strategyId]: result.runtime };

                result.events.forEach(event => {
                    if (event.type === 'pair') {
                        pushJournal({
                            type: 'setup',
                            level: 'info',
                            strategy: definition.label,
                            market: market.displayName,
                            message: `Pair ${event.setup.pair} detected · waiting for confirmation (a digit in {${definition.targetDigits.join(', ')}}); intervening digits never cancel it`,
                            details: {
                                setupId: event.setup.id,
                                pair: event.setup.pair,
                                frequency: event.setup.frequencyAtDetection.readings,
                                threshold: PRIMARY_DIGIT_CEILING,
                            },
                        });
                        return;
                    }

                    if (event.type === 'blocked') {
                        pushJournal({
                            type: 'blocked',
                            level: 'warn',
                            strategy: definition.label,
                            market: market.displayName,
                            message: `Setup ${event.setup.pair} blocked before confirmation · ${event.reason}`,
                            details: { setupId: event.setup.id, pair: event.setup.pair, reason: event.reason },
                        });
                        return;
                    }

                    // Confirmation: the setup is consumed exactly once.
                    if (consumedSetupsRef.current.has(event.setup.id)) return;
                    consumedSetupsRef.current.add(event.setup.id);

                    pushJournal({
                        type: 'confirmed',
                        level: 'success',
                        strategy: definition.label,
                        market: market.displayName,
                        message: `Setup ${event.setup.pair} confirmed by digit ${event.digit} after ${event.ticksWaited} intervening tick${event.ticksWaited === 1 ? '' : 's'}`,
                        details: {
                            setupId: event.setup.id,
                            pair: event.setup.pair,
                            confirmationDigit: event.digit,
                            intervening: event.setup.interveningDigits,
                            ticksWaited: event.ticksWaited,
                        },
                    });

                    // Final frequency revalidation immediately before the proposal.
                    const freshPermission = frequencyPermission(strategyId, windowStats);
                    if (!freshPermission.passed) {
                        const updated = setPrimaryState(primaryRef.current[strategyId], 'SETUP_BLOCKED');
                        primaryRef.current = { ...primaryRef.current, [strategyId]: updated };
                        setDecision({
                            allowed: false,
                            reason: freshPermission.reason,
                            at: Date.now(),
                            label: `${definition.label} · ${event.setup.pair}`,
                        });
                        pushJournal({
                            type: 'blocked',
                            level: 'warn',
                            strategy: definition.label,
                            market: market.displayName,
                            message: `Purchase blocked after confirmation · ${freshPermission.reason}`,
                            details: { setupId: event.setup.id, reason: freshPermission.reason },
                        });
                        return;
                    }

                    const updated = setPrimaryState(primaryRef.current[strategyId], 'TRADE_VALIDATION');
                    primaryRef.current = { ...primaryRef.current, [strategyId]: updated };
                    setPrimaryViews({ ...primaryRef.current });

                    void purchase({
                        source: definition.source,
                        strategyLabel: definition.label,
                        contractType: definition.contractType,
                        barrier: definition.barrier,
                        kind: 'primary',
                        label: `${definition.label} · ${event.setup.pair}`,
                        setupId: event.setup.id,
                        noteDetails: {
                            setupId: event.setup.id,
                            pair: event.setup.pair,
                            confirmationDigit: event.digit,
                            ticksWaited: event.ticksWaited,
                            interfering: event.setup.interveningDigits,
                            frequencyAtDetection: event.setup.frequencyAtDetection.readings,
                        },
                    });
                });
            });

            setPrimaryViews({ ...primaryRef.current });

            // --- recovery evaluation (only after a confirmed primary loss) ------
            if (recoveryRef.current.active) {
                const result = evaluateRecoveryTick(recoveryRef.current, {
                    digit: tickDigit,
                    parity,
                    config: cfg,
                });
                recoveryRef.current = result.runtime;
                setRecoveryView(result.runtime);

                if (result.signal) {
                    if (result.signal.frequency.eligible) {
                        pushJournal({
                            type: 'recovery',
                            level: 'info',
                            strategy: 'Even/Odd Recovery',
                            market: market.displayName,
                            message: `Parity pattern ${result.signal.digits.join('')} (${result.signal.pattern.replace('_', '/')}) · buying ${result.signal.direction}${result.signal.frequency.enabled ? '' : ' · frequency filter disabled'}`,
                            details: {
                                pattern: result.signal.pattern,
                                direction: result.signal.direction,
                                evenPercent: result.signal.frequency.evenPercent,
                                oddPercent: result.signal.frequency.oddPercent,
                            },
                        });
                        attemptRecoveryPurchase(result.signal);
                    } else {
                        pushJournal({
                            type: 'blocked',
                            level: 'warn',
                            strategy: 'Even/Odd Recovery',
                            market: market.displayName,
                            message: `Parity pattern ${result.signal.digits.join('')} did not pass the frequency filter · ${result.signal.frequency.reason}`,
                            details: {
                                pattern: result.signal.pattern,
                                direction: result.signal.direction,
                                reason: result.signal.frequency.reason,
                                evenPercent: result.signal.frequency.evenPercent,
                                oddPercent: result.signal.frequency.oddPercent,
                            },
                        });
                    }
                }
            }
        },
        [attemptRecoveryPurchase, purchase, pushJournal, setPrimaryViews]
    );

    // --- tick stream → controllers -------------------------------------------
    useEffect(() => {
        const ticks = feed.ticks;
        if (ticks.length === 0) return;

        if (statusRef.current !== 'running') {
            processedEpochRef.current = ticks[ticks.length - 1].epoch;
            return;
        }

        let startIndex = ticks.findIndex(tick => tick.epoch > processedEpochRef.current);
        if (startIndex === -1) return;

        for (let index = startIndex; index < ticks.length; index++) {
            const tick = ticks[index];
            if (tick.epoch <= processedEpochRef.current) continue;
            processedEpochRef.current = tick.epoch;

            const windowTicks = ticks.slice(0, index + 1);
            const stats = computeDigitStats(windowTicks);
            const parity = computeParityStats(windowTicks);

            evaluateTick(tick.lastDigit, windowTicks, stats, parity);
        }
    }, [feed.ticks, evaluateTick]);

    // --- configuration persistence -------------------------------------------
    useEffect(() => {
        saveStoredConfig(config);
    }, [config]);

    const setConfig = useCallback((patch: Partial<EngineConfig>) => {
        setConfigState(current => ({ ...current, ...patch }));
    }, []);

    const configErrors = useMemo(() => validateConfig(config), [config]);

    // --- stored session (settled history + counters) --------------------------
    const storedLoadedRef = useRef('');

    useEffect(() => {
        if (!activeLoginid || storedLoadedRef.current === activeLoginid) return;
        storedLoadedRef.current = activeLoginid;
        accountIdRef.current = activeLoginid;

        const stored = loadStoredSession(activeLoginid);
        if (!stored) return;

        if (stored.trades.length > 0) {
            tradesRef.current = stored.trades;
            setTrades(stored.trades);
            stored.trades.forEach(trade => {
                if (trade.contractId) settledRef.current.add(trade.contractId);
            });
        }
        if (stored.journal.length > 0) {
            logRef.current = stored.journal;
            setLog(stored.journal);
        }
        if (stored.metrics) {
            sessionRef.current = { ...stored.metrics, openContracts: 0 };
            setSession(sessionRef.current);
        }
        if (stored.recovery) {
            recoveryRef.current = {
                ...createRecoveryRuntime(),
                attempts: stored.recovery.attempts,
                consecutiveLosses: stored.recovery.consecutiveLosses,
                activatedContracts: stored.recovery.activatedContracts,
            };
            setRecoveryView(recoveryRef.current);
        }
    }, [activeLoginid]);

    useEffect(() => {
        if (!activeLoginid) return;
        saveStoredSession({
            accountId: activeLoginid,
            trades,
            journal: log,
            metrics: session,
            recovery: {
                attempts: recoveryView.attempts,
                consecutiveLosses: recoveryView.consecutiveLosses,
                activatedContracts: recoveryView.activatedContracts,
            },
        });
    }, [activeLoginid, log, recoveryView, session, trades]);

    // --- lifecycle ------------------------------------------------------------
    const reconcileOpenContracts = useCallback(async () => {
        const open = tradesRef.current.filter(trade => trade.status === 'open' && trade.contractId);
        if (open.length === 0) return;

        let stillOpen = 0;
        for (const trade of open) {
            const contractId = trade.contractId as number;
            const update = await fetchContract(contractId);
            if (!update) {
                updateTrade(contractId, {
                    status: 'failed',
                    outcome: 'failed',
                    reason: 'Could not reconcile this contract with Deriv after a reload.',
                });
                continue;
            }
            if (update.isSold) {
                applyContractUpdate(update);
            } else {
                trackedContractsRef.current.add(contractId);
                stillOpen += 1;
            }
        }

        updateSession(current => ({ ...current, openContracts: stillOpen }));
        if (stillOpen > 0) {
            pushJournal({
                type: 'engine',
                level: 'warn',
                strategy: 'Engine',
                market: feedRef.current.selectedMarket?.displayName ?? '—',
                message: `${stillOpen} contract(s) are still open on Deriv — new purchases wait for settlement.`,
                details: { openContracts: stillOpen },
            });
        }
    }, [applyContractUpdate, pushJournal, updateSession, updateTrade]);

    const start = useCallback(async () => {
        const errors = validateConfig(configRef.current);
        if (hasConfigErrors(errors)) {
            setStatus('error');
            setHaltReason('Fix the highlighted settings before starting.');
            return;
        }
        if (!isAuthorized) {
            setStatus('error');
            setHaltReason('Sign in with your Deriv account to start live trading.');
            return;
        }

        const market = feedRef.current.selectedMarket;
        if (!market || !market.isOpen || market.isSuspended) {
            setStatus('error');
            setHaltReason('Select an open volatility market before starting.');
            return;
        }
        if (feedRef.current.connection.status !== 'connected') {
            setStatus('error');
            setHaltReason('The market-data connection is not ready.');
            return;
        }
        if (feedRef.current.ticks.length < ENGINE_WINDOW) {
            setStatus('error');
            setHaltReason(
                `The rolling window needs ${ENGINE_WINDOW} ticks (${feedRef.current.ticks.length} loaded). Try again in a moment.`
            );
            return;
        }

        setStatus('starting');
        setHaltReason(null);

        const freshBalance = await fetchBalance();
        setBalance(freshBalance);

        const fresh: Record<PrimaryStrategyId, PrimaryRuntime> = {
            over1: { ...createPrimaryRuntime('over1'), state: 'MONITORING_FREQUENCY' },
            under8: { ...createPrimaryRuntime('under8'), state: 'MONITORING_FREQUENCY' },
        };
        primaryRef.current = fresh;
        setPrimaryViews(fresh);

        recoveryRef.current = createRecoveryRuntime();
        setRecoveryView(recoveryRef.current);
        consumedSetupsRef.current = new Set();

        await reconcileOpenContracts();

        processedEpochRef.current = feedRef.current.ticks[feedRef.current.ticks.length - 1]?.epoch ?? 0;
        setStatus('running');

        pushJournal({
            type: 'engine',
            level: 'info',
            strategy: 'Engine',
            market: market.displayName,
            message: `Engine started · ${strategyLabel(configRef.current.strategy)} · stake ${configRef.current.initialStake} · take profit ${configRef.current.takeProfit} · stop loss ${configRef.current.stopLoss}`,
            details: {
                market: market.apiSymbol,
                strategy: configRef.current.strategy,
                config: configRef.current,
                balance: freshBalance,
            },
        });
    }, [applyContractUpdate, isAuthorized, pushJournal, reconcileOpenContracts, setStatus]);

    const stop = useCallback(
        (reason = 'Stopped by user') => {
            const stopped = { ...primaryRef.current };
            (Object.keys(stopped) as PrimaryStrategyId[]).forEach(key => {
                stopped[key] = stopPrimaryRuntime(stopped[key]);
            });
            primaryRef.current = stopped;
            setPrimaryViews(stopped);
            recoveryRef.current = stopRecoveryRuntime(recoveryRef.current);
            setRecoveryView(recoveryRef.current);
            setStatus('stopped');
            pushJournal({
                type: 'engine',
                level: 'info',
                strategy: 'Engine',
                market: feedRef.current.selectedMarket?.displayName ?? '—',
                message: `${reason}. New purchases are disabled; open contracts keep settling.`,
                details: { reason },
            });
        },
        [pushJournal, setStatus]
    );

    const pause = useCallback(() => {
        if (statusRef.current !== 'running') return;
        const paused = { ...primaryRef.current };
        (Object.keys(paused) as PrimaryStrategyId[]).forEach(key => {
            const runtime = paused[key];
            if (runtime.pending) {
                paused[key] = {
                    ...runtime,
                    pending: null,
                    previousDigit: null,
                    state: 'SETUP_BLOCKED',
                    lastEvent: {
                        type: 'blocked',
                        setup: { ...runtime.pending, status: 'blocked', blockReason: 'Engine paused — setup invalidated.' },
                        reason: 'Engine paused — setup invalidated.',
                        stage: 'pre_confirmation',
                    },
                };
            } else {
                paused[key] = { ...runtime, previousDigit: null, state: 'WAITING_FOR_PAIR' };
            }
        });
        primaryRef.current = paused;
        setPrimaryViews(paused);
        recoveryRef.current = { ...recoveryRef.current, previousDigit: null, lastTwo: [null, null] };
        setRecoveryView(recoveryRef.current);
        setStatus('paused');
        pushJournal({
            type: 'engine',
            level: 'info',
            strategy: 'Engine',
            market: feedRef.current.selectedMarket?.displayName ?? '—',
            message: 'Engine paused — new entries disabled and pending setups invalidated.',
            details: {},
        });
    }, [pushJournal, setStatus]);

    const resume = useCallback(() => {
        if (statusRef.current !== 'paused') return;
        const errors = validateConfig(configRef.current);
        if (hasConfigErrors(errors)) {
            setHaltReason('Fix the highlighted settings before resuming.');
            return;
        }
        if (feedRef.current.connection.status !== 'connected') {
            setHaltReason('The market-data connection is not ready — cannot resume.');
            return;
        }
        if (feedRef.current.ticks.length < ENGINE_WINDOW) {
            setHaltReason('Reloading the 1,000-tick window — cannot resume yet.');
            return;
        }
        const limit = hardLimitCheck(configRef.current, sessionRef.current);
        if (limit) {
            halt(limit);
            return;
        }

        const resumed = { ...primaryRef.current };
        (Object.keys(resumed) as PrimaryStrategyId[]).forEach(key => {
            resumed[key] = resumePrimaryRuntime(resumed[key]);
        });
        primaryRef.current = resumed;
        setPrimaryViews(resumed);
        recoveryRef.current = { ...recoveryRef.current, previousDigit: null, lastTwo: [null, null] };
        setRecoveryView(recoveryRef.current);
        processedEpochRef.current = feedRef.current.ticks[feedRef.current.ticks.length - 1]?.epoch ?? 0;
        setHaltReason(null);
        setStatus('running');
        pushJournal({
            type: 'engine',
            level: 'success',
            strategy: 'Engine',
            market: feedRef.current.selectedMarket?.displayName ?? '—',
            message: 'Engine resumed after revalidation — pending setups were not restored.',
            details: {},
        });
    }, [halt, pushJournal, setStatus]);

    const resetSession = useCallback(() => {
        sessionRef.current = emptySession();
        setSession(sessionRef.current);
        setHaltReason(null);
        recoveryRef.current = createRecoveryRuntime();
        setRecoveryView(recoveryRef.current);
        const fresh: Record<PrimaryStrategyId, PrimaryRuntime> = {
            over1: createPrimaryRuntime('over1'),
            under8: createPrimaryRuntime('under8'),
        };
        primaryRef.current = fresh;
        setPrimaryViews(fresh);
        setStatus('stopped');
        pushJournal({
            type: 'engine',
            level: 'info',
            strategy: 'Engine',
            market: feedRef.current.selectedMarket?.displayName ?? '—',
            message: 'Session counters reset. Trade history and the journal were kept.',
            details: {},
        });
    }, [pushJournal, setStatus]);

    /** Market changes are refused while the engine can trade. */
    const changeMarket = useCallback(
        (market: Parameters<typeof feed.selectMarket>[0]) => {
            if (statusRef.current !== 'stopped' && statusRef.current !== 'error' && statusRef.current !== 'halted') {
                pushJournal({
                    type: 'blocked',
                    level: 'warn',
                    strategy: 'Engine',
                    market: feedRef.current.selectedMarket?.displayName ?? '—',
                    message: 'Market change refused while the engine is active — stop the engine first.',
                    details: { requested: market.displayName },
                });
                return;
            }
            feed.selectMarket(market);
        },
        [feed, pushJournal]
    );

    // --- Market Scanner hand-off ("Load bot" → GUI Trading Engine) -----------
    // The request is applied once the engine's own market list holds the symbol.
    // Nothing starts trading: the user still presses Start.
    useEffect(() => {
        const applyRequest = () => {
            const request = peekGuiEngineRequest();
            if (!request) return;
            if (statusRef.current !== 'stopped' && statusRef.current !== 'error' && statusRef.current !== 'halted') {
                return;
            }
            const market = feed.markets.find(item => item.apiSymbol === request.symbol);
            if (!market) return;
            if (!market.isOpen || market.isSuspended) return;

            consumeGuiEngineRequest();
            setConfigState(current => ({ ...current, strategy: request.strategy }));
            feed.selectMarket(market);
            pushJournal({
                type: 'engine',
                level: 'info',
                strategy: strategyLabel(request.strategy),
                market: market.displayName,
                message: `Opened from the market scanner — ${strategyLabel(request.strategy)} on ${market.displayName}. Press Start when you are ready.`,
                details: { symbol: market.apiSymbol, strategy: request.strategy, source: 'scanner' },
            });
        };

        applyRequest();
        return subscribeGuiEngineRequests(applyRequest);
    }, [feed.markets, feed.selectMarket, pushJournal]);

    const stakes: StakePreview = useMemo(
        () => stakePreview(config, progressionLosses(session), recoveryView.active ? 'recovery' : 'primary'),
        [config, session, recoveryView.active]
    );

    const strategies = strategiesFor(config.strategy);
    const primaryPermission = useMemo(() => {
        const result: Partial<Record<PrimaryStrategyId, ReturnType<typeof frequencyPermission>>> = {};
        strategies.forEach(strategy => {
            result[strategy] = frequencyPermission(strategy, liveStats);
        });
        return result;
    }, [liveStats, strategies.join(',')]);

    const hardLimit = hardLimitCheck(config, session);

    return {
        config,
        setConfig,
        configErrors,
        status,
        haltReason,
        session,
        winRate: winRate(session),
        trades,
        journal: log,
        primaryViews,
        recoveryView,
        liveStats,
        liveParity,
        decision,
        balance,
        isPurchasing,
        stakes,
        primaryPermission,
        hardLimit,
        isAuthorized,
        account: authData,
        activeLoginid,
        feed,
        changeMarket,
        start,
        stop,
        pause,
        resume,
        resetSession,
    };
}

function hardLimitCheck(config: EngineConfig, session: SessionMetrics): string | null {
    if (session.profit >= config.takeProfit) {
        return `Take profit reached (${session.profit.toFixed(2)} ≥ ${config.takeProfit}).`;
    }
    if (session.profit <= -config.stopLoss) {
        return `Stop loss reached (${session.profit.toFixed(2)} ≤ -${config.stopLoss}).`;
    }
    if (session.consecutiveLosses >= config.maxConsecutiveLosses) {
        return `Maximum consecutive losses reached (${session.consecutiveLosses}/${config.maxConsecutiveLosses}).`;
    }
    return null;
}
