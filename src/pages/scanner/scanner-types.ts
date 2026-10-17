/**
 * Types for the AI Market Scanner & automated trading system.
 *
 * The scanner is built on top of the existing Digits Analysis Lab: it reuses the
 * public market-data WebSocket and the pure statistical helpers, then layers a
 * deterministic strategy engine, an independent risk manager, an authenticated
 * execution service and a session journal on top.
 *
 * Nothing here describes a trade as guaranteed or certain. A signal is a
 * structured record of *observed conditions*; the risk manager decides whether
 * an entry is permitted; the execution service only acts on real Deriv quotes.
 */

import type { MarketSymbol } from '../digits/types';

/** The finite state machine the bot moves through. */
export type BotState =
    | 'Stopped'
    | 'Scanning'
    | 'SetupDetected'
    | 'RiskCheck'
    | 'AwaitingConfirmation'
    | 'Executing'
    | 'ContractOpen'
    | 'Cooldown'
    | 'Paused'
    | 'DataInterrupted'
    | 'Error';

export type AccountMode = 'demo' | 'real';

/** Strategy identifiers supported by the deterministic engine. */
export type StrategyId = 'matches' | 'differs' | 'over1' | 'under8' | 'even' | 'odd' | 'custom';

/** Contract types as named by Deriv's API for digit contracts. */
export type DigitContractType =
    | 'DIGITMATCH'
    | 'DIGITDIFF'
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'DIGITEVEN'
    | 'DIGITODD';

export interface StrategyToggle {
    id: StrategyId;
    enabled: boolean;
    /** For matches/differs: the digit to match/differ against. null = use engine suggestion. */
    digit: number | null;
}

/** A confirmed two-digit pattern that precedes an Over/Under entry. */
export interface PatternDef {
    id: string;
    /** The two most-recent digits that must appear, in order. */
    sequence: [number, number];
    /** The barrier the *next* digit is expected to clear. */
    barrier: number;
    direction: 'over' | 'under';
    label: string;
}

/**
 * Everything the scanner measures for one market, plus the transparent reasons
 * behind its ranking. This is descriptive evidence — never a guarantee.
 */
export interface MarketScan {
    symbol: string;
    displayName: string;
    category: string;
    availability: MarketSymbol['availability'];
    sampleSize: number;
    /** Per-digit frequency (0–9) as a percentage. */
    frequencies: number[];
    /** Absolute deviation of each digit from the 10% reference. */
    deviations: number[];
    /** Mean absolute deviation from 10% — a bias/stability indicator. */
    meanAbsoluteDeviation: number;
    /** How stable the frequencies are across the first/second half of the window. */
    frequencyStability: number;
    /** 10x10 transition matrix counts. */
    transitions: number[][];
    /** Consecutive two-digit pair counts (100 entries, flattened [a*10+b]). */
    pairs: number[];
    evenPercentage: number;
    oddPercentage: number;
    lowPercentage: number;
    highPercentage: number;
    currentStreak: { digit: number; length: number } | null;
    /** Pattern confirmations found in the window and the observed next-digit outcomes. */
    patterns: PatternObservation[];
    /** Epoch of the most recent tick received for this market. */
    lastTickEpoch: number | null;
    /** Milliseconds since the last tick — feed freshness. */
    feedAgeMs: number | null;
    /** True when the feed is considered fresh enough to act on. */
    feedFresh: boolean;
    /** Configurable, transparent score used to rank markets. */
    score: number;
    /** Human-readable reasons that contributed to the score. */
    reasons: string[];
    /** Strategies that currently qualify for this market (descriptive). */
    qualifyingStrategies: StrategyId[];
}

export interface PatternObservation {
    pattern: PatternDef;
    /** Times the two-digit sequence appeared in the window. */
    confirmations: number;
    /** Of those, how often the next digit cleared the barrier. */
    wins: number;
    /** Observed win rate after the pattern confirmed (null if no confirmations). */
    observedWinRate: number | null;
    /** True when the *current* last two digits match the pattern (a live confirmation). */
    currentlyConfirmed: boolean;
}

