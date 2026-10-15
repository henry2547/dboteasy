/**
 * Deriv Digits Analysis Lab — Domain Logic
 *
 * Pure functions for precision resolution, quote formatting, last-digit extraction,
 * FIFO tick storage, statistics, strategy evaluation, and barrier observation.
 * All functions are testable without a WebSocket connection.
 */

import {
    BARRIERS,
    EXPECTED_DIGIT_PERCENTAGE,
    MAX_TICKS,
} from './constants';
import type {
    DigitFrequency,
    DigitStatistics,
    DigitStreak,
    NormalizedTick,
    PrecisionState,
    StrategyResult,
    BarrierObservation,
} from './types';

// ---------------------------------------------------------------------------
// Precision
// ---------------------------------------------------------------------------

export function decimalsFromPipIncrement(pipSize: number | string): number | null {
    const numeric = Number(pipSize);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (numeric >= 1) return 0;

    const text = String(pipSize).toLowerCase();
    if (text.includes('e-')) {
        const exponent = Number(text.split('e-')[1]);
        return Number.isInteger(exponent) ? exponent : null;
    }

    const decimalIndex = text.indexOf('.');
    return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
}

export function resolvePrecision(state: PrecisionState): PrecisionState {
    if (state.historyDecimalPlaces != null && Number.isInteger(state.historyDecimalPlaces)) {
        return { ...state, resolvedDecimalPlaces: state.historyDecimalPlaces, source: 'history' };
    }
    if (state.liveDecimalPlaces != null && Number.isInteger(state.liveDecimalPlaces)) {
        return { ...state, resolvedDecimalPlaces: state.liveDecimalPlaces, source: 'live-tick' };
    }
    if (state.activeSymbolPipIncrement != null) {
        const decimals = decimalsFromPipIncrement(state.activeSymbolPipIncrement);
        if (decimals != null) {
            return { ...state, resolvedDecimalPlaces: decimals, source: 'active-symbol' };
        }
    }
    return { ...state, resolvedDecimalPlaces: null, source: 'unresolved' };
}

// ---------------------------------------------------------------------------
// Quote formatting & last-digit extraction
// ---------------------------------------------------------------------------

export function formatQuote(quote: number | string, decimalPlaces: number): string {
    const numericQuote = Number(quote);
    if (!Number.isFinite(numericQuote)) throw new Error('Invalid quote');
    return numericQuote.toFixed(decimalPlaces);
}

export function extractLastDigit(formattedQuote: string): number {
    const digits = formattedQuote.replace(/\D/g, '');
    const finalCharacter = digits.at(-1);
    if (finalCharacter === undefined) throw new Error('No digit found');
    return Number(finalCharacter);
}

export function normalizeTick(
    rawQuote: number | string,
    epoch: number,
    symbol: string,
    decimalPlaces: number,
    source: 'history' | 'live',
    apiTickId?: string | null
): NormalizedTick {
    const formattedQuote = formatQuote(rawQuote, decimalPlaces);
    const lastDigit = extractLastDigit(formattedQuote);
    const numericQuote = Number(rawQuote);
    return {
        key: `${symbol}:${epoch}:${formattedQuote}`,
        apiTickId: apiTickId ?? null,
        symbol,
        epoch,
        date: new Date(epoch * 1000),
        quote: numericQuote,
        formattedQuote,
        lastDigit,
        source,
    };
}

// ---------------------------------------------------------------------------
// FIFO storage
// ---------------------------------------------------------------------------

export function appendTickFIFO(ticks: NormalizedTick[], newTick: NormalizedTick): NormalizedTick[] {
    return [...ticks, newTick].slice(-MAX_TICKS);
}

