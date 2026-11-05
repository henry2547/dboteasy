/**
 * Strategy Engine — pure, stream-driven evaluation of Deriv digit markets.
 *
 * Educational market-analysis only: this module never sends a trade and never
 * reads a floating-point quote for digit parsing. It ingests a rolling FIFO of
 * already-normalized tick *digits* (0–9, extracted string-safe upstream via
 * `precision.ts`), and emits structured `ExecutionSignal` objects for eight
 * digit-market strategies.
 *
 * All probability maths is integer-safe; rounding never happens here — the UI
 * rounds for display. Every conditional filter is documented inline with the
 * probability reasoning behind it.
 */

export const STRATEGY_NAMES = [
    'OVER_1',
    'OVER_2',
    'UNDER_7',
    'UNDER_8',
    'EVEN',
    'ODD',
    'MATCHES',
    'DIFFERS',
] as const;

export type StrategyName = (typeof STRATEGY_NAMES)[number];

/** The flat stake every simulated entry uses — anti-Martingale guardrail. */
export const FLAT_STAKE = 1;

/** Consecutive simulated losses before a strategy's circuit breaker trips. */
export const CIRCUIT_BREAKER_LOSSES = 3;

/** Cool-down applied once a circuit breaker trips (5 minutes). */
export const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

/** Maximum frequency of full evaluation dispatch (throttle boundary). */
export const EVAL_THROTTLE_MS = 100;

export interface ExecutionSignalMetrics {
    /** Per-digit occurrence count over the analysis window. */
    targetDigitFrequencies: Record<number, number>;
    /** Length of the currently-active digit streak (consecutive repeats). */
    activeStreakLength: number;
    /** Digit(s) holding the statistical peak (highest occurrence) in the window. */
    statisticalPeakDigits: number[];
}

export interface ExecutionSignal {
    strategyName: StrategyName;
    symbol: string;
    shouldTriggerSignal: boolean;
    /** The digit the live stream must strike to fire the entry, or the target. */
    targetTriggerDigit: number;
    currentAnalysisWindow: number;
    metrics: ExecutionSignalMetrics;
    timestamp: number;
}

/** A resolved simulated outcome for a fired signal. */
export interface StrategyOutcome {
    strategyName: StrategyName;
    result: 'win' | 'loss';
    entryDigit: number;
    settleDigit: number;
    targetDigit: number;
    timestamp: number;
}

const isEven = (d: number) => d % 2 === 0;
const isOdd = (d: number) => d % 2 === 1;

/**
 * Count occurrences and percentages of each digit (0–9) across a digit slice.
 * A fair 10-digit wheel expects each digit at ~10%; deviations from that are
 * the signal the engine hunts for.
 */
export function computeDigitFrequencies(digits: number[]): { counts: number[]; percentages: number[] } {
    const counts = new Array(10).fill(0);
    for (const d of digits) {
        if (Number.isInteger(d) && d >= 0 && d <= 9) counts[d]++;
    }
    const total = digits.length || 1;
    const percentages = counts.map(c => (c / total) * 100);
    return { counts, percentages };
}

/** Digits sharing the maximum percentage (the statistical peak cluster). */
export function peakDigits(percentages: number[]): number[] {
    const max = Math.max(...percentages);
    if (max <= 0) return [];
    const peaks: number[] = [];
    percentages.forEach((p, d) => {
        if (p === max) peaks.push(d);
    });
    return peaks;
}

/** Length of the run of identical digits ending at the tail of the slice. */
export function activeStreakLength(digits: number[]): number {
    if (digits.length === 0) return 0;
    const last = digits[digits.length - 1];
    let len = 0;
    for (let i = digits.length - 1; i >= 0 && digits[i] === last; i--) len++;
    return len;
}

