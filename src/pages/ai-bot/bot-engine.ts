/**
 * Bot Engine — orchestrates the eight independent services:
 * 1. Market-data service (public WS via the scanner)
 * 2. Digit-analysis engine (analysis-engine.ts)
 * 3. AI market scanner (scanner.ts)
 * 4. Strategy evaluation engine (strategy-engine.ts)
 * 5. Risk manager (risk-manager.ts)
 * 6. Order execution service (execution-engine.ts)
 * 7. Open-contract monitor (execution-engine.ts message handler)
 * 8. Session journal (session-manager.ts + journal entries)
 *
 * The engine runs a scan loop, evaluates strategies deterministically, runs
 * risk checks, and executes trades via the authenticated WebSocket. It never
 * bypasses a risk limit, never uses Martingale, and never fabricates results.
 */

import { AuthTradingWebSocket, type AuthWsStatus } from './auth-ws';
import { getAuthInfo, getDerivAccounts, getActiveLoginId } from '@/external/deriv-core';
import { scanMarkets } from './scanner';
import { buildSignal, describePrediction, nextConfigVersion } from './strategy-engine';
import { validateRisk, shouldStopSession } from './risk-manager';
import { ExecutionEngine, type ExecutionCallbacks } from './execution-engine';
import { createSession, recordOpen, recordSettlement, stopSession } from './session-manager';
import { applyContractUpdate, applySettlement, createPosition, openPositions } from './trade-ledger';
import type {
    AuthAccount,
    AuthDiagnostics,
    AuthState,
    AuthStatus,
    BotState,
    ExecutionResult,
    JournalEntry,
    MarketRanking,
    PendingTrade,
    ProposalInfo,
    RiskCheckResult,
    ScannerConfig,
    SessionStats,
    StopReason,
    StrategyConfig,
    StrategySignal,
    TradeOrderDetails,
    TradePosition,
    TradingSettings,
} from './types';

export interface BotEngineState {
    botState: BotState;
    auth: AuthState;
    session: SessionStats;
    rankings: MarketRanking[];
    lastSignal: StrategySignal | null;
    lastRiskCheck: RiskCheckResult | null;
    lastExecution: ExecutionResult | null;
    lastProposal: ProposalInfo | null;
    /**
     * A real-money entry held back until the user approves it. While this is
     * set the engine has placed no order and is waiting for Confirm/Cancel.
     */
    pendingTrade: PendingTrade | null;
    /**
     * Every position the bot opened this session, newest last. Open positions
     * carry live contract updates; settled ones keep their settlement result.
     */
    positions: TradePosition[];
    journal: JournalEntry[];
    isScanning: boolean;
    configVersion: number;
    scanError: string | null;
}

export type BotEngineListener = (state: BotEngineState) => void;

/**
 * The engine's starting state. Exported so the React layer can render a valid
 * snapshot before the engine instance exists (the first render happens before
 * the mount effect creates it).
 */
export function createBotEngineState(): BotEngineState {
    return {
        botState: 'Stopped',
        auth: {
            status: 'disconnected',
            loginid: null,
            isVirtual: true,
            balance: null,
            currency: null,
            errorMessage: null,
            accounts: [],
            diagnostics: {
                wsState: 'disconnected',
                authPhase: 'none',
                accountAuthorized: false,
                tradePermitted: false,
                marketDataState: 'idle',
                lastAuthAt: null,
                lastError: null,
                reconnectAttempt: 0,
                retrying: false,
            },
        },
        session: createSession(),
        rankings: [],
        lastSignal: null,
        lastRiskCheck: null,
        lastExecution: null,
        lastProposal: null,
        pendingTrade: null,
        positions: [],
        journal: [],
        isScanning: false,
        configVersion: 0,
        scanError: null,
    };
}

