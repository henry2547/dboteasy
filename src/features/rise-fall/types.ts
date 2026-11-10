/**
 * Rise/Fall engine — shared contracts.
 *
 * Three execution modes, strictly separated. Each mode owns its own account
 * verification, risk configuration, open contract, journal and statistics; no
 * value crosses between them. Virtual mode simulates fills against genuine
 * Deriv ticks and never sends a purchase.
 *
 * Nothing here fabricates a price. Every signal, virtual fill and settlement is
 * derived from ticks that arrived on Deriv's public market-data socket.
 */

export type ExecutionMode = 'virtual' | 'demo' | 'real';

export const EXECUTION_MODES: ExecutionMode[] = ['virtual', 'demo', 'real'];

/** Unmistakable mode labels used everywhere a mode is shown. */
export const MODE_LABELS: Record<ExecutionMode, string> = {
    virtual: 'VIRTUAL',
    demo: 'DEMO',
    real: 'REAL',
};

export type TradeDirection = 'rise' | 'fall';
export type SignalDirection = TradeDirection | 'none';

/** One genuine quote from the public feed. */
export interface Tick {
    epoch: number;
    quote: number;
}

export type RegimeId =
    | 'strong_uptrend'
    | 'weak_uptrend'
    | 'strong_downtrend'
    | 'weak_downtrend'
    | 'sideways'
    | 'high_volatility'
    | 'low_volatility'
    | 'volatility_expansion'
    | 'possible_reversal'
    | 'uncertain';

export interface RegimeState {
    id: RegimeId;
    label: string;
    /** Direction of the net move over the analysis window. */
    direction: 'up' | 'down' | 'flat';
    /** Kaufman efficiency ratio, normalised 0..1 — trend purity, not a probability. */
    trendStrength: number;
    /** Mean absolute per-tick move, in quote units. */
    meanAbsMove: number;
    /** Standard deviation of per-tick moves, in quote units. */
    volatility: number;
    /** 0..1 — how much the recent third widened against the earlier window. */
    expansion: number;
}

export interface SignalContribution {
    id: string;
    label: string;
    /** Weight of this component in the 0..100 score. */
    weight: number;
    /** Points this component contributes to its side, 0..weight. */
    score: number;
    direction: SignalDirection;
    detail: string;
}

export interface RiseFallSignal {
    strategyId: 'trend_continuation';
    symbol: string;
    direction: SignalDirection;
    /** 0..100 strength of the Rise case. A filter score, never a probability. */
    riseScore: number;
    /** 0..100 strength of the Fall case. */
    fallScore: number;
    /** 0..1 — the winning score, shown for convenience. */
    confidence: number;
    contributions: SignalContribution[];
    explanation: string;
    regime: RegimeId;
    /** False means NO TRADE: the regime or a confirmation filter refuses the entry. */
    suitable: boolean;
    ticksAnalysed: number;
    /** Epoch ms of the newest tick the signal was computed from. */
    evaluatedAt: number;
    /** One entry per tick per direction — the duplicate-entry guard. */
    fingerprint: string;
}

export type EntryStage = 'signal' | 'duplicate' | 'market-data' | 'risk' | 'account' | 'contract' | 'execution';

export interface AccountVerification {
    mode: ExecutionMode;
    verified: boolean;
    accountType: 'virtual' | 'demo' | 'real' | null;
    /** Masked login id only — never a full account id or token. */
    maskedLoginId: string | null;
    currency: string | null;
    balance: number | null;
    tradePermitted: boolean;
    verifiedAt: number | null;
    /** Why verification is not usable, when it is not. */
    reason: string | null;
}

export type ContractStatus = 'open' | 'won' | 'lost';

export interface VirtualContract {
    /** Internal id for this simulated contract. */
    id: string;
    mode: ExecutionMode;
    /** VIRTUAL only: simulated fills, no Deriv contract exists. */
    source: 'VIRTUAL';
    /** Always null — virtual mode never purchases anything on Deriv. */
    contractId: string | null;
    symbol: string;
    direction: TradeDirection;
    contractType: 'CALL' | 'PUT';
    stake: number;
    currency: string;
    durationTicks: number;
    /** Genuine ticks still to arrive before settlement. */
    ticksRemaining: number;
    /** Newest tick epoch already counted — a replayed tick is ignored. */
    lastAppliedEpoch: number;
    entryEpoch: number;
    entryQuote: number;
    openedAt: number;
    status: ContractStatus;
    exitEpoch: number | null;
    exitQuote: number | null;
    profit: number | null;
    /** True when the exit price equals the entry price (a loss under strict rules). */
    tie: boolean;
    fingerprint: string;
    signalScore: number;
    regime: RegimeId;
    explanation: string;
}

export interface JournalEntry {
    id: string;
    mode: ExecutionMode;
    source: 'VIRTUAL' | 'DEMO' | 'REAL';
    contractId: string | null;
    symbol: string;
    strategyId: string;
    direction: TradeDirection;
    durationTicks: number;
    stake: number;
    currency: string;
    entryEpoch: number;
    entryQuote: number;
    exitEpoch: number | null;
    exitQuote: number | null;
    status: 'open' | 'won' | 'lost';
    profit: number | null;
    /** Virtual P/L is simulated against a stated payout assumption. */
    estimated: boolean;
    tie: boolean;
    signalScore: number;
    regime: RegimeId;
    explanation: string;
    fingerprint: string;
    riskSnapshot: Record<string, number>;
}

export interface JournalStats {
    trades: number;
    open: number;
    wins: number;
    losses: number;
    ties: number;
    netProfit: number;
    /** Best peak-to-trough fall of the settled P/L curve. */
    maxDrawdown: number;
    longestLosingStreak: number;
    consecutiveLosses: number;
    lastLossAt: number | null;
}

export interface RiskCheck {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
}

export interface RiskDecision {
    allowed: boolean;
    checks: RiskCheck[];
    reason: string | null;
}

export interface RiskContext {
    sessionPnl: number;
    sessionPeakPnl: number;
    consecutiveLosses: number;
    tradesTaken: number;
    openContracts: number;
    exposure: number;
    lastLossAt: number | null;
    now: number;
}

export interface MarketIntegrity {
    healthy: boolean;
    issue: string | null;
    gaps: number;
    duplicates: number;
    lastTickAgeMs: number | null;
    ticksAvailable: number;
}

export type EngineState = 'idle' | 'running' | 'paused' | 'stopped' | 'halted';

export interface ModeSnapshot {
    mode: ExecutionMode;
    state: EngineState;
    emergency: boolean;
    account: AccountVerification;
    risk: Record<string, number>;
    openContract: VirtualContract | null;
    stats: JournalStats;
    haltReason: string | null;
}

export interface EngineSnapshot {
    mode: ExecutionMode;
    modes: Record<ExecutionMode, ModeSnapshot>;
    /** The last decision the central execution service made, for the UI log. */
    lastOutcome: { status: string; stage: EntryStage | null; reason: string | null; at: number } | null;
}