function mean(slice: number[]): number {
    if (slice.length === 0) return 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Adjacent physical neighbours on the 0–9 digit wheel (wrapping). A digit is
 * "isolated" when both neighbours are suppressed, so the wheel has a gap around
 * it — the probability mass that would spread to the neighbours is instead
 * concentrated on the digit itself.
 */
function neighbours(digit: number): [number, number] {
    return [((digit + 9) % 10) /* d - 1 wrapped */, (digit + 1) % 10];
}

function buildMetrics(
    counts: number[],
    percentages: number[],
    digits: number[]
): ExecutionSignalMetrics {
    const freq: Record<number, number> = {};
    counts.forEach((c, d) => {
        freq[d] = c;
    });
    return {
        targetDigitFrequencies: freq,
        activeStreakLength: activeStreakLength(digits),
        statisticalPeakDigits: peakDigits(percentages),
    };
}

function signal(
    name: StrategyName,
    symbol: string,
    shouldTrigger: boolean,
    targetDigit: number,
    window: number,
    counts: number[],
    percentages: number[],
    digits: number[]
): ExecutionSignal {
    return {
        strategyName: name,
        symbol,
        shouldTriggerSignal: shouldTrigger,
        targetTriggerDigit: targetDigit,
        currentAnalysisWindow: window,
        metrics: buildMetrics(counts, percentages, digits),
        timestamp: Date.now(),
    };
}

/* ------------------------------------------------------------------ */
/* Module A — Over 1 & Over 2 (Floor Suppression Tracker)              */
/* ------------------------------------------------------------------ */

/**
 * OVER 1 — bet the next digit is > 1.
 *
 * Probability reasoning: when digits 0 and 1 are both suppressed below their
 * fair 10% share, the lower floor of the wheel is starved of mass. If the
 * remaining mass is simultaneously concentrated on the high odd digits (5, 7,
 * 9), the distribution is skewed away from the floor, so a tick landing on 1 is
 * a statistically unlikely event that is expected to revert upward. Entry
 * fires the instant the live tick strikes digit 1.
 */
function evaluateOver1(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);
    const floorSuppressed = percentages[0] < 10 && percentages[1] < 10;
    const peaks = peakDigits(percentages);
    const peakOnHighOdd = peaks.some(d => d === 5 || d === 7 || d === 9);
    const shouldTrigger = floorSuppressed && peakOnHighOdd && latest === 1;
    return signal('OVER_1', symbol, shouldTrigger, 1, window, counts, percentages, digits);
}

/**
 * OVER 2 — bet the next digit is > 2.
 *
 * Probability reasoning: digits 0, 1 and 2 are all exhausted below 10%, so the
 * bottom third of the wheel carries little mass. On top of that, the high
 * digits (7, 8, 9) must show *immediate upward velocity* — their recent
 * micro-window (last 5 ticks) is trending up relative to the 5 ticks before
 * it, confirming the skew is actively drifting higher, not static. Entry
 * fires when the live tick touches 1 or 2 (the suppressed floor).
 */
function evaluateOver2(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);
    const floorSuppressed = percentages[0] < 10 && percentages[1] < 10 && percentages[2] < 10;

    const micro = digits.slice(-5);
    const prevMicro = digits.slice(-10, -5);
    const upwardVelocity = micro.length === 5 && prevMicro.length === 5 && mean(micro) > mean(prevMicro) && micro.some(d => d >= 7);

    const shouldTrigger = floorSuppressed && upwardVelocity && (latest === 1 || latest === 2);
    return signal('OVER_2', symbol, shouldTrigger, latest === 2 ? 2 : 1, window, counts, percentages, digits);
}

/* ------------------------------------------------------------------ */
/* Module B — Under 7 & Under 8 (Ceiling Suppression Tracker)          */
/* ------------------------------------------------------------------ */

/**
 * UNDER 7 — bet the next digit is < 7.
 *
 * Probability reasoning: the ceiling digits 7, 8, 9 are all depressed below
 * 10%, so the top of the wheel is starved. With the statistical peak sitting
 * cleanly on the low digits 0–3, the mass is anchored low, so a tick striking
 * 7 is an excursion into suppressed territory expected to revert down. Entry
 * fires the instant the live tick strikes digit 7.
 */
function evaluateUnder7(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);
    const ceilingSuppressed = percentages[7] < 10 && percentages[8] < 10 && percentages[9] < 10;
    const peaks = peakDigits(percentages);
    const peakOnLow = peaks.some(d => d === 0 || d === 1 || d === 2 || d === 3);
    const shouldTrigger = ceilingSuppressed && peakOnLow && latest === 7;
    return signal('UNDER_7', symbol, shouldTrigger, 7, window, counts, percentages, digits);
}

/**
 * UNDER 8 — bet the next digit is < 8.
 *
 * Probability reasoning: digits 8 and 9 are heavily exhausted below 10%, so
 * the very top of the wheel is starved of mass. Entry fires immediately when the
 * live cursor strikes 8 or 9, betting on mean reversion back toward the low
 * range — the suppressed ceiling makes a follow-through above 8 unlikely.
 */
