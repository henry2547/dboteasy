/**
 * Shared types for the Digits Analysis Lab.
 *
 * The lab is a read-only, public-market-data tool: it never sends authenticated
 * or trading requests. Every number it shows is derived from Deriv's public
 * WebSocket feed.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface ConnectionState {
    status: ConnectionStatus;
    reconnectAttempt: number;
    lastMessageAt: number | null;
    lastPingAt: number | null;
    lastPongAt: number | null;
    latencyMs: number | null;
    errorMessage: string | null;
}

export type MarketAvailability = 'available' | 'closed' | 'suspended' | 'unsupported';

export interface MarketSymbol {
    apiSymbol: string;
    displayName: string;
    symbolType: string | null;
    market: string | null;
    subgroup: string | null;
    submarket: string | null;
    category: string;
    pipSize: number | null;
    decimalPlaces: number | null;
    isOpen: boolean;
    isSuspended: boolean;
    availability: MarketAvailability;
}

export interface PrecisionState {
    activeSymbolPipIncrement: number | null;
    historyDecimalPlaces: number | null;
    liveDecimalPlaces: number | null;
    resolvedDecimalPlaces: number | null;
    source: 'history' | 'live-tick' | 'active-symbol' | 'unresolved';
}

export interface NormalizedTick {
    key: string;
    apiTickId: string | null;
    symbol: string;
    epoch: number;
    date: Date;
    quote: number;
    formattedQuote: string;
    lastDigit: number;
    source: 'history' | 'live';
}

export interface DigitFrequency {
    digit: number;
    count: number;
    percentage: number;
    deviationFromExpected: number;
    absoluteDeviation: number;
    rank: number;
    isMostFrequent: boolean;
    isLeastFrequent: boolean;
}

export interface DigitStreak {
    digit: number;
    length: number;
}

export interface DigitStatistics {
    sampleSize: number;
    frequencies: DigitFrequency[];

    mostFrequentDigits: number[];
    secondMostFrequentDigits: number[];
    leastFrequentDigits: number[];
    secondLeastFrequentDigits: number[];

    evenCount: number;
    oddCount: number;
    evenPercentage: number;
    oddPercentage: number;

    lowCount: number;
    highCount: number;
    lowPercentage: number;
    highPercentage: number;

    averageDigit: number | null;

    meanAbsoluteDeviationFromTen: number | null;
    maximumAbsoluteDeviationFromTen: number | null;

    currentStreak: DigitStreak | null;
    longestStreak: DigitStreak | null;
}

export interface BarrierStat {
    barrier: number;
    label: string;
    belowCount: number;
    atCount: number;
    aboveCount: number;
    belowPercentage: number;
    atPercentage: number;
    abovePercentage: number;
    /** Ticks whose digit landed exactly one below the barrier. */
    immediateBelowCount: number;
    /** Ticks whose digit landed exactly one above the barrier. */
    immediateAboveCount: number;
    /** Digits that followed an immediate-below hit. */
    nextAfterBelow: number[];
    /** Digits that followed an immediate-above hit. */
    nextAfterAbove: number[];
    /** Share of ticks that would have won "Over barrier". */
    overWinRate: number | null;
    /** Share of ticks that would have won "Under barrier". */
    underWinRate: number | null;
}

export type RuleKind = 'over' | 'under' | 'even' | 'odd';

export interface RuleDef {
    id: string;
    label: string;
    kind: RuleKind;
    barrier?: number;
    description: string;
}

export interface RulePerformance {
    id: string;
    label: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number | null;
    winStreak: number;
    lossStreak: number;
    recentWinRate: number | null;
}

export interface AdaptiveSignal {
    id: string;
    label: string;
    recommendation: 'enter' | 'skip';
    confidence: number;
    reason: string;
}

export interface BacktestResult {
    id: string;
    label: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    bestWinStreak: number;
    longestLossStreak: number;
    /** Cumulative win-rate after each trade — the walk-forward equity curve. */
    equityCurve: number[];
}