export function isDuplicateTick(ticks: NormalizedTick[], newTick: NormalizedTick): boolean {
    return ticks.some((t) => t.key === newTick.key);
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function calculateDigitFrequencies(ticks: NormalizedTick[]): DigitFrequency[] {
    const sampleSize = ticks.length;
    const counts = new Array(10).fill(0);

    for (const tick of ticks) {
        counts[tick.lastDigit]++;
    }

    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);

    // Compute ranks (lower rank number = more frequent)
    const sortedUnique = [...new Set(counts)].sort((a, b) => b - a);
    const rankMap = new Map<number, number>();
    sortedUnique.forEach((count, index) => rankMap.set(count, index + 1));

    return counts.map((count, digit) => {
        const percentage = sampleSize > 0 ? (count / sampleSize) * 100 : 0;
        const deviationFromExpected = percentage - EXPECTED_DIGIT_PERCENTAGE;
        return {
            digit,
            count,
            percentage,
            deviationFromExpected,
            absoluteDeviation: Math.abs(deviationFromExpected),
            rank: rankMap.get(count) ?? 0,
            isMostFrequent: count === maxCount && count > 0,
            isLeastFrequent: count === minCount && sampleSize > 0,
        };
    });
}

export function calculateStreaks(ticks: NormalizedTick[]): {
    current: DigitStreak | null;
    longest: DigitStreak | null;
} {
    if (ticks.length === 0) return { current: null, longest: null };

    let longest: DigitStreak | null = null;
    let currentDigit = ticks[0].lastDigit;
    let currentLen = 1;
    let bestLen = 1;
    let bestDigit = currentDigit;

    for (let i = 1; i < ticks.length; i++) {
        const d = ticks[i].lastDigit;
        if (d === currentDigit) {
            currentLen++;
        } else {
            if (currentLen > bestLen) {
                bestLen = currentLen;
                bestDigit = currentDigit;
            }
            currentDigit = d;
            currentLen = 1;
        }
    }
    if (currentLen > bestLen) {
        bestLen = currentLen;
        bestDigit = currentDigit;
    }

    longest = { digit: bestDigit, length: bestLen };
    current = { digit: currentDigit, length: currentLen };

    return { current, longest };
}

export function calculateStatistics(ticks: NormalizedTick[]): DigitStatistics {
    const frequencies = calculateDigitFrequencies(ticks);
    const sampleSize = ticks.length;

    const mostFrequentDigits = frequencies.filter((f) => f.isMostFrequent).map((f) => f.digit);
    const leastFrequentDigits = frequencies.filter((f) => f.isLeastFrequent).map((f) => f.digit);

    let evenCount = 0;
    let oddCount = 0;
    let lowCount = 0;
    let highCount = 0;
    let digitSum = 0;

    for (const tick of ticks) {
        const d = tick.lastDigit;
        digitSum += d;
        if (d % 2 === 0) evenCount++;
        else oddCount++;
        if (d < 5) lowCount++;
        else highCount++;
    }

    const { current, longest } = calculateStreaks(ticks);

    return {
        sampleSize,
        frequencies,
        mostFrequentDigits,
        leastFrequentDigits,
        evenCount,
        oddCount,
        evenPercentage: sampleSize > 0 ? (evenCount / sampleSize) * 100 : 0,
        oddPercentage: sampleSize > 0 ? (oddCount / sampleSize) * 100 : 0,
        lowCount,
        highCount,
        lowPercentage: sampleSize > 0 ? (lowCount / sampleSize) * 100 : 0,
        highPercentage: sampleSize > 0 ? (highCount / sampleSize) * 100 : 0,
        averageDigit: sampleSize > 0 ? digitSum / sampleSize : null,
        currentStreak: current,
        longestStreak: longest,
    };
}

// ---------------------------------------------------------------------------
// Strategy evaluation (the "learning" program)
// ---------------------------------------------------------------------------

/**
 * Evaluate barrier-based strategies: Over 1, Over 2, Under 8, Under 7.
 * Each strategy "enters" on every tick and wins if the digit clears the barrier.
 * The program learns by tracking win rates, streaks, and trends over the tick window.
 */
