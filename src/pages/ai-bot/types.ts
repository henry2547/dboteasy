/**
 * Shared types for the AI Market Scanner & Automated Trading system.
 *
 * The bot is split into independent services (see AGENTS.md / the request):
 * market-data, digit-analysis, AI scanner, strategy engine, risk manager,
 * order execution, open-contract monitor, and session journal. These types
 * are the contracts between them.
 */

// ── Connection ──────────────────────────────────────────────────────────────

export type AuthStatus =
    | 'disconnected'
    | 'connecting'
    | 'authorizing'
    | 'authorized'
    | 'authorization_required'
    | 'error'
    | 'reconnecting';

export interface AuthAccount {
    /** Deriv account id, e.g. VRT123456 or CR1234567. */
    loginid: string;
    /** 'demo' or 'real'. */
    accountType: 'demo' | 'real';
    currency: string;
    balance: number;
    /** Account status from the accounts list, when available. */
    status: string | null;
    /** Whether this is the currently authorized/active account. */
    isActive: boolean;
}

export interface AuthDiagnostics {
    /** Raw WebSocket connection state. */
    wsState: string;
    /** Authorization phase reported by the auth socket. */
    authPhase: string;
    /** Whether the selected account is authorized for execution. */
    accountAuthorized: boolean;
    /** Whether the user's token grants trading (the `trade` scope). */
    tradePermitted: boolean;
    /** Public market-data connection state (owned by the scanner). */
    marketDataState: string;
    /** Epoch ms of the last successful authorization, or null. */
    lastAuthAt: number | null;
    /** Last error message (safe, no credentials). */
    lastError: string | null;
    /** Current reconnect attempt counter. */
    reconnectAttempt: number;
    /** Whether a retry/reconnect is in progress. */
    retrying: boolean;
}

export interface AuthState {
    status: AuthStatus;
    loginid: string | null;
    isVirtual: boolean;
    balance: number | null;
    currency: string | null;
    errorMessage: string | null;
    /** Accounts available to the authorized user (from the accounts list). */
    accounts: AuthAccount[];
    /** Diagnostics for the connection panel. */
    diagnostics: AuthDiagnostics;
}

export type FeedStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

// ── Markets ─────────────────────────────────────────────────────────────────

export interface ScannerMarket {
    symbol: string;
    displayName: string;
    category: string;
    isOpen: boolean;
    digits: number[];
    sampleSize: number;
    lastTickAt: number | null;
    feedFresh: boolean;
}

// ── Statistics (reuses the digits lab) ───────────────────────────────────────

export interface DigitFrequencyInfo {
    digit: number;
    count: number;
    percentage: number;
    deviationFromExpected: number;
    absoluteDeviation: number;
    /** True for the digit with the highest count in the sample. */
    isMostFrequent: boolean;
    /** True for the digit with the lowest count in the sample. */
    isLeastFrequent: boolean;
}

export interface MarketAnalysis {
    symbol: string;
    displayName: string;
    sampleSize: number;
    frequencies: DigitFrequencyInfo[];
    evenPercentage: number;
    oddPercentage: number;
    lowPercentage: number;
    highPercentage: number;
    meanAbsoluteDeviation: number;
    currentStreak: { digit: number; length: number } | null;
    /** Transition matrix counts: transitions[from][to]. */
    transitions: number[][];
    /** Consecutive digit pairs: key "ab" -> count. */
    pairCounts: Record<string, number>;
    /** Historical observational win-rate for each qualifying setup. */
    observationalWinRates: Record<string, number | null>;
    feedFresh: boolean;
    lastTickAt: number | null;
}

// ── Scanner ─────────────────────────────────────────────────────────────────

export interface ScannerConditionResult {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
    value: string;
}

export interface MarketRanking {
    symbol: string;
    displayName: string;
    category: string;
    score: number;
    analysis: MarketAnalysis;
    conditionsPassed: ScannerConditionResult[];
    conditionsFailed: ScannerConditionResult[];
    strategyId: StrategyId | null;
    strategyLabel: string | null;
    proposedDigit: number | null;
    proposedBarrier: string | null;
    reason: string;
    /** True when no setup qualifies — the scanner still reports the market. */
    qualifies: boolean;
}

// ── Strategy ─────────────────────────────────────────────────────────────────

export type StrategyId = 'matches' | 'differs' | 'over1' | 'under8' | 'even' | 'odd' | 'custom';

export interface StrategyConfig {
    id: StrategyId;
    label: string;
    enabled: boolean;
    /** Deriv contract_type code. */
    contractType: string;
    /** For matches/differs: the digit to match/differ. null = use AI suggestion. */
    digit: number | null;
    /** For over/under: the barrier as a string (Deriv expects a string barrier). */
    barrier: string | null;
    description: string;
}

