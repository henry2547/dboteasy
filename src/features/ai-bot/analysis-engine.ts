/**
 * Digit-analysis engine for the AI scanner.
 *
 * Extends the existing digits-lab statistics (statistics.ts) with:
 * - Digit transition statistics (Markov-style first-order transitions).
 * - Consecutive digit pairs and streaks.
 * - Pattern confirmation ("00 → 0", "11 → 0", "88 → 9", "99 → 9").
 * - Historical observational outcomes for qualifying setups.
 * - Frequency stability across configurable windows.
 *
 * Pure functions — no network, no side effects. Deterministic and testable.
 */

import { calculateStatisticsFromDigits, DIGITS, EXPECTED_DIGIT_PERCENTAGE } from '../digits/statistics';
import type { MarketAnalysis, ScannerConfig } from './types';

/** Build a 10×10 transition count matrix from a digit sequence. */
export function transitionMatrix(digits: number[]): number[][] {
    const matrix: number[][] = DIGITS.map(() => DIGITS.map(() => 0));
    for (let i = 1; i < digits.length; i++) {
        const from = digits[i - 1];
        const to = digits[i];
        if (from >= 0 && from <= 9 && to >= 0 && to <= 9) {
            matrix[from][to] += 1;
        }
    }
    return matrix;
}

/** Count consecutive digit pairs: "00", "11", "12", etc. */
export function pairCountsFromDigits(digits: number[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let i = 1; i < digits.length; i++) {
        const key = `${digits[i - 1]}${digits[i]}`;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

/**
 * Frequency stability: how much the per-digit percentage changes between the
 * first and second half of the window. Lower = more stable.
 */
export function frequencyStability(digits: number[]): number {
    if (digits.length < 10) return 100;
    const mid = Math.floor(digits.length / 2);
    const first = calculateStatisticsFromDigits(digits.slice(0, mid));
    const second = calculateStatisticsFromDigits(digits.slice(mid));

    let totalDelta = 0;
    for (const d of DIGITS) {
        const f1 = first.frequencies[d].percentage;
        const f2 = second.frequencies[d].percentage;
        totalDelta += Math.abs(f1 - f2);
    }
    return totalDelta / DIGITS.length;
}

/**
 * Check whether a two-digit pattern (e.g. "00") appeared at the end of the
 * sequence — the last two digits match the pattern.
 */
export function patternConfirmed(digits: number[], pattern: string): boolean {
    if (digits.length < 2 || pattern.length !== 2) return false;
    const last = `${digits[digits.length - 2]}${digits[digits.length - 1]}`;
    return last === pattern;
}

/**
 * Historical observational outcome: given a pattern (e.g. "00"), look at every
 * time it appeared and check whether the *next* digit satisfied the target
 * condition. Returns the win-rate as a percentage, or null if the pattern
 * never appeared.
 */
export function observationalOutcome(
    digits: number[],
    pattern: string,
    condition: (digit: number) => boolean
): number | null {
    if (digits.length < 3 || pattern.length !== 2) return null;

    let occurrences = 0;
    let wins = 0;

    for (let i = 0; i < digits.length - 2; i++) {
        const pair = `${digits[i]}${digits[i + 1]}`;
        if (pair === pattern) {
            occurrences += 1;
            if (condition(digits[i + 2])) wins += 1;
        }
    }

    if (occurrences === 0) return null;
    return (wins / occurrences) * 100;
}

/** Over 1 condition: digit > 1. */
const isOver1 = (d: number) => d > 1;
/** Under 8 condition: digit < 8. */
const isUnder8 = (d: number) => d < 8;

/**
 * Compute the full market analysis for the scanner.
 */
export function analyzeMarket(
    symbol: string,
    displayName: string,
    digits: number[],
    config: ScannerConfig,
    lastTickAt: number | null
): MarketAnalysis {
    const window = digits.slice(-config.analysisWindow);
    const stats = calculateStatisticsFromDigits(window);
    const transitions = transitionMatrix(window);
    const pairCounts = pairCountsFromDigits(window);

    // Observational outcomes for the configured patterns.
    const observationalWinRates: Record<string, number | null> = {};
    for (const pattern of config.patternOver1) {
        observationalWinRates[`${pattern}→Over1`] = observationalOutcome(window, pattern, isOver1);
    }
    for (const pattern of config.patternUnder8) {
        observationalWinRates[`${pattern}→Under8`] = observationalOutcome(window, pattern, isUnder8);
    }

    const feedFresh = lastTickAt !== null && Date.now() - lastTickAt < 15000;

    // Hottest / coldest digit of the sample, so the UI can mark them.
    const counts = stats.frequencies.map(f => f.count);
    const hottestCount = Math.max(...counts);
    const coldestCount = Math.min(...counts);

    return {
        symbol,
        displayName,
        sampleSize: stats.sampleSize,
        frequencies: stats.frequencies.map(f => ({
            digit: f.digit,
            count: f.count,
            percentage: f.percentage,
            deviationFromExpected: f.deviationFromExpected,
            absoluteDeviation: f.absoluteDeviation,
            isMostFrequent: f.count === hottestCount,
            isLeastFrequent: f.count === coldestCount,
        })),
        evenPercentage: stats.evenPercentage,
        oddPercentage: stats.oddPercentage,
        lowPercentage: stats.lowPercentage,
        highPercentage: stats.highPercentage,
        meanAbsoluteDeviation: stats.meanAbsoluteDeviationFromTen ?? 0,
        currentStreak: stats.currentStreak,
        transitions,
        pairCounts,
        observationalWinRates,
        feedFresh,
        lastTickAt,
    };
}

/** The expected percentage for a fair digit wheel. */
export { EXPECTED_DIGIT_PERCENTAGE };