/** A structured signal produced by the deterministic strategy engine. */
export interface StrategySignal {
    id: string;
    symbol: string;
    strategy: StrategyId;
    contractType: DigitContractType;
    /** Selected digit for matches/differs, barrier for over/under, null for parity. */
    prediction: number | null;
    barrier: number | null;
    signalTimestamp: number;
    tickEpoch: number;
    /** Hash of the config that produced this signal (so stale signals are rejected). */
    configVersion: string;
    /** Snapshot of the analysis-window statistics that justified the signal. */
    statistics: {
        sampleSize: number;
        frequencies: number[];
        meanAbsoluteDeviation: number;
        frequencyStability: number;
        evenPercentage: number;
        oddPercentage: number;
        lowPercentage: number;
        highPercentage: number;
    };
    conditionsPassed: string[];
    conditionsFailed: string[];
    reason: string;
    /** Proposed contract parameters (validated against Deriv's contract model). */
    proposal: {
        contractType: DigitContractType;
        symbol: string;
        duration: number;
        durationUnit: 't';
        stake: number;
        prediction: number | null;
        barrier: number | null;
    };
}

export interface RiskCheck {
    name: string;
    passed: boolean;
    reason: string | null;
}

export interface RiskCheckResult {
    passed: boolean;
    checks: RiskCheck[];
    reason: string | null;
}

export type ContractStatus =
    | 'proposing'
    | 'proposed'
    | 'buying'
    | 'open'
    | 'won'
    | 'lost'
    | 'rejected'
    | 'error';

export interface ContractRecord {
    id: string;
    signalId: string;
    symbol: string;
    strategy: StrategyId;
    contractType: DigitContractType;
    stake: number;
    buyPrice: number | null;
    contractId: number | null;
    transactionId: number | null;
    status: ContractStatus;
    payout: number | null;
    profit: number | null;
    openedAt: number;
    settledAt: number | null;
    /** The authoritative proposal id returned by Deriv (never fabricated). */
    proposalId: string | null;
    error: string | null;
}

export type JournalLevel = 'info' | 'signal' | 'risk' | 'execution' | 'result' | 'warning' | 'error';

export interface JournalEntry {
    id: number;
    timestamp: number;
    level: JournalLevel;
    message: string;
    /** Optional structured payload for detail views. */
    detail?: string;
}

export interface SessionStats {
    startedAt: number | null;
    trades: number;
    wins: number;
    losses: number;
    /** Net realised profit/loss from settled contracts, in account currency. */
    realizedPnl: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    openContracts: number;
    stopReason: string | null;
}

export interface ScannerConfig {
    analysisWindow: number;
    minSampleSize: number;
    minEvidence: number;
    /** Markets scanned: only Volatility Indices and 1-Second Volatility Indices. */
    scanVolatility: boolean;
    scanVolatility1s: boolean;
    strategies: StrategyToggle[];
    /** Patterns for Over 1 / Under 8 confirmation. */
    patterns: PatternDef[];
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
    accountMode: AccountMode;
    /** Contract duration in ticks (digit contracts settle on ticks). */
    durationTicks: number;
}

export interface ScannerSnapshot {
    state: BotState;
    connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
    marketsScanned: number;
    rankings: MarketScan[];
    topMarket: MarketScan | null;
    lastSignal: StrategySignal | null;
    lastRiskCheck: RiskCheckResult | null;
    lastExecution: ContractRecord | null;
    session: SessionStats;
    journal: JournalEntry[];
    openContracts: ContractRecord[];
    config: ScannerConfig;
    authorized: boolean;
    accountMode: AccountMode;
    activeLoginid: string | null;
    remainingLossAllowance: number | null;
    profitTargetProgress: number | null;
    /** True when a real-money entry is armed (requires separate confirmation). */
    realArmed: boolean;
    errorMessage: string | null;
}