function evaluateUnder8(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);
    const ceilingSuppressed = percentages[8] < 10 && percentages[9] < 10;
    const shouldTrigger = ceilingSuppressed && (latest === 8 || latest === 9);
    return signal('UNDER_8', symbol, shouldTrigger, latest === 9 ? 9 : 8, window, counts, percentages, digits);
}

/* ------------------------------------------------------------------ */
/* Module C — Even / Odd (Sequence Exhaustion Array)                  */
/* ------------------------------------------------------------------ */

/**
 * EVEN — bet the next digit is even.
 *
 * Probability reasoning: at least three even digits must each be running
 * above 10.5% — i.e. the even side of the wheel is statistically overloaded.
 * When the live stream then registers *exactly* two consecutive odd digits
 * (a short exhaustion of the overloaded side), parity is due to snap back, so
 * the next tick is flagged as an even entry.
 */
function evaluateEven(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);
    const evenDigits = [0, 2, 4, 6, 8];
    const overloadedEvens = evenDigits.filter(d => percentages[d] > 10.5).length >= 3;

    // Exactly two consecutive odd digits at the tail (not three): the last two
    // are odd, and the one before them (if present) is even.
    const n = digits.length;
    const lastTwoOdd = n >= 2 && isOdd(digits[n - 1]) && isOdd(digits[n - 2]);
    const thirdIsEven = n < 3 || isEven(digits[n - 3]);
    const exactlyTwoOdd = lastTwoOdd && thirdIsEven;

    const shouldTrigger = overloadedEvens && exactlyTwoOdd;
    return signal('EVEN', symbol, shouldTrigger, latest, window, counts, percentages, digits);
}

/**
 * ODD — bet the next digit is odd.
 *
 * Probability reasoning: at least three odd digits must each be running above
 * 10.5% — the odd side of the wheel is statistically overloaded. When the live
 * stream registers *exactly* two consecutive even digits, parity is due to
 * snap back to the overloaded odd side, so the next tick is flagged as an odd
 * entry.
 */
function evaluateOdd(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);
    const oddDigits = [1, 3, 5, 7, 9];
    const overloadedOdds = oddDigits.filter(d => percentages[d] > 10.5).length >= 3;

    const n = digits.length;
    const lastTwoEven = n >= 2 && isEven(digits[n - 1]) && isEven(digits[n - 2]);
    const thirdIsOdd = n < 3 || isOdd(digits[n - 3]);
    const exactlyTwoEven = lastTwoEven && thirdIsOdd;

    const shouldTrigger = overloadedOdds && exactlyTwoEven;
    return signal('ODD', symbol, shouldTrigger, latest, window, counts, percentages, digits);
}

/* ------------------------------------------------------------------ */
/* Module D — Matches & Differs (Extremity Mapping)                   */
/* ------------------------------------------------------------------ */

/**
 * MATCHES — bet the next digit equals an isolated target.
 *
 * Probability reasoning: find a digit whose two wheel-neighbours are both
 * suppressed below 9.5%. With the neighbours starved, the probability mass
 * that would normally spread to them is concentrated on the isolated digit,
 * raising its chance of printing. Among the isolated candidates the one with
 * the highest frequency is the target. Entry waits for an *anchor* strike:
 * even targets anchor on digit 2, odd targets anchor on digit 4 — a
 * deterministic trigger point tied to the target's parity.
 */
function evaluateMatches(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);

    let target = -1;
    let targetCount = -1;
    for (let d = 0; d <= 9; d++) {
        const [lo, hi] = neighbours(d);
        const isolated = percentages[lo] < 9.5 && percentages[hi] < 9.5;
        if (isolated && counts[d] > targetCount) {
            target = d;
            targetCount = counts[d];
        }
    }

    const hasTarget = target >= 0;
    const anchor = hasTarget ? (isEven(target) ? 2 : 4) : -1;
    const shouldTrigger = hasTarget && latest === anchor;

    return signal('MATCHES', symbol, shouldTrigger, target, window, counts, percentages, digits);
}

/**
 * DIFFERS — bet the next digit differs from an exhausted target.
 *
 * Probability reasoning: find the most intensely exhausted digit — the one
 * with the lowest frequency that is still below 8.5%. Such an ultra-rare digit
 * printing once is already a low-probability event; the mathematical likelihood
 * of it printing twice back-to-back is the product of two rare events, so the
 * engine enters a Differs contract immediately after that digit appears live.
 */
