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
import { scanMarkets } from './scanner';
import { buildSignal, nextConfigVersion } from './strategy-engine';
import { validateRisk, shouldStopSession } from './risk-manager';
import { ExecutionEngine, type ExecutionCallbacks } from './execution-engine';
import { createSession, recordOpen, recordSettlement, stopSession } from './session-manager';
import type {
    AuthState,
    BotState,
    ExecutionResult,
    JournalEntry,
    MarketRanking,
    OpenContractInfo,
    ProposalInfo,
    RiskCheckResult,
    ScannerConfig,
    SessionStats,
    StopReason,
    StrategyConfig,
    StrategySignal,
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
    openContracts: OpenContractInfo[];
    journal: JournalEntry[];
    isScanning: boolean;
    configVersion: number;
    scanError: string | null;
}

export type BotEngineListener = (state: BotEngineState) => void;

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

    constructor(settings: TradingSettings, strategies: StrategyConfig[], scannerConfig: ScannerConfig) {
        this.settings = settings;
        this.strategies = strategies;
        this.scannerConfig = scannerConfig;
        this.authWs = new AuthTradingWebSocket();
        this.state = {
            botState: 'Stopped',
            auth: {
                status: 'disconnected',
                loginid: null,
                isVirtual: true,
                balance: null,
                currency: null,
                errorMessage: null,
            },
            session: createSession(),
            rankings: [],
            lastSignal: null,
            lastRiskCheck: null,
            lastExecution: null,
            lastProposal: null,
            openContracts: [],
            journal: [],
            isScanning: false,
            configVersion: 0,
            scanError: null,
        };
    }

    // ── Public API ────────────────────────────────────────────────────────────

    subscribe(listener: BotEngineListener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }

    getState(): BotEngineState {
        return { ...this.state, openContracts: [...this.state.openContracts], journal: [...this.state.journal] };
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
                status: status.authorized
                    ? 'authorized'
                    : status.connected
                      ? 'connecting'
                      : 'disconnected',
                loginid: status.loginid,
                isVirtual: status.isVirtual,
                balance: status.balance,
                currency: status.currency,
                errorMessage: status.error,
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
            },
        });
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

        // Demo-first: warn if real mode.
        if (this.settings.accountMode === 'real') {
            this.log('warning', 'start', 'Real-money mode is enabled. Trades will use your real account.');
        } else {
            this.log('info', 'start', 'Demo mode started. Trades use the demo account.');
        }

        this.isRunning = true;
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
            openContracts: [],
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
            if (this.isRunning && this.state.botState !== 'Contract Open' && this.state.botState !== 'Executing') {
                this.runScan();
            }
        }, this.scannerConfig.scanIntervalMs);
    }

    /** Stop the bot — prevents new entries immediately. Open contracts continue monitoring. */
    stop(): void {
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

    /** Pause scanning (keeps monitoring open contracts). */
    pause(): void {
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
            if (this.isRunning && this.state.botState !== 'Contract Open' && this.state.botState !== 'Executing') {
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
            this.update({ rankings, botState: this.isRunning ? 'Scanning' : this.state.botState });

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
            this.state.openContracts.length,
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
        this.update({ botState: 'Awaiting Confirmation' });

        const currency = this.state.auth.currency ?? 'USD';

        const callbacks: ExecutionCallbacks = {
            onProposal: (info, error) => {
                if (error) {
                    this.log('trade', 'execution', `Proposal error: ${error}`);
                } else if (info) {
                    this.update({ lastProposal: info, botState: 'Awaiting Confirmation' });
                    this.log('trade', 'execution', `Proposal received: ${info.longcode} — ask ${info.askPrice}`);
                }
            },
            onBuy: (result, error) => {
                if (error) {
                    this.log('trade', 'execution', `Buy rejected: ${error}`);
                    this.update({ botState: 'Scanning' });
                } else if (result) {
                    this.log('trade', 'execution', `Contract purchased: #${result.contractId} — stake ${result.buyPrice}`);
                    this.lastTradeAt = Date.now();
                    this.state.session = recordOpen(this.state.session, this.state.auth.balance);
                    this.update({
                        botState: 'Contract Open',
                        session: this.state.session,
                    });
                }
            },
            onContractUpdate: (contract) => {
                const existing = this.state.openContracts.findIndex(c => c.contractId === contract.contractId);
                const openContracts = [...this.state.openContracts];
                if (existing >= 0) {
                    openContracts[existing] = contract;
                } else {
                    openContracts.push(contract);
                }
                this.update({ openContracts });
            },
            onSettled: (result) => {
                this.log('trade', 'execution', result.message);
                this.state.session = recordSettlement(this.state.session, result);
                this.update({
                    lastExecution: result,
                    session: this.state.session,
                    openContracts: this.state.openContracts.filter(c => c.contractId !== result.contractId),
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

        this.update({ botState: 'Executing' });

        if (this.executionEngine) {
            await this.executionEngine.execute(signal, currency, callbacks);
        }
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
