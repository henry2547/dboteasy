/**
 * Shared types for the five advanced analytics engines.
 *
 * These types are the *contract* between the pure engine maths (this folder)
 * and the presentation layer. Nothing here touches the network, React or the
 * WebSocket — so every engine can be unit-tested in isolation.
 */

/** A digit feed is either statistically indistinguishable from noise or compressed. */
export type EntropyState = 'PURE_NOISE' | 'STRUCTURAL_CLUSTER';

/** How a digit behaves once the concentric windows are stacked. */
export type ConvergenceState = 'EXHAUSTED' | 'PEAK' | 'BALANCED';

/** Engine A — the per-digit frequency vector of one concentric window. */
export interface ConcentricWindow {
    /** Nominal size of the window (20, 50, 100, 500, 1000). */
    windowSize: number;
    /** Ticks actually used — equals `windowSize` once the FIFO buffer is full. */
    sampleSize: number;
    /** Occurrence count per digit, index = digit 0..9. */
    counts: number[];
    /** Occurrence rate per digit (Frequency % = Count / WindowSize × 100). */
    percentages: number[];
}

/** Engine A — one digit's behaviour across every concentric window. */
export interface DigitConvergence {
    digit: number;
    /** Window sizes where this digit sits outside the 8–12% band. */
    windowsAligned: number[];
    /** EXHAUSTED (always < 8%) / PEAK (always > 12%) only when every window agrees. */
    state: ConvergenceState;
    minPercentage: number;
    maxPercentage: number;
}

/** Engine A — the full 2D macro-to-micro matrix. */
export interface VelocityMatrix {
    windows: ConcentricWindow[];
    convergence: Record<number, DigitConvergence>;
}

/** Engine B — the Shannon entropy reading over one analysis window. */
export interface EntropyReading {
    windowSize: number;
    sampleSize: number;
    /** H(X) = -Σ P(xᵢ)·log₂P(xᵢ) in bits. */
    entropy: number;
    /** log₂(10) ≈ 3.3219 — the ceiling for ten equiprobable digits. */
    maxEntropy: number;
    /** entropy / maxEntropy, 0..1 — how close the feed is to pure noise. */
    purityRatio: number;
    entropyState: EntropyState;
}

/** Engine C — the latency / execution-safety circuit breaker. */
export interface LatencyGuardReading {
    currentPingMs: number | null;
    averageTickLifespanMs: number | null;
    /** currentPingMs / averageTickLifespanMs — the share of a tick the round-trip eats. */
    pingShare: number | null;
    isExecutionSafe: boolean;
    reason: string;
}

/** Engine D — one point of the backward-traced scattergram. */
export interface ScatterPoint {
    /** 0 is the live frame; negative values walk back through history. */
    tickIndex: number;
    digit: number;
    epoch: number;
}

/** Engine D — the spacing rhythm of one digit over the traced window. */
export interface DigitSpacing {
    digit: number;
    occurrences: number;
    /** Mean gap (in ticks) between consecutive occurrences. */
    meanGap: number | null;
    /** Standard deviation of those gaps — 0 means perfectly rhythmic. */
    gapStdev: number | null;
    /** gapStdev / meanGap — the coefficient of variation. High = clustered. */
    coefficientOfVariation: number | null;
}

export interface Scattergram {
    points: ScatterPoint[];
    spacing: DigitSpacing[];
    /** Digit with the most irregular (clustered) spacing. */
    mostClustered: DigitSpacing | null;
    /** Digit with the most even (rhythmic) spacing. */
    mostRhythmic: DigitSpacing | null;
}

/** Engine E — a setup the walk-forward sandbox can evaluate. */
export interface WalkForwardSetup {
    id: string;
    label: string;
    /**
     * The entry decision. The runner hands it ONLY the trailing state window
     * ending at the decision index `i` — it never sees `digits[i + 1]`.
     */
    shouldEnter: (past: readonly number[]) => boolean;
    /** Resolves whether the digit at the (single) future index `i + 1` won. */
    wins: (nextDigit: number) => boolean;
}

export interface WalkForwardSetupResult {
    id: string;
    label: string;
    entries: number;
    wins: number;
    losses: number;
    winRate: number | null;
    /** (wins − losses) / entries — the per-entry edge on an even-money payout. */
    expectancy: number | null;
    longestLossRun: number;
    /** Cumulative win rate after each entry — the walk-forward equity curve. */
    equityCurve: number[];
}

export interface WalkForwardReport {
    setups: WalkForwardSetupResult[];
    /** Steps where a decision was actually reachable (index ≥ lookback). */
    evaluatedIndices: number;
    /** Entries whose outcome index was not exactly stateIndex + 1. Always 0. */
    lookaheadViolations: number;
}

/**
 * The standardized state-broadcast contract every engine feeds into. It is the
 * single object a consumer (or an automated test) can assert against.
 */
export interface MarketSanityMetrics {
    symbol: string;
    activeEntropyScore: number;
    entropyState: EntropyState;
    network: {
        currentPingMs: number;
        averageTickLifespanMs: number;
        isExecutionSafe: boolean;
    };
    matrixConcentricConvergence: Record<number, { windowsAligned: number[]; state: ConvergenceState }>;
    timestamp: number;
}