export function evaluateBarrierStrategies(ticks: NormalizedTick[]): StrategyResult[] {
    const strategies: { id: string; name: string; description: string; threshold: number; direction: 'over' | 'under' }[] = [
        { id: 'over_1', name: 'Over 1', description: 'Digit is 2 or higher (above 1)', threshold: BARRIERS.OVER_1, direction: 'over' },
        { id: 'over_2', name: 'Over 2', description: 'Digit is 3 or higher (above 2)', threshold: BARRIERS.OVER_2, direction: 'over' },
        { id: 'under_8', name: 'Under 8', description: 'Digit is 7 or lower (below 8)', threshold: BARRIERS.UNDER_8, direction: 'under' },
        { id: 'under_7', name: 'Under 7', description: 'Digit is 6 or lower (below 7)', threshold: BARRIERS.UNDER_7, direction: 'under' },
    ];

    return strategies.map((s) => {
        const results: ('win' | 'loss')[] = [];
        let wins = 0;
        let losses = 0;
        let currentStreak = 0;
        let longestWinStreak = 0;
        let longestLossStreak = 0;
        let currentWinStreak = 0;
        let currentLossStreak = 0;

        for (const tick of ticks) {
            const d = tick.lastDigit;
            const isWin = s.direction === 'over' ? d > s.threshold : d < s.threshold;

            if (isWin) {
                wins++;
                results.push('win');
                currentWinStreak++;
                currentLossStreak = 0;
                if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak;
            } else {
                losses++;
                results.push('loss');
                currentLossStreak++;
                currentWinStreak = 0;
                if (currentLossStreak > longestLossStreak) longestLossStreak = currentLossStreak;
            }
        }

        currentStreak = results.length > 0 && results[results.length - 1] === 'win' ? currentWinStreak : -currentLossStreak;

        // Trend: compare last 20% win rate vs overall
        const recentCount = Math.min(20, results.length);
        const recentWins = results.slice(-recentCount).filter((r) => r === 'win').length;
        const recentWinRate = recentCount > 0 ? (recentWins / recentCount) * 100 : 0;
        const overallWinRate = results.length > 0 ? (wins / results.length) * 100 : 0;
        const trend = recentWinRate > overallWinRate + 3 ? 'improving' : recentWinRate < overallWinRate - 3 ? 'declining' : 'stable';

        return {
            id: s.id,
            name: s.name,
            description: s.description,
            totalEntries: results.length,
            wins,
            losses,
            winRate: results.length > 0 ? (wins / results.length) * 100 : 0,
            currentStreak,
            longestWinStreak,
            longestLossStreak,
            lastSignal: results.length > 0 ? results[results.length - 1] : null,
            trend,
            recentResults: results.slice(-30),
        };
    });
}

/**
 * Evaluate Even/Odd market strategy.
 */