function evaluateDiffers(digits: number[], latest: number, symbol: string, window: number): ExecutionSignal {
    const { counts, percentages } = computeDigitFrequencies(digits);

    let target = -1;
    let targetPct = Infinity;
    for (let d = 0; d <= 9; d++) {
        if (percentages[d] < 8.5 && percentages[d] < targetPct) {
            target = d;
            targetPct = percentages[d];
        }
    }

    const hasTarget = target >= 0;
    const shouldTrigger = hasTarget && latest === target;

    return signal('DIFFERS', symbol, shouldTrigger, target, window, counts, percentages, digits);
}

const EVALUATORS: Record<StrategyName, (digits: number[], latest: number, symbol: string, window: number) => ExecutionSignal> = {
    OVER_1: evaluateOver1,
    OVER_2: evaluateOver2,
    UNDER_7: evaluateUnder7,
    UNDER_8: evaluateUnder8,
    EVEN: evaluateEven,
    ODD: evaluateOdd,
    MATCHES: evaluateMatches,
    DIFFERS: evaluateDiffers,
};

/**
 * Evaluate a single strategy over the given window of digits. The `latest`
 * digit is the live incoming tick the trigger is tested against.
 */
export function evaluateStrategy(
    name: StrategyName,
    windowDigits: number[],
    latest: number,
    symbol: string,
    window: number
): ExecutionSignal {
    return EVALUATORS[name](windowDigits, latest, symbol, window);
}

/**
 * Resolve the simulated outcome of a fired signal against the *next* tick's
 * digit (the settle digit). This is what the circuit breaker counts: three
 * consecutive losses trip the strategy.
 */
export function resolveOutcome(name: StrategyName, settleDigit: number, targetDigit: number): 'win' | 'loss' {
    switch (name) {
        case 'OVER_1':
            return settleDigit > 1 ? 'win' : 'loss';
        case 'OVER_2':
            return settleDigit > 2 ? 'win' : 'loss';
        case 'UNDER_7':
            return settleDigit < 7 ? 'win' : 'loss';
        case 'UNDER_8':
            return settleDigit < 8 ? 'win' : 'loss';
        case 'EVEN':
            return isEven(settleDigit) ? 'win' : 'loss';
        case 'ODD':
            return isOdd(settleDigit) ? 'win' : 'loss';
        case 'MATCHES':
            return settleDigit === targetDigit ? 'win' : 'loss';
        case 'DIFFERS':
            return settleDigit !== targetDigit ? 'win' : 'loss';
        default:
            return 'loss';
    }
}

/** Human-readable label for a strategy. */
export function strategyLabel(name: StrategyName): string {
    switch (name) {
        case 'OVER_1':
            return 'Over 1';
        case 'OVER_2':
            return 'Over 2';
        case 'UNDER_7':
            return 'Under 7';
        case 'UNDER_8':
            return 'Under 8';
        case 'EVEN':
            return 'Even';
        case 'ODD':
            return 'Odd';
        case 'MATCHES':
            return 'Matches';
        case 'DIFFERS':
            return 'Differs';
        default:
            return name;
    }
}

/** Short description of what a strategy's entry predicts. */
export function strategyDescription(name: StrategyName): string {
    switch (name) {
        case 'OVER_1':
            return 'Next digit > 1 — floor suppression on 0 & 1, peak on high odds.';
        case 'OVER_2':
            return 'Next digit > 2 — floor 0–2 suppressed, high digits rising.';
        case 'UNDER_7':
            return 'Next digit < 7 — ceiling 7–9 suppressed, peak on lows.';
        case 'UNDER_8':
            return 'Next digit < 8 — ceiling 8 & 9 exhausted, revert down.';
        case 'EVEN':
            return 'Next digit even — 3+ evens overloaded, two odds in a row.';
        case 'ODD':
            return 'Next digit odd — 3+ odds overloaded, two evens in a row.';
        case 'MATCHES':
            return 'Next digit matches isolated target — neighbours suppressed.';
        case 'DIFFERS':
            return 'Next digit differs from exhausted target — no back-to-back.';
        default:
            return '';
    }
}

/** The Deriv contract_type code a strategy maps to (for reference only). */
export function contractTypeForStrategy(name: StrategyName): string {
    switch (name) {
        case 'OVER_1':
        case 'OVER_2':
            return 'DIGITOVER';
        case 'UNDER_7':
        case 'UNDER_8':
            return 'DIGITUNDER';
        case 'EVEN':
            return 'DIGITEVEN';
        case 'ODD':
            return 'DIGITODD';
        case 'MATCHES':
            return 'DIGITMATCH';
        case 'DIFFERS':
            return 'DIGITDIFF';
        default:
            return '';
    }
}
