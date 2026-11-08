/**
 * GUI Trading Engine — shared types.
 *
 * Everything here is plain data so the strategy controllers stay pure: they
 * take ticks/digits in and return the next state plus the events they raised.
 * React and the Deriv socket never appear in these types.
 */

export type PrimaryStrategyId = 'over1' | 'under8';
export type StrategySelection = PrimaryStrategyId | 'both';
export type StakeScope = 'primary' | 'recovery' | 'both';
export type LegKind = 'primary' | 'recovery';

export type EngineStatus = 'stopped' | 'starting' | 'running' | 'paused' | 'halted' | 'error';

export type PrimaryState =
    | 'INITIALIZING'
    | 'LOADING_HISTORICAL_TICKS'
    | 'MONITORING_FREQUENCY'
    | 'FREQUENCY_FILTER_BLOCKED'
    | 'WAITING_FOR_PAIR'
    | 'PAIR_DETECTED'
    | 'WAITING_FOR_CONFIRMATION'
    | 'CONFIRMATION_RECEIVED'
    | 'SETUP_BLOCKED'
    | 'TRADE_VALIDATION'
    | 'PURCHASE_PENDING'
    | 'CONTRACT_OPEN'
    | 'TRADE_WON'
    | 'TRADE_LOST'
    | 'RISK_LIMIT_REACHED'
    | 'ENGINE_STOPPED';

export type RecoveryState =
    | 'PRIMARY_TRADING'
    | 'PRIMARY_LOSS_DETECTED'
    | 'RECOVERY_FILTER_CHECK'
    | 'WAITING_FOR_EVEN_ODD_PATTERN'
    | 'RECOVERY_TRADE_ELIGIBLE'
    | 'RECOVERY_PURCHASE_PENDING'
    | 'RECOVERY_CONTRACT_OPEN'
    | 'RECOVERY_WON'
    | 'RECOVERY_LOST'
    | 'RECOVERY_LIMIT_REACHED'
    | 'ENGINE_STOPPED';

export type RecoveryPattern = 'even_even' | 'odd_odd';
export type ParityDirection = 'EVEN' | 'ODD';

/** Where a contract came from — reported in Summary / Transactions / Journal. */
export type TradeSource = 'gui_over1' | 'gui_under8' | 'gui_recovery';

export type TradeOutcome = 'pending' | 'open' | 'won' | 'lost' | 'rejected' | 'failed';

export interface EngineConfig {
    strategy: StrategySelection;
    initialStake: number;
    takeProfit: number;
    stopLoss: number;
    multiplier: number;
    multiplierScope: StakeScope;
    maxConsecutiveLosses: number;
    maxRecoveryTrades: number;
    maxOpenContracts: number;
    maxStake: number;
    recoveryFilterEnabled: boolean;
    maxEvenPercent: number;
    maxOddPercent: number;
}

export interface EngineTick {
    /** Stable identity so a replayed/historical tick is never processed twice. */
    key: string;
    symbol: string;
    epoch: number;
    quote: number;
    formattedQuote: string;
    lastDigit: number;
}

export interface DigitWindowStats {
    /** counts[0..9] over the rolling window. */
    counts: number[];
    /** percent[0..9] = count / total × 100 (0 when the window is empty). */
    percent: number[];
    total: number;
}

export interface ParityStats {
    even: number;
    odd: number;
    evenPercent: number;
    oddPercent: number;
    /** Distance from the 50 / 50 baseline, in percentage points. */
    evenDelta: number;
    oddDelta: number;
    total: number;
    baseline: number;
}

export interface FrequencyReading {
    digit: number;
    percent: number;
    threshold: number;
    passed: boolean;
}

export interface FrequencyPermission {
    passed: boolean;
    reason: string | null;
    readings: FrequencyReading[];
    windowSize: number;
    observed: number;
}

export interface PendingSetup {
    id: string;
    strategy: PrimaryStrategyId;
    market: string;
    marketName: string;
    pair: string;
    pairDigits: [number, number];
    detectedAt: number;
    detectedSequence: number[];
    interveningDigits: number[];
    ticksWaited: number;
    status: 'pending' | 'confirmed' | 'blocked';
    frequencyAtDetection: FrequencyPermission;
    /** Why the setup stopped being valid, when it did. */
    blockReason?: string;
}

export type PrimaryEvent =
    | { type: 'pair'; setup: PendingSetup }
    | { type: 'confirmation'; setup: PendingSetup; digit: number; ticksWaited: number }
    | { type: 'blocked'; setup: PendingSetup; reason: string; stage: 'pre_confirmation' | 'post_confirmation' };

export interface PrimaryRuntime {
    strategy: PrimaryStrategyId;
    state: PrimaryState;
    pending: PendingSetup | null;
    /** Digit seen on the previous tick *while running*; null right after start. */
    previousDigit: number | null;
    lastPair: { pair: string; at: number; sequence: number[] } | null;
    lastEvent: PrimaryEvent | null;
    setupsCreated: number;
}

export interface RecoveryRuntime {
    state: RecoveryState;
    active: boolean;
    /** Contract whose confirmed loss opened recovery evaluation. */
    contractId: string | null;
    /** Every primary contract that already activated recovery (activation happens once). */
    activatedContracts: string[];
    attempts: number;
    consecutiveLosses: number;
    previousDigit: number | null;
    lastTwo: [number | null, number | null];
    pattern: RecoveryPattern | null;
    direction: ParityDirection | null;
    lastReason: string | null;
}

export interface RecoverySignal {
    pattern: RecoveryPattern;
    direction: ParityDirection;
    digits: [number, number];
    frequency: {
        enabled: boolean;
        eligible: boolean;
        reason: string | null;
        evenPercent: number;
        oddPercent: number;
        maxEvenPercent: number;
        maxOddPercent: number;
        total: number;
    };
}

export type SetupLedgerKind = 'created' | 'confirmed' | 'expired' | 'blocked';

export interface EngineTrade {
    /** Internal id — never sent to Deriv. */
    id: string;
    source: TradeSource;
    strategyLabel: string;
    market: string;
    marketName: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
    barrier: number | null;
    stake: number;
    buyPrice: number | null;
    sellPrice: number | null;
    payout: number | null;
    profit: number | null;
    transactionId: number | null;
    contractId: number | null;
    entryAt: number;
    settlementAt: number | null;
    outcome: TradeOutcome;
    status: 'purchase_sent' | 'open' | 'settled' | 'rejected' | 'failed';
    setupId: string | null;
    reason?: string;
}

export interface EngineJournalEntry {
    id: string;
    at: number;
    type:
        | 'engine'
        | 'setup'
        | 'confirmed'
        | 'blocked'
        | 'purchase'
        | 'settlement'
        | 'recovery'
        | 'error';
    level: 'info' | 'success' | 'warn' | 'error';
    strategy: string;
    market: string;
    message: string;
    details: Record<string, unknown>;
}

export interface SessionMetrics {
    totalTrades: number;
    primaryTrades: number;
    recoveryTrades: number;
    wins: number;
    losses: number;
    totalStake: number;
    profit: number;
    consecutiveLosses: number;
    recoveryAttempts: number;
    recoveryWins: number;
    recoveryLosses: number;
    recoveryConsecutiveLosses: number;
    openContracts: number;
}

export interface RiskVerdict {
    allowed: boolean;
    reason: string | null;
}

export interface StakePreview {
    initialStake: number;
    currentStake: number;
    nextStake: number;
    multiplier: number;
    remainingRiskAllowance: number;
    primaryStake: number;
    recoveryStake: number;
}
