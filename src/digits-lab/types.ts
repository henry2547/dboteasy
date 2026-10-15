/**
 * Deriv Digits Analysis Lab — Type Definitions
 */

export type ConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'error';

export interface ConnectionState {
    status: ConnectionStatus;
    reconnectAttempt: number;
    lastMessageAt: number | null;
    latencyMs: number | null;
    errorMessage: string | null;
}

export type MarketCategory =
    | '1-Second Volatility Indices'
    | 'Volatility Indices'
    | 'Step Indices'
    | 'Jump Indices'
    | 'Range Break Indices'
    | 'Boom and Crash Indices'
    | 'Other Synthetic Indices'
    | 'Other Markets';

export type MarketAvailability = 'available' | 'closed' | 'suspended' | 'unsupported';

export interface MarketSymbol {
    apiSymbol: string;
    displayName: string;
    symbolType: string | null;
    market: string | null;
    submarket: string | null;
    subgroup: string | null;
    category: MarketCategory;
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
    leastFrequentDigits: number[];
    evenCount: number;
    oddCount: number;
    evenPercentage: number;
    oddPercentage: number;
    lowCount: number;
    highCount: number;
    lowPercentage: number;
    highPercentage: number;
    averageDigit: number | null;
    currentStreak: DigitStreak | null;
    longestStreak: DigitStreak | null;
}

export interface StrategyResult {
    id: string;
    name: string;
    description: string;
    totalEntries: number;
    wins: number;
    losses: number;
    winRate: number;
    currentStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
    lastSignal: 'win' | 'loss' | null;
    trend: 'improving' | 'declining' | 'stable';
    recentResults: ('win' | 'loss')[];
}

export interface BarrierObservation {
    barrier: string;
    threshold: number;
    direction: 'over' | 'under';
    hits: number;
    misses: number;
    hitRate: number;
    lastHit: boolean | null;
    consecutiveHits: number;
    consecutiveMisses: number;
}

export interface ActiveSubscription {
    id: string | null;
    symbol: string | null;
    generation: number;
    status: 'idle' | 'requesting' | 'active' | 'cancelling';
}

export interface PendingRequest {
    reqId: number;
    type: 'active-symbols' | 'history' | 'live-ticks' | 'forget' | 'ping';
    symbol?: string;
    generation: number;
    sentAt: number;
}
