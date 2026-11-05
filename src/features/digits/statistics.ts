/**
 * Pure statistical calculations over a slice of normalized ticks.
 *
 * Every function here is side-effect free so it can be reasoned about (and
 * tested) without a WebSocket. Values are left unrounded; the UI rounds.
 */

import type { BarrierStat, DigitFrequency, DigitStreak, DigitStatistics, NormalizedTick } from './types';

/** The percentage each digit is expected to take on a fair 10-digit wheel. */
export const EXPECTED_DIGIT_PERCENTAGE = 10;

export const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Barriers used by the Over/Under rules: Over 1, Over 2, Under 8, Under 7. */
export const DEFAULT_BARRIERS = [1, 2, 7, 8];

export function barrierLabel(barrier: number): string {
    return barrier <= 4 ? `Over ${barrier}` : `Under ${barrier}`;
}

export function digitSequence(ticks: NormalizedTick[]): number[] {
    return ticks.map(tick => tick.lastDigit).filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9);
}

function ranksFor(counts: number[]): number[] {
    const uniqueSorted = [...new Set(counts)].sort((a, b) => b - a);
    return counts.map(count => uniqueSorted.indexOf(count) + 1);
}

function computeStreaks(digits: number[]): { current: DigitStreak | null; longest: DigitStreak | null } {
    let longest: DigitStreak | null = null;
    let current: DigitStreak | null = null;

    digits.forEach(digit => {
        current = current && current.digit === digit ? { digit, length: current.length + 1 } : { digit, length: 1 };
        if (!longest || current.length > longest.length) longest = { ...current };
    });

    return { current, longest };
}

export function calculateDigitStatistics(ticks: NormalizedTick[]): DigitStatistics {
    return calculateStatisticsFromDigits(digitSequence(ticks));
}

/**
 * The same statistics, computed straight from a digit sequence. The market
 * scanner uses this so it can rank many markets without building tick objects.
 */
export function calculateStatisticsFromDigits(digits: number[]): DigitStatistics {
    const sampleSize = digits.length;

    const counts = DIGITS.map(() => 0);
    digits.forEach(digit => {
        counts[digit] += 1;
    });

    const ranks = ranksFor(counts);
    const maxCount = counts.length ? Math.max(...counts) : 0;
    const minCount = counts.length ? Math.min(...counts) : 0;
    const uniqueSortedDesc = [...new Set(counts)].sort((a, b) => b - a);

    const frequencies: DigitFrequency[] = DIGITS.map(digit => {
        const count = counts[digit];
        const percentage = sampleSize === 0 ? 0 : (count / sampleSize) * 100;
        const deviationFromExpected = percentage - EXPECTED_DIGIT_PERCENTAGE;

        return {
            digit,
            count,
            percentage,
            deviationFromExpected,
            absoluteDeviation: Math.abs(deviationFromExpected),
            rank: sampleSize === 0 ? 0 : ranks[digit],
            isMostFrequent: sampleSize > 0 && count === maxCount,
            isLeastFrequent: sampleSize > 0 && count === minCount,
        };
    });

    const digitsWithCount = (target: number | undefined): number[] =>
        target === undefined ? [] : DIGITS.filter(digit => counts[digit] === target);

    const evenCount = DIGITS.filter(digit => digit % 2 === 0).reduce((sum, digit) => sum + counts[digit], 0);
    const oddCount = sampleSize - evenCount;
    const lowCount = DIGITS.filter(digit => digit <= 4).reduce((sum, digit) => sum + counts[digit], 0);
    const highCount = sampleSize - lowCount;

    const deviationMean = sampleSize
        ? frequencies.reduce((sum, frequency) => sum + frequency.absoluteDeviation, 0) / DIGITS.length
        : null;
    const deviationMax = sampleSize ? Math.max(...frequencies.map(f => f.absoluteDeviation)) : null;

    const { current, longest } = computeStreaks(digits);

    return {
        sampleSize,
        frequencies,

        mostFrequentDigits: digitsWithCount(uniqueSortedDesc[0]),
        secondMostFrequentDigits: digitsWithCount(uniqueSortedDesc[1]),
        leastFrequentDigits: digitsWithCount(uniqueSortedDesc[uniqueSortedDesc.length - 1]),
        secondLeastFrequentDigits: digitsWithCount(uniqueSortedDesc[uniqueSortedDesc.length - 2]),

        evenCount,
        oddCount,
        evenPercentage: sampleSize ? (evenCount / sampleSize) * 100 : 0,
        oddPercentage: sampleSize ? (oddCount / sampleSize) * 100 : 0,

        lowCount,
        highCount,
        lowPercentage: sampleSize ? (lowCount / sampleSize) * 100 : 0,
        highPercentage: sampleSize ? (highCount / sampleSize) * 100 : 0,

        averageDigit: sampleSize ? digits.reduce((sum, digit) => sum + digit, 0) / sampleSize : null,

        meanAbsoluteDeviationFromTen: deviationMean,
        maximumAbsoluteDeviationFromTen: deviationMax,

        currentStreak: current,
        longestStreak: longest,
    };
}

/**
 * Per-barrier view of the feed: how often ticks fall below / on / above the
 * barrier, how often they land immediately either side of it, and which digit
 * tends to follow those touches.
 */
export function calculateBarrierStats(digits: number[], barriers: number[] = DEFAULT_BARRIERS): BarrierStat[] {
    const total = digits.length;

    return barriers.map(barrier => {
        const nextAfterBelow: number[] = [];
        const nextAfterAbove: number[] = [];

        digits.forEach((digit, index) => {
            const next = digits[index + 1];
            if (next === undefined) return;
            if (digit === barrier - 1) nextAfterBelow.push(next);
            if (digit === barrier + 1) nextAfterAbove.push(next);
        });

        const belowCount = digits.filter(digit => digit < barrier).length;
        const atCount = digits.filter(digit => digit === barrier).length;
        const aboveCount = digits.filter(digit => digit > barrier).length;

        return {
            barrier,
            label: barrierLabel(barrier),
            belowCount,
            atCount,
            aboveCount,
            belowPercentage: total ? (belowCount / total) * 100 : 0,
            atPercentage: total ? (atCount / total) * 100 : 0,
            abovePercentage: total ? (aboveCount / total) * 100 : 0,
            immediateBelowCount: digits.filter(digit => digit === barrier - 1).length,
            immediateAboveCount: digits.filter(digit => digit === barrier + 1).length,
            nextAfterBelow,
            nextAfterAbove,
            overWinRate: total ? (aboveCount / total) * 100 : null,
            underWinRate: total ? (belowCount / total) * 100 : null,
        };
    });
}

/** Most common digit among a set of follow-up digits, for the barrier panel. */
export function mostCommonDigit(digits: number[]): { digit: number; count: number } | null {
    if (digits.length === 0) return null;

    const counts = DIGITS.map(() => 0);
    digits.forEach(digit => {
        counts[digit] += 1;
    });

    let bestDigit = 0;
    let bestCount = counts[0];
    counts.forEach((count, digit) => {
        if (count > bestCount) {
            bestCount = count;
            bestDigit = digit;
        }
    });

    return { digit: bestDigit, count: bestCount };
}