export class BotEngine {
    private authWs: AuthTradingWebSocket;
    private executionEngine: ExecutionEngine | null = null;
    private settings: TradingSettings;
    private strategies: StrategyConfig[];
    private scannerConfig: ScannerConfig;
    private state: BotEngineState;
    private listeners = new Set<BotEngineListener>();
    private scanTimer: ReturnType<typeof setInterval> | null = null;
    private isRunning = false;
    private isScanning = false;
    private lastTradeAt: number | null = null;
    private lastSignalId: string | null = null;
    private configVersion = 0;
    private offAuthStatus: (() => void) | null = null;
    /** Real-money entry held for user approval: its signal, callbacks and quote. */
    private pendingEntry: {
        signal: StrategySignal;
        currency: string;
        callbacks: ExecutionCallbacks;
        quote: Promise<ProposalInfo | null>;
    } | null = null;

    constructor(settings: TradingSettings, strategies: StrategyConfig[], scannerConfig: ScannerConfig) {
        this.settings = settings;
        this.strategies = strategies;
        this.scannerConfig = scannerConfig;
        this.authWs = new AuthTradingWebSocket();
        this.state = createBotEngineState();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    subscribe(listener: BotEngineListener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }

    getState(): BotEngineState {
        return { ...this.state, positions: [...this.state.positions], journal: [...this.state.journal] };
    }

    updateSettings(settings: TradingSettings): void {
        this.settings = settings;
        this.configVersion = nextConfigVersion();
        this.update({ configVersion: this.configVersion });
    }

    updateStrategies(strategies: StrategyConfig[]): void {
        this.strategies = strategies;
        this.configVersion = nextConfigVersion();
        this.update({ configVersion: this.configVersion });
    }

    updateScannerConfig(config: ScannerConfig): void {
        this.scannerConfig = config;
    }

    /** Connect the authenticated WebSocket (for account info + trading). */
    async connectAuth(): Promise<void> {
        this.offAuthStatus?.();
        this.offAuthStatus = this.authWs.onStatus((status: AuthWsStatus) => {
            const authState: AuthState = {
                status: mapAuthStatus(status),
                loginid: status.loginid,
                isVirtual: status.isVirtual,
                balance: status.balance,
                currency: status.currency,
                errorMessage: status.error,
                accounts: buildAccountList(status.loginid),
                diagnostics: buildDiagnostics(status, this.state.botState),
            };
            this.update({ auth: authState });
        });
        await this.authWs.connect();
    }

    /** Disconnect the authenticated WebSocket. */
    disconnectAuth(): void {
        this.offAuthStatus?.();
        this.offAuthStatus = null;
        this.authWs.disconnect();
        this.update({
            auth: {
                status: 'disconnected',
                loginid: null,
                isVirtual: true,
                balance: null,
                currency: null,
                errorMessage: null,
                accounts: buildAccountList(null),
                diagnostics: emptyDiagnostics(),
            },
        });
    }

    /**
     * Switch the active account. Writes the chosen loginid to localStorage (the
     * same key the OTP flow honours), then reconnects so a fresh OTP URL is
     * obtained for that account. Never silently falls back to another account.
     */
    async selectAccount(loginid: string): Promise<void> {
        const accounts = getDerivAccounts() ?? [];
        const exists = accounts.some(a => a.account_id === loginid);
        if (!exists) {
            this.log('warning', 'auth', `Account ${loginid} is not in the authorized account list.`);
            return;
        }
        localStorage.setItem('active_loginid', loginid);
        this.log('info', 'auth', `Switching account to ${loginid}. Re-authorizing…`);
        this.disconnectAuth();
        // Brief yield so the close fully settles before reopening.
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.connectAuth();
    }

    /** Start the bot — begins the scan loop. */
    async start(): Promise<void> {
        if (this.isRunning) return;

        // Require authorization before starting.
        if (this.state.auth.status !== 'authorized') {
            this.log('error', 'start', 'Cannot start: account not authorized. Log in first.');
            this.update({ botState: 'Error' });
            return;
        }

        // Verify the authorized account matches the selected execution mode.
        // Never silently fall back from Demo to Real or vice versa.
        const authorizedIsDemo = this.state.auth.isVirtual;
        if (this.settings.accountMode === 'demo' && !authorizedIsDemo) {
            this.log('error', 'start', 'Cannot start in Demo mode: the authorized account is a Real account. Switch to the Demo account first.');
            this.update({ botState: 'Error' });
            return;
        }
        if (this.settings.accountMode === 'real' && authorizedIsDemo) {
            this.log('error', 'start', 'Cannot start in Real mode: the authorized account is a Demo account. Switch to the Real account and confirm.');
            this.update({ botState: 'Error' });
            return;
        }

        // Demo-first: warn if real mode.
        if (this.settings.accountMode === 'real') {
            this.log('warning', 'start', 'Real-money mode is enabled. Trades will use your real account.');
        } else {
            this.log('info', 'start', 'Demo mode started. Trades use the demo account.');
        }

        this.isRunning = true;
        this.pendingEntry = null;
        this.configVersion = nextConfigVersion();
        this.state.session = createSession();
        this.update({
            botState: 'Scanning',
            session: this.state.session,
            configVersion: this.configVersion,
            lastSignal: null,
            lastRiskCheck: null,
            lastExecution: null,
            lastProposal: null,
            pendingTrade: null,
            positions: [],
        });

        // Create the execution engine with the auth WS.
        this.executionEngine = new ExecutionEngine(
            (msg) => this.authWs.send(msg),
            (msg, timeout) => this.authWs.sendAndWait(msg, timeout),
            (handler) => this.authWs.onMessage(handler),
            () => this.settings
        );

        this.log('info', 'start', `Bot started. Mode: ${this.settings.accountMode}. Strategies: ${this.strategies.filter(s => s.enabled).map(s => s.label).join(', ') || 'none'}.`);

        // Start scanning immediately, then on interval.
        await this.runScan();
        this.scanTimer = setInterval(() => {
            if (this.isRunning && !this.isBotBusy()) {
                this.runScan();
            }
        }, this.scannerConfig.scanIntervalMs);
    }

    /** Stop the bot — prevents new entries immediately. Open contracts continue monitoring. */
    stop(): void {
        // A held real-money entry is dropped, never executed, on stop.
        this.cancelPendingTrade('Stopped');
        this.isRunning = false;
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
        this.executionEngine?.cancelProposal();
        this.state.session = stopSession(this.state.session, 'manual');
        this.update({ botState: 'Stopped', session: this.state.session });
        this.log('info', 'stop', 'Bot stopped by user. New entries prevented.');
    }

    /** Run a single scan cycle on demand (even when the bot is stopped). */
    async scanNow(): Promise<void> {
        await this.runScan();
    }

    /**
     * Approve the real-money entry the bot is holding: submit the order for the
     * quote shown in the dialog (or a fresh proposal when none was quoted).
     */
    async confirmPendingTrade(): Promise<void> {
        const entry = this.pendingEntry;
        if (!entry) return;

        this.pendingEntry = null;
        this.update({ pendingTrade: null, botState: 'Executing' });
        this.log('info', 'trade', 'Order confirmed — submitting the trade.');

        const execution = this.executionEngine;
        if (!execution) return;

        // The quote requested when the dialog opened (usually already resolved).
        const proposal = await entry.quote;
        if (proposal) {
            await execution.buyPrepared(entry.callbacks);
        } else {
            await execution.execute(entry.signal, entry.currency, entry.callbacks);
        }
    }

    /** Reject the entry the bot is holding. Nothing is bought. */
    cancelPendingTrade(nextState?: BotState): void {
        if (!this.pendingEntry) return;

        this.pendingEntry = null;
        this.executionEngine?.cancelPending();
        this.update({
            pendingTrade: null,
            botState: nextState ?? (this.isRunning ? 'Scanning' : 'Stopped'),
        });
        this.log('info', 'trade', 'Real-money trade cancelled — no order was placed.');
    }

    /** Pause scanning (keeps monitoring open contracts). */
    pause(): void {
        this.cancelPendingTrade('Paused');
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
        this.update({ botState: 'Paused' });
        this.log('info', 'pause', 'Bot paused.');
    }

    /** Resume scanning after pause. */
    resume(): void {
        if (!this.isRunning) return;
        this.update({ botState: 'Scanning' });
        this.runScan();
        this.scanTimer = setInterval(() => {
            if (this.isRunning && !this.isBotBusy()) {
                this.runScan();
            }
        }, this.scannerConfig.scanIntervalMs);
        this.log('info', 'resume', 'Bot resumed.');
    }

    destroy(): void {
        this.stop();
        this.executionEngine?.destroy();
        this.executionEngine = null;
        this.disconnectAuth();
    }

    // ── Scan loop ─────────────────────────────────────────────────────────────

    private async runScan(): Promise<void> {
        if (this.isScanning) return;
        this.isScanning = true;
        this.update({ isScanning: true, scanError: null });

        try {
            const rankings = await scanMarkets(this.scannerConfig, this.strategies);
            // Never clobber the state of an entry that is executing or pending.
            if (this.isBotBusy()) this.update({ rankings });
            else this.update({ rankings, botState: this.isRunning ? 'Scanning' : this.state.botState });

            if (this.isRunning) {
                await this.processRankings(rankings);
            }
        } catch (error) {
            const msg = (error as Error).message;
            this.update({ scanError: msg });
            this.log('error', 'scanner', `Scan failed: ${msg}`);
            if (this.isRunning) this.update({ botState: 'Data Interrupted' });
        } finally {
            this.isScanning = false;
            this.update({ isScanning: false });
        }
    }

    private async processRankings(rankings: MarketRanking[]): Promise<void> {
        // One entry at a time — never queue a trade behind a pending one.
        if (this.pendingEntry) return;

        // Find the best qualifying market.
        const qualifying = rankings.filter(r => r.qualifies);

        if (qualifying.length === 0) {
            if (this.state.botState === 'Scanning' || this.state.botState === 'Setup Detected') {
                this.update({ botState: 'Scanning' });
            }
            return;
        }

        const best = qualifying[0];
        this.update({ botState: 'Setup Detected' });
        this.log('signal', 'scanner', `Setup detected: ${best.displayName} — ${best.strategyLabel} — ${best.reason}`);

        // Build the signal.
        const signal = buildSignal(best, this.settings, this.configVersion, best.analysis.lastTickAt);
        if (!signal) return;

        this.update({ lastSignal: signal, botState: 'Risk Check' });

        // Run risk checks.
        const riskCheck = validateRisk(
            signal,
            this.settings,
            this.state.session,
            this.state.auth,
            openPositions(this.state.positions).length,
            this.lastTradeAt,
            this.lastSignalId
        );

        this.update({ lastRiskCheck: riskCheck });

        if (!riskCheck.passed) {
            this.log('risk', 'risk', `Entry rejected: ${riskCheck.reason ?? 'risk check failed'}`);
            this.lastSignalId = signal.id;
            this.update({ botState: 'Scanning' });
            return;
        }

        this.log('risk', 'risk', 'Risk checks passed. Proceeding to execution.');

        // Check session stop conditions before executing.
        const stopReason = shouldStopSession(this.state.session, this.settings);
        if (stopReason) {
            this.handleStop(stopReason);
            return;
        }

        // Execute the trade.
        this.lastSignalId = signal.id;

        const currency = this.state.auth.currency ?? 'USD';

        const callbacks: ExecutionCallbacks = {
            onProposal: (info, error) => {
                if (error) {
                    this.log('trade', 'execution', `Proposal error: ${error}`);
                } else if (info) {
                    this.update({ lastProposal: info });
                    this.log('trade', 'execution', `Proposal received: ${info.longcode} — ask ${info.askPrice}`);
                }
            },
            onQuoteRefreshed: (info) => {
                this.update({ lastProposal: info });
                this.log('warning', 'trade', `Quote refreshed before purchase (market moved): ask ${info.askPrice}, payout ${info.payout}.`);
            },
            onBuy: (result, error) => {
                if (error) {
                    this.log('trade', 'execution', `Buy rejected: ${error}`);
                    this.update({ botState: 'Scanning' });
                } else if (result) {
                    const position = createPosition({
                        contractId: result.contractId,
                        buyPrice: result.buyPrice,
                        payout: result.payout,
                        contractType: signal.contractType,
                        symbol: signal.symbol,
                        strategyLabel: signal.strategyLabel,
                        settings: this.settings,
                        loginid: this.state.auth.loginid,
                        openedAt: Date.now(),
                    });
                    this.log(
                        'trade',
                        'execution',
                        `Position opened: #${position.contractId} ${position.symbol} ${position.contractType} — stake ${position.stake} — contract status: open.`
                    );
                    this.lastTradeAt = Date.now();
                    this.state.session = recordOpen(this.state.session, this.state.auth.balance);
                    this.update({
                        botState: 'Contract Open',
                        session: this.state.session,
                        positions: [...this.state.positions, position],
                    });
                }
            },
            onContractUpdate: (contract) => {
                // Live contract status, spot and profit/loss for that position.
                this.update({ positions: applyContractUpdate(this.state.positions, contract) });
            },
            onSettled: (result) => {
                const closed = this.state.positions.find(p => p.contractId === result.contractId);
                this.log('trade', 'execution', describeSettlement(result, closed));
                this.state.session = recordSettlement(this.state.session, result);
                this.update({
                    lastExecution: result,
                    session: this.state.session,
                    positions: applySettlement(this.state.positions, result),
                });

                // Check stop conditions after settlement.
                const stopReason = shouldStopSession(this.state.session, this.settings);
                if (stopReason) {
                    this.handleStop(stopReason);
                    return;
                }

                // Auto-restart or cooldown.
                if (this.settings.autoRestartAfterContract && this.isRunning) {
                    this.update({ botState: 'Cooldown' });
                    setTimeout(() => {
                        if (this.isRunning) {
                            this.update({ botState: 'Scanning' });
                            this.runScan();
                        }
                    }, this.settings.cooldownMs);
                } else if (this.isRunning) {
                    this.update({ botState: 'Scanning' });
                }
            },
            onError: (message) => {
                this.log('error', 'execution', message);
                this.update({ botState: 'Scanning' });
            },
        };

        // Real-money entries are held back until the user approves the order.
        if (this.settings.accountMode === 'real') {
            await this.openConfirmation(signal, currency, callbacks);
            return;
        }

        this.update({ botState: 'Executing' });

        if (this.executionEngine) {
            await this.executionEngine.execute(signal, currency, callbacks);
        }
    }

    /**
     * Hold a real-money entry for explicit approval. A live quote is requested
     * up front so the dialog shows the real price, payout and Deriv contract
     * description; nothing is bought until `confirmPendingTrade` is called.
     */
    private async openConfirmation(
        signal: StrategySignal,
        currency: string,
        callbacks: ExecutionCallbacks
    ): Promise<void> {
        const execution = this.executionEngine;
        if (!execution) return;

        const order: TradeOrderDetails = {
            symbol: signal.symbol,
            displayName: signal.analysis.displayName ?? null,
            strategyLabel: signal.strategyLabel,
            contractType: signal.contractType,
            prediction: describePrediction(signal),
            stake: this.settings.stake,
            maxStake: this.settings.maxStake,
            duration: this.settings.duration,
            durationUnit: this.settings.durationUnit,
            currency,
            accountMode: this.settings.accountMode,
            loginid: this.state.auth.loginid,
            balance: this.state.auth.balance,
        };

        const pendingTrade: PendingTrade = {
            id: signal.id,
            order,
            quote: null,
            quoteError: null,
            requestedAt: Date.now(),
        };
        this.update({ pendingTrade, botState: 'Awaiting Confirmation' });
        this.log(
            'info',
            'trade',
            `Real-money trade awaiting your confirmation — ${order.prediction} on ${order.symbol}, stake ${order.stake} ${currency}.`
        );

        // Quote-only callbacks: a quote failure must leave the dialog open (it is
        // reported there), not flip the bot state, so these stay silent.
        const quote = execution.prepare(signal, currency, {
            ...callbacks,
            onProposal: () => undefined,
            onError: () => undefined,
        });
        this.pendingEntry = { signal, currency, callbacks, quote };

        const proposal = await quote;
        // Confirmed or cancelled while the quote was in flight — nothing to show.
        if (!this.pendingEntry || this.state.pendingTrade?.id !== pendingTrade.id) return;
        this.update({
            pendingTrade: {
                ...pendingTrade,
                quote: proposal,
                quoteError: proposal
                    ? null
                    : 'Live quote unavailable right now — a fresh proposal is requested when you confirm.',
            },
        });
    }

    private handleStop(reason: Exclude<StopReason, null>): void {
        this.isRunning = false;
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = null;
        }
        this.state.session = stopSession(this.state.session, reason);
        this.update({ botState: 'Stopped', session: this.state.session });
        this.log('warning', 'session', `Session stopped: ${reason.replace(/_/g, ' ')}`);
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    /** True while an entry is executing, open, or waiting for the user. */
    private isBotBusy(): boolean {
        return (
            this.state.botState === 'Contract Open' ||
            this.state.botState === 'Executing' ||
            this.state.botState === 'Awaiting Confirmation'
        );
    }

    private log(level: JournalEntry['level'], category: string, message: string): void {
        const entry: JournalEntry = {
            id: `j_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            level,
            category,
            message,
        };
        this.state.journal = [...this.state.journal, entry].slice(-200);
    }

    private update(patch: Partial<BotEngineState>): void {
        this.state = { ...this.state, ...patch };
        const snapshot = this.getState();
        this.listeners.forEach(listener => listener(snapshot));
    }
}

/** Journal line for a closed position: settlement result + contract status. */
function describeSettlement(result: ExecutionResult, position: TradePosition | undefined): string {
    const outcome = result.status === 'won' ? 'won' : result.status === 'lost' ? 'lost' : 'settled';
    const profit = result.profit ?? 0;
    const parts = [
        `Position closed: #${result.contractId}`,
        position ? `${position.symbol} ${position.contractType}` : null,
        `settlement: ${outcome.toUpperCase()} ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`,
        position?.contractStatus ? `contract status: ${position.contractStatus}` : null,
    ];
    return `${parts.filter(Boolean).join(' — ')}.`;
}

// ── Auth-state mapping helpers ──────────────────────────────────────────────

/** Map the raw auth-socket status to the UI AuthStatus state-machine value. */
function mapAuthStatus(status: AuthWsStatus): AuthStatus {
    if (status.authorized) return 'authorized';
    if (status.authPhase === 'no_token') return 'authorization_required';
    if (status.authPhase === 'failed') return 'error';
    if (status.authPhase === 'balance_error') return 'error';
    if (status.wsState === 'reconnecting') return 'reconnecting';
    if (status.wsState === 'connecting') return 'connecting';
    if (status.connected) return 'connecting'; // socket open, still loading balance
    return 'disconnected';
}

/** Build the account list from the stored Deriv accounts, marking the active one. */
function buildAccountList(activeLoginid: string | null): AuthAccount[] {
    const accounts = getDerivAccounts() ?? [];
    const active = activeLoginid ?? getActiveLoginId();
    return accounts
        .filter(a => !a.status || a.status === 'active')
        .map(a => ({
            loginid: a.account_id,
            accountType: a.account_type,
            currency: a.currency || 'USD',
            balance: parseFloat(a.balance) || 0,
            status: a.status ?? null,
            isActive: a.account_id === active,
        }));
}

function buildDiagnostics(status: AuthWsStatus, botState: BotState): AuthDiagnostics {
    const authInfo = getAuthInfo();
    return {
        wsState: status.wsState,
        authPhase: status.authPhase,
        accountAuthorized: status.authorized,
        tradePermitted: Boolean(authInfo?.access_token),
        marketDataState: botState === 'Data Interrupted' ? 'error' : 'connected',
        lastAuthAt: status.lastAuthAt,
        lastError: status.lastError ?? status.error,
        reconnectAttempt: status.reconnectAttempt,
        retrying: status.wsState === 'reconnecting' || status.reconnectAttempt > 0,
    };
}

function emptyDiagnostics(): AuthDiagnostics {
    return {
        wsState: 'disconnected',
        authPhase: 'none',
        accountAuthorized: false,
        tradePermitted: Boolean(getAuthInfo()?.access_token),
        marketDataState: 'idle',
        lastAuthAt: null,
        lastError: null,
        reconnectAttempt: 0,
        retrying: false,
    };
}