export interface StrategySignal {
    id: string;
    symbol: string;
    strategyId: StrategyId;
    strategyLabel: string;
    contractType: string;
    digit: number | null;
    barrier: string | null;
    timestamp: number;
    tickEpoch: number | null;
    configVersion: number;
    analysis: MarketAnalysis;
    conditionsPassed: string[];
    conditionsFailed: string[];
    reason: string;
}

// ── Risk ────────────────────────────────────────────────────────────────────

export interface RiskCheckResult {
    passed: boolean;
    checks: { id: string; label: string; passed: boolean; detail: string }[];
    reason: string | null;
}

// ── Execution ───────────────────────────────────────────────────────────────

export type ExecutionState =
    | 'idle'
    | 'proposing'
    | 'proposed'
    | 'buying'
    | 'bought'
    | 'monitoring'
    | 'settled'
    | 'rejected'
    | 'error';

export interface ProposalInfo {
    id: string;
    askPrice: number;
    payout: number;
    longcode: string;
    spot: number;
    spotTime: number;
    dateStart: number;
    dateExpiry: number;
}

export interface OpenContractInfo {
    contractId: number;
    contractType: string;
    symbol: string;
    buyPrice: number;
    payout: number;
    profit: number | null;
    isSold: boolean;
    isValidToSell: boolean;
    isExpired: boolean;
    entryTick: number | null;
    currentSpot: number | null;
    status: string | null;
    transactionId: number;
}

export interface ExecutionResult {
    contractId: number | null;
    state: ExecutionState;
    buyPrice: number | null;
    payout: number | null;
    profit: number | null;
    status: 'won' | 'lost' | 'open' | 'rejected' | 'error' | null;
    message: string;
    timestamp: number;
}

// ── Session ─────────────────────────────────────────────────────────────────

export type BotState =
    | 'Stopped'
    | 'Scanning'
    | 'Setup Detected'
    | 'Risk Check'
    | 'Awaiting Confirmation'
    | 'Executing'
    | 'Contract Open'
    | 'Cooldown'
    | 'Paused'
    | 'Data Interrupted'
    | 'Error';

export type StopReason =
    | 'manual'
    | 'profit_target'
    | 'loss_limit'
    | 'daily_loss_limit'
    | 'max_trades'
    | 'max_consecutive_losses'
    | 'max_consecutive_wins'
    | 'session_duration'
    | 'error'
    | null;

export interface SessionStats {
    tradeCount: number;
    winCount: number;
    lossCount: number;
    openCount: number;
    consecutiveLosses: number;
    consecutiveWins: number;
    realizedProfit: number;
    startingBalance: number | null;
    currentBalance: number | null;
    startedAt: number | null;
    stoppedAt: number | null;
    stopReason: StopReason;
}

// ── Journal ──────────────────────────────────────────────────────────────────

export type JournalLevel = 'info' | 'signal' | 'trade' | 'risk' | 'warning' | 'error';

export interface JournalEntry {
    id: string;
    timestamp: number;
    level: JournalLevel;
    category: string;
    message: string;
    details?: Record<string, unknown>;
}

// ── Settings ────────────────────────────────────────────────────────────────

export type AccountMode = 'demo' | 'real';

export interface TradingSettings {
    accountMode: AccountMode;
    stake: number;
    maxStake: number;
    sessionProfitTarget: number;
    sessionLossLimit: number;
    dailyLossLimit: number;
    maxTrades: number;
    maxConsecutiveLosses: number;
    maxConsecutiveWins: number | null;
    maxConcurrentContracts: number;
    cooldownMs: number;
    minTimeBetweenSignalsMs: number;
    maxEntryDelayMs: number;
    maxQuoteAgeMs: number;
    sessionDurationMs: number | null;
    autoRestartAfterContract: boolean;
    stopOnProfitTarget: boolean;
    stopOnLossLimit: boolean;
    duration: number;
    durationUnit: 't' | 's' | 'm' | 'h' | 'd';
    analysisWindow: number;
    minSampleSize: number;
    minDeviationEdge: number;
}

// ── Scanner config ───────────────────────────────────────────────────────────

export interface ScannerConfig {
    analysisWindow: number;
    minSampleSize: number;
    minDeviationEdge: number;
    /** Patterns: "00 → 0" means two consecutive 0s suggests Over 1 will win. */
    patternOver1: string[]; // e.g. ['00', '11']
    patternUnder8: string[]; // e.g. ['88', '99']
    scanIntervalMs: number;
}