export function evaluateEvenOddStrategy(ticks: NormalizedTick[]): StrategyResult[] {
    const results: ('win' | 'loss')[] = [];
    let evenWins = 0;
    let oddWins = 0;
    let currentStreak = 0;
    let longestEvenStreak = 0;
    let longestOddStreak = 0;
    let currentEvenStreak = 0;
    let currentOddStreak = 0;

    for (const tick of ticks) {
        const isEven = tick.lastDigit % 2 === 0;
        if (isEven) {
            evenWins++;
            results.push('win');
            currentEvenStreak++;
            currentOddStreak = 0;
            if (currentEvenStreak > longestEvenStreak) longestEvenStreak = currentEvenStreak;
        } else {
            oddWins++;
            results.push('loss');
            currentOddStreak++;
            currentEvenStreak = 0;
            if (currentOddStreak > longestOddStreak) longestOddStreak = currentOddStreak;
        }
    }

    currentStreak = results.length > 0 && results[results.length - 1] === 'win' ? currentEvenStreak : -currentOddStreak;

    const recentCount = Math.min(20, results.length);
    const recentWins = results.slice(-recentCount).filter((r) => r === 'win').length;
    const recentWinRate = recentCount > 0 ? (recentWins / recentCount) * 100 : 0;
    const overallWinRate = results.length > 0 ? (evenWins / results.length) * 100 : 0;
    const trend = recentWinRate > overallWinRate + 3 ? 'improving' : recentWinRate < overallWinRate - 3 ? 'declining' : 'stable';

    return [
        {
            id: 'even',
            name: 'Even',
            description: 'Digit is even (0, 2, 4, 6, 8)',
            totalEntries: results.length,
            wins: evenWins,
            losses: oddWins,
            winRate: results.length > 0 ? (evenWins / results.length) * 100 : 0,
            currentStreak,
            longestWinStreak: longestEvenStreak,
            longestLossStreak: longestOddStreak,
            lastSignal: results.length > 0 ? results[results.length - 1] : null,
            trend,
            recentResults: results.slice(-30),
        },
        {
            id: 'odd',
            name: 'Odd',
            description: 'Digit is odd (1, 3, 5, 7, 9)',
            totalEntries: results.length,
            wins: oddWins,
            losses: evenWins,
            winRate: results.length > 0 ? (oddWins / results.length) * 100 : 0,
            currentStreak: -currentStreak,
            longestWinStreak: longestOddStreak,
            longestLossStreak: longestEvenStreak,
            lastSignal: results.length > 0 ? (results[results.length - 1] === 'loss' ? 'win' : 'loss') : null,
            trend: trend === 'improving' ? 'declining' : trend === 'declining' ? 'improving' : 'stable',
            recentResults: results.slice(-30).map((r) => (r === 'win' ? 'loss' : 'win')),
        },
    ];
}

/**
 * Observe what happens when the ticker hits numbers below and above barriers.
 * Tracks consecutive hits/misses and hit rates for each barrier.
 */
export function observeBarriers(ticks: NormalizedTick[]): BarrierObservation[] {
    const barriers: { barrier: string; threshold: number; direction: 'over' | 'under' }[] = [
        { barrier: 'Over 1', threshold: BARRIERS.OVER_1, direction: 'over' },
        { barrier: 'Over 2', threshold: BARRIERS.OVER_2, direction: 'over' },
        { barrier: 'Under 8', threshold: BARRIERS.UNDER_8, direction: 'under' },
        { barrier: 'Under 7', threshold: BARRIERS.UNDER_7, direction: 'under' },
    ];

    return barriers.map((b) => {
        let hits = 0;
        let misses = 0;
        let consecutiveHits = 0;
        let consecutiveMisses = 0;
        let maxConsecutiveHits = 0;
        let maxConsecutiveMisses = 0;
        let lastHit: boolean | null = null;

        for (const tick of ticks) {
            const d = tick.lastDigit;
            const isHit = b.direction === 'over' ? d > b.threshold : d < b.threshold;

            if (isHit) {
                hits++;
                consecutiveHits++;
                consecutiveMisses = 0;
                if (consecutiveHits > maxConsecutiveHits) maxConsecutiveHits = consecutiveHits;
            } else {
                misses++;
                consecutiveMisses++;
                consecutiveHits = 0;
                if (consecutiveMisses > maxConsecutiveMisses) maxConsecutiveMisses = consecutiveMisses;
            }
            lastHit = isHit;
        }

        // Use the current running streak (last result)
        const currentConsecutiveHits = lastHit === true ? consecutiveHits : 0;
        const currentConsecutiveMisses = lastHit === false ? consecutiveMisses : 0;

        return {
            barrier: b.barrier,
            threshold: b.threshold,
            direction: b.direction,
            hits,
            misses,
            hitRate: ticks.length > 0 ? (hits / ticks.length) * 100 : 0,
            lastHit,
            consecutiveHits: currentConsecutiveHits,
            consecutiveMisses: currentConsecutiveMisses,
        };
    });
}

/**
 * Digit circle percentages — returns the percentage for each digit 0-9
 * for circular visualization.
 */
export function getDigitCirclePercentages(ticks: NormalizedTick[]): number[] {
    const stats = calculateStatistics(ticks);
    return stats.frequencies.map((f) => f.percentage);
}
