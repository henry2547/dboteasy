/**
 * Scanner store — the orchestration layer.
 *
 * Wires the eight stages together:
 *   1. market-data service   (ScannerMarketService — public socket)
 *   2. digit-analysis engine (scanner-analysis — pure)
 *   3. AI market scanner      (scanner-analysis — ranking + reasons)
 *   4. strategy evaluation    (scanner-engine — deterministic signals)
 *   5. risk manager           (risk-manager — independent checks)
 *   6. order execution        (execution-service — authenticated socket)
 *   7. open-contract monitor  (execution-service — proposal_open_contract)
 *   8. session journal        (this store)
 *
 * The AI scanner ranks and explains; the deterministic engine decides; the
 * risk manager vetoes; the execution service only acts on real Deriv quotes.
 * No stage is allowed to bypass a risk limit or fabricate a result.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import { evaluateMarket, rankMarkets } from './scanner-analysis';
import { configVersion, defaultScannerConfig, validateConfig } from './scanner-config';
import { evaluateStrategy, explainNoSignal } from './scanner-engine';
import { ExecutionService } from './execution-service';
import { checkRisk, isDuplicateSignal, type RiskContext } from './risk-manager';
import { ScannerMarketService } from './scanner-market-service';
import type {
    BotState,
    ContractRecord,
    JournalEntry,
    JournalLevel,
    MarketScan,
    MarketSymbol,
    NormalizedTick,
    RiskCheckResult,
    ScannerConfig,
    SessionStats,
    StrategySignal,
} from './scanner-types';

const SCAN_INTERVAL_MS = 1000;

function emptySession(): SessionStats {
    return {
        startedAt: null,
        trades: 0,
        wins: 0,
        losses: 0,
        realizedPnl: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        openContracts: 0,
        stopReason: null,
    };
}

export class ScannerStore {
    config: ScannerConfig = defaultScannerConfig();
    state: BotState = 'Stopped';
    connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error' = 'idle';
    markets: MarketSymbol[] = [];
    rankings: MarketScan[] = [];
    lastSignal: StrategySignal | null = null;
    lastRiskCheck: RiskCheckResult | null = null;
    lastExecution: ContractRecord | null = null;
    session: SessionStats = emptySession();
    journal: JournalEntry[] = [];
    openContracts: ContractRecord[] = [];
    authorized = false;
    activeLoginid: string | null = null;
    realArmed = false;
    errorMessage: string | null = null;

    private marketService: ScannerMarketService | null = null;
    private execution = new ExecutionService();
    private scanTimer: ReturnType<typeof setInterval> | null = null;
    private journalCounter = 0;
    private actionedSignalIds = new Set<string>();
    private lastEntryAt: number | null = null;
    private lastSignalAt: number | null = null;
    private dailyLoss = 0;
    private lastTickAt = 0;

    constructor() {
        makeAutoObservable(this, {
            marketService: false,
            execution: false,
            scanTimer: false,
            journalCounter: false,
            actionedSignalIds: false,
            lastEntryAt: false,
            lastSignalAt: false,
            dailyLoss: false,
            lastTickAt: false,
        });
    }

    // --- computed -----------------------------------------------------------

    get topMarket(): MarketScan | null {
        return this.rankings.length > 0 ? this.rankings[0] : null;
    }

    get marketsScanned(): number {
        return this.markets.length;
    }

    get remainingLossAllowance(): number | null {
        if (this.session.stopReason) return 0;
        return Math.max(0, this.config.sessionLossLimit + this.session.realizedPnl);
    }

    get profitTargetProgress(): number | null {
        if (this.config.sessionProfitTarget <= 0) return null;
        return Math.min(100, (this.session.realizedPnl / this.config.sessionProfitTarget) * 100);
    }

    get configProblems(): string[] {
        return validateConfig(this.config);
    }

    // --- config actions -----------------------------------------------------

    setConfig(patch: Partial<ScannerConfig>): void {
        this.config = { ...this.config, ...patch };
    }

    toggleStrategy(id: string, enabled: boolean): void {
        this.config.strategies = this.config.strategies.map(s => (s.id === id ? { ...s, enabled } : s));
    }

    setStrategyDigit(id: string, digit: number | null): void {
        this.config.strategies = this.config.strategies.map(s => (s.id === id ? { ...s, digit } : s));
    }

    setAccountMode(mode: 'demo' | 'real'): void {
        // Never silently switch to Real — require explicit arming.
        if (mode === 'real') {
            this.config.accountMode = 'real';
            this.realArmed = false;
        } else {
            this.config.accountMode = 'demo';
            this.realArmed = false;
        }
    }

    armReal(): void {
        this.realArmed = true;
    }

    setAuthState(authorized: boolean, loginid: string | null): void {
        this.authorized = authorized;
        this.activeLoginid = loginid;
        if (!authorized) this.realArmed = false;
    }

    // --- lifecycle ----------------------------------------------------------

    start(): void {
        const problems = this.configProblems;
        if (problems.length > 0) {
            this.errorMessage = problems.join(' ');
            this.state = 'Error';
            return;
        }
        // Scanning is read-only (public market data) and may run without an
        // account. Execution is gated separately by the risk manager, which
        // rejects any entry while the account is not authorized — and again
        // when Real mode has not been explicitly armed.
        this.session = emptySession();
        this.session.startedAt = Date.now();
        this.openContracts = [];
        this.actionedSignalIds = new Set<string>();
        this.lastEntryAt = null;
        this.lastSignalAt = null;
        this.dailyLoss = Math.min(this.dailyLoss, 0);
        this.errorMessage = null;

        this.marketService = new ScannerMarketService({
            windowSize: this.config.analysisWindow,
            onMarkets: markets => runInAction(() => { this.markets = markets; }),
            onConnection: state => runInAction(() => { this.connection = state.status as any; }),
            onTick: () => { this.lastTickAt = Date.now(); },
        });
        this.marketService.start();
        this.state = 'Scanning';
        this.addJournal('info', 'Bot started — scanning eligible markets.');
        this.startScanLoop();
    }

    stop(): void {
        this.scanTimer && clearInterval(this.scanTimer);
        this.scanTimer = null;
        this.marketService?.stop();
        this.marketService = null;
        this.execution.dispose();
        // Cancel pending entries; existing open contracts continue to be monitored.
        this.state = 'Stopped';
        this.addJournal('info', 'Bot stopped — no new entries will be placed.');
    }

    pause(): void {
        if (this.state === 'Scanning' || this.state === 'SetupDetected') {
            this.state = 'Paused';
            this.addJournal('info', 'Bot paused.');
        }
    }

    resume(): void {
        if (this.state === 'Paused') {
            this.state = 'Scanning';
            this.addJournal('info', 'Bot resumed.');
        }
    }

    private startScanLoop(): void {
        this.scanTimer && clearInterval(this.scanTimer);
        this.scanTimer = setInterval(() => this.scanCycle(), SCAN_INTERVAL_MS);
    }

    // --- the scan / decide / execute cycle ----------------------------------

    private scanCycle(): void {
        if (this.state === 'Stopped' || this.state === 'Paused' || this.state === 'Error') return;
        if (this.state === 'Executing' || this.state === 'ContractOpen') return; // wait for the open contract
        if (this.connection !== 'connected') {
            this.state = 'DataInterrupted';
            return;
        }
        if (this.isSessionStopped()) return;

        const now = Date.now();
        const feeds = this.marketService?.getAllFeeds() ?? [];
        const ctx = {
            minSampleSize: this.config.minSampleSize,
            minEvidence: this.config.minEvidence,
            patterns: this.config.patterns,
            enabledStrategies: this.config.strategies.filter(s => s.enabled).map(s => s.id),
            maxQuoteAgeMs: this.config.maxQuoteAgeMs,
            now,
        };

        const scans = feeds
            .map(feed => evaluateMarket(feed.market, feed.ticks, ctx))
            .filter((s): s is MarketScan => s !== null);

        this.rankings = rankMarkets(scans);

        const top = this.topMarket;
        if (!top || top.qualifyingStrategies.length === 0) {
            this.state = 'Scanning';
            return;
        }

        this.state = 'SetupDetected';

        const signal = evaluateStrategy({ scan: top, config: this.config, now });
        if (!signal) {
            this.state = 'Scanning';
            return;
        }

        this.lastSignal = signal;
        this.addJournal('signal', `${signal.symbol} · ${signal.strategy} — ${signal.reason}`, signal.conditionsPassed.join('\n'));

        if (isDuplicateSignal(signal, this.actionedSignalIds)) {
            this.addJournal('risk', 'Duplicate signal ignored.');
            this.state = 'Scanning';
            return;
        }

        this.state = 'RiskCheck';
        const riskCtx: RiskContext = {
            config: this.config,
            session: this.session,
            openContracts: this.openContracts,
            authorized: this.authorized,
            lastEntryAt: this.lastEntryAt,
            lastSignalAt: this.lastSignalAt,
            dailyLoss: this.dailyLoss,
            now,
            marketPermitted: true, // eligibility already filtered to supported markets
            realArmed: this.realArmed,
        };
        const result = checkRisk(signal, riskCtx);
        this.lastRiskCheck = result;

        if (!result.passed) {
            this.addJournal('risk', `Entry rejected: ${result.reason}`);
            this.state = 'Scanning';
            return;
        }

        this.addJournal('risk', 'Risk checks passed.');
        this.lastSignalAt = now;
        void this.executeSignal(signal);
    }

    private async executeSignal(signal: StrategySignal): Promise<void> {
        runInAction(() => { this.state = 'Executing'; });

        const contract: ContractRecord = {
            id: signal.id,
            signalId: signal.id,
            symbol: signal.symbol,
            strategy: signal.strategy,
            contractType: signal.contractType,
            stake: this.config.stake,
            buyPrice: null,
            contractId: null,
            transactionId: null,
            status: 'proposing',
            payout: null,
            profit: null,
            openedAt: Date.now(),
            settledAt: null,
            proposalId: null,
            error: null,
        };

        try {
            const proposal = await this.execution.requestProposal(signal, this.config);
            runInAction(() => {
                contract.status = 'proposed';
                contract.proposalId = proposal.proposalId;
                contract.payout = proposal.payout;
            });
            this.addJournal('execution', `Proposal received: ${proposal.proposalId} @ ${proposal.askPrice}`);

            const buy = await this.execution.buy(proposal.proposalId, proposal.askPrice, signal);
            runInAction(() => {
                contract.status = 'open';
                contract.contractId = buy.contractId;
                contract.transactionId = buy.transactionId;
                contract.buyPrice = buy.buyPrice;
                this.openContracts.push(contract);
                this.session.openContracts = this.openContracts.length;
                this.lastExecution = contract;
                this.lastEntryAt = Date.now();
                this.actionedSignalIds.add(signal.id);
                this.state = 'ContractOpen';
            });
            this.addJournal('execution', `Bought contract ${buy.contractId} for ${buy.buyPrice}`);

            // Monitor until settled.
            const settled = await this.execution.monitorContract(buy.contractId);
            runInAction(() => this.settleContract(contract, settled));
        } catch (error) {
            const message = (error as Error)?.message ?? 'Execution failed.';
            runInAction(() => {
                contract.status = 'rejected';
                contract.error = message;
                this.lastExecution = contract;
                this.execution.releaseSignal(signal.id);
                this.state = 'Scanning';
                this.errorMessage = message;
            });
            this.addJournal('error', `Execution error: ${message}`);
        }
    }

    private settleContract(
        contract: ContractRecord,
        settled: { isWon: boolean; payout: number | null; profit: number | null }
    ): void {
        contract.status = settled.isWon ? 'won' : 'lost';
        contract.payout = settled.payout;
        contract.profit = settled.profit;
        contract.settledAt = Date.now();

        this.openContracts = this.openContracts.filter(c => c.id !== contract.id);
        this.session.openContracts = this.openContracts.length;
        this.session.trades += 1;
        this.session.realizedPnl += settled.profit ?? 0;

        if (settled.isWon) {
            this.session.wins += 1;
            this.session.consecutiveWins += 1;
            this.session.consecutiveLosses = 0;
            this.addJournal('result', `Contract ${contract.contractId} WON (+${settled.profit?.toFixed(2) ?? '?'})`);
        } else {
            this.session.losses += 1;
            this.session.consecutiveLosses += 1;
            this.session.consecutiveWins = 0;
            this.dailyLoss += settled.profit ?? 0;
            this.addJournal('result', `Contract ${contract.contractId} lost (${settled.profit?.toFixed(2) ?? '?'})`);
        }

        this.lastExecution = contract;

        if (this.isSessionStopped()) return;

        if (this.config.autoRestartAfterContract) {
            this.state = 'Cooldown';
            setTimeout(() => runInAction(() => {
                if (this.state === 'Cooldown') this.state = 'Scanning';
            }), this.config.cooldownMs);
        } else {
            this.state = 'Scanning';
        }
    }

    private isSessionStopped(): boolean {
        if (this.config.stopOnProfitTarget && this.session.realizedPnl >= this.config.sessionProfitTarget) {
            this.session.stopReason = 'Profit target reached';
            this.state = 'Stopped';
            this.addJournal('info', 'Session stopped: profit target reached.');
            this.stop();
            return true;
        }
        if (this.config.stopOnLossLimit && this.session.realizedPnl <= -this.config.sessionLossLimit) {
            this.session.stopReason = 'Session loss limit reached';
            this.state = 'Stopped';
            this.addJournal('warning', 'Session stopped: loss limit reached. Manual restart required.');
            this.stop();
            return true;
        }
        if (this.dailyLoss <= -this.config.dailyLossLimit) {
            this.session.stopReason = 'Daily loss limit reached';
            this.state = 'Stopped';
            this.addJournal('warning', 'Session stopped: daily loss limit reached.');
            this.stop();
            return true;
        }
        if (this.session.trades >= this.config.maxTrades) {
            this.session.stopReason = 'Maximum trades reached';
            this.state = 'Stopped';
            this.addJournal('info', 'Session stopped: maximum trades reached.');
            this.stop();
            return true;
        }
        if (this.session.consecutiveLosses >= this.config.maxConsecutiveLosses) {
            this.session.stopReason = 'Consecutive-loss limit reached';
            this.state = 'Stopped';
            this.addJournal('warning', 'Session stopped: consecutive-loss limit reached.');
            this.stop();
            return true;
        }
        return false;
    }

    private addJournal(level: JournalLevel, message: string, detail?: string): void {
        this.journalCounter += 1;
        const entry: JournalEntry = {
            id: this.journalCounter,
            timestamp: Date.now(),
            level,
            message,
            detail,
        };
        this.journal = [...this.journal, entry].slice(-200);
    }

    clearJournal(): void {
        this.journal = [];
    }

    dismissError(): void {
        this.errorMessage = null;
        if (this.state === 'Error') this.state = 'Stopped';
    }
}
