/**
 * Pure market-analysis for the scanner.
 *
 * Everything here is a side-effect-free function over a slice of digits, so it
 * can be unit-tested with deterministic fixtures and reasoned about without a
 * WebSocket. The scanner calls these for every eligible market on every cycle.
 *
 * It reuses the existing `calculateDigitStatistics` from the Digits Lab for the
 * per-digit frequency work, then adds transitions, pairs, pattern observations
 * and a transparent scoring function on top.
 */

import { calculateDigitStatistics, digitSequence, EXPECTED_DIGIT_PERCENTAGE } from '../digits/statistics';
import type { NormalizedTick } from '../digits/types';
import type { MarketScan, MarketSymbol, PatternDef, PatternObservation, StrategyId } from './scanner-types';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 10x10 transition matrix: transitions[a][b] = times digit b followed digit a. */
export function computeTransitions(digits: number[]): number[][] {
    const matrix = DIGITS.map(() => DIGITS.map(() => 0));
    for (let index = 1; index < digits.length; index++) {
        matrix[digits[index - 1]][digits[index]] += 1;
    }
    return matrix;
}

/** Consecutive two-digit pair counts, flattened as [a*10+b] for 0..99. */
export function computePairs(digits: number[]): number[] {
    const pairs = new Array(100).fill(0);
    for (let index = 1; index < digits.length; index++) {
        pairs[digits[index - 1] * 10 + digits[index]] += 1;
    }
    return pairs;
}

/** Current streak ending at the last digit. */
function currentStreak(digits: number[]): { digit: number; length: number } | null {
    if (digits.length === 0) return null;
    const last = digits[digits.length - 1];
    let length = 0;
    for (let index = digits.length - 1; index >= 0; index--) {
        if (digits[index] !== last) break;
        length += 1;
    }
    return { digit: last, length };
}

/**
 * For each pattern, counts how often its two-digit sequence appeared in the
 * window, how often the *next* digit cleared the barrier, and whether the
 * current last-two digits are a live confirmation.
 *
 * The pattern confirmation (the two digits) is deliberately separated from the
 * contract outcome (the digit that follows) — the scanner never conflates them.
 */
export function observePatterns(digits: number[], patterns: PatternDef[]): PatternObservation[] {
    return patterns.map(pattern => {
        let confirmations = 0;
        let wins = 0;

        for (let index = 0; index < digits.length - 2; index++) {
            if (digits[index] !== pattern.sequence[0] || digits[index + 1] !== pattern.sequence[1]) continue;
            confirmations += 1;
            const next = digits[index + 2];
            const won = pattern.direction === 'over' ? next > pattern.barrier : next < pattern.barrier;
            if (won) wins += 1;
        }

        const lastTwo =
            digits.length >= 2 ? [digits[digits.length - 2], digits[digits.length - 1]] : [];
        const currentlyConfirmed =
            lastTwo.length === 2 && lastTwo[0] === pattern.sequence[0] && lastTwo[1] === pattern.sequence[1];

        return {
            pattern,
            confirmations,
            wins,
            observedWinRate: confirmations > 0 ? (wins / confirmations) * 100 : null,
            currentlyConfirmed,
        };
    });
}

/** Stability of the frequency distribution across the two halves of the window. */
function frequencyStability(digits: number[]): number {
    if (digits.length < 20) return 0;
    const mid = Math.floor(digits.length / 2);
    const stats = (slice: number[]) => {
        const counts = DIGITS.map(() => 0);
        slice.forEach(d => (counts[d] += 1));
        const total = slice.length || 1;
        return DIGITS.map(d => (counts[d] / total) * 100);
    };
    const first = stats(digits.slice(0, mid));
    const second = stats(digits.slice(mid));
    // 1 - mean absolute difference between the two halves, scaled to 0..100.
    const mad = DIGITS.reduce((sum, d) => sum + Math.abs(first[d] - second[d]), 0) / DIGITS.length;
    return Math.max(0, 100 - mad * 5);
}

export interface ScanContext {
    minSampleSize: number;
    minEvidence: number;
    patterns: PatternDef[];
    enabledStrategies: StrategyId[];
    maxQuoteAgeMs: number;
    now: number;
}

/**
 * Evaluates a single market and returns the full measurement set plus a
 * transparent score. Returns null when the market has no usable data yet.
 */
export function evaluateMarket(
    market: MarketSymbol,
    ticks: NormalizedTick[],
    ctx: ScanContext
): MarketScan | null {
    const window = digitSequence(ticks).slice(-ctx.minSampleSize);
    const sampleSize = window.length;

    const stats = calculateDigitStatistics(window);
    const frequencies = stats.frequencies.map(f => f.percentage);
    const deviations = stats.frequencies.map(f => f.absoluteDeviation);
    const transitions = computeTransitions(window);
    const pairs = computePairs(window);
    const patterns = observePatterns(window, ctx.patterns);
    const stability = frequencyStability(window);

    const lastTick = ticks.length > 0 ? ticks[ticks.length - 1] : null;
    const lastTickEpoch = lastTick ? lastTick.epoch : null;
    const feedAgeMs = lastTickEpoch ? ctx.now - lastTickEpoch * 1000 : null;
    const feedFresh = feedAgeMs !== null && feedAgeMs <= ctx.maxQuoteAgeMs;

    const reasons: string[] = [];
    const qualifyingStrategies: StrategyId[] = [];

    // --- transparent, configurable scoring -------------------------------------
    let score = 0;

    // Bias edge: how far the most-skewed digit departs from 10%.
    const maxDeviation = Math.max(...deviations, 0);
    if (sampleSize >= ctx.minSampleSize) {
        score += maxDeviation * 2;
        if (maxDeviation >= 3) reasons.push(`Digit bias ${maxDeviation.toFixed(1)} pts from 10%.`);
    } else {
        reasons.push(`Insufficient sample (${sampleSize}/${ctx.minSampleSize}).`);
    }

    // Stability bonus.
    score += stability * 0.3;
    if (stability >= 70 && sampleSize >= ctx.minSampleSize) reasons.push(`Stable frequencies (${stability.toFixed(0)}%).`);

    // Parity edge.
    const evenEdge = Math.abs(stats.evenPercentage - 50);
    if (ctx.enabledStrategies.includes('even') && evenEdge >= 5) {
        score += evenEdge;
        qualifyingStrategies.push('even');
        reasons.push(`Even ${stats.evenPercentage.toFixed(0)}% (+${evenEdge.toFixed(0)} pts).`);
    }
    if (ctx.enabledStrategies.includes('odd') && evenEdge >= 5) {
        qualifyingStrategies.push('odd');
        reasons.push(`Odd ${stats.oddPercentage.toFixed(0)}%.`);
    }

    // Over/Under pattern confirmations.
    patterns.forEach(obs => {
        if (obs.confirmations >= ctx.minEvidence) {
            score += obs.confirmations * 1.5;
            const dir = obs.pattern.direction;
            const strat = dir === 'over' ? 'over1' : 'under8';
            if (ctx.enabledStrategies.includes(strat)) {
                qualifyingStrategies.push(strat);
                reasons.push(
                    `${obs.pattern.label}: ${obs.confirmations}× confirmed` +
                        (obs.observedWinRate !== null ? `, ${obs.observedWinRate.toFixed(0)}% cleared` : '') +
                        (obs.currentlyConfirmed ? ' — live now.' : '.')
                );
            }
        }
    });

    // Matches/Differs candidate: a digit with a strong frequency edge.
    const sorted = [...stats.frequencies].sort((a, b) => b.percentage - a.percentage);
    const topDigit = sorted[0];
    if (topDigit && topDigit.percentage - EXPECTED_DIGIT_PERCENTAGE >= 3 && sampleSize >= ctx.minSampleSize) {
        if (ctx.enabledStrategies.includes('matches')) {
            qualifyingStrategies.push('matches');
            reasons.push(`Digit ${topDigit.digit} over-represented (${topDigit.percentage.toFixed(0)}%) — Matches candidate.`);
        }
    }
    const bottomDigit = sorted[sorted.length - 1];
    if (bottomDigit && EXPECTED_DIGIT_PERCENTAGE - bottomDigit.percentage >= 3 && sampleSize >= ctx.minSampleSize) {
        if (ctx.enabledStrategies.includes('differs')) {
            qualifyingStrategies.push('differs');
            reasons.push(`Digit ${bottomDigit.digit} under-represented (${bottomDigit.percentage.toFixed(0)}%) — Differs candidate.`);
        }
    }

    if (!feedFresh) reasons.push(`Feed stale (${feedAgeMs !== null ? Math.round(feedAgeMs / 1000) : '?'}s old).`);

    return {
        symbol: market.apiSymbol,
        displayName: market.displayName,
        category: market.category,
        availability: market.availability,
        sampleSize,
        frequencies,
        deviations,
        meanAbsoluteDeviation: stats.meanAbsoluteDeviationFromTen ?? 0,
        frequencyStability: stability,
        transitions,
        pairs,
        evenPercentage: stats.evenPercentage,
        oddPercentage: stats.oddPercentage,
        lowPercentage: stats.lowPercentage,
        highPercentage: stats.highPercentage,
        currentStreak: currentStreak(window),
        patterns,
        lastTickEpoch,
        feedAgeMs,
        feedFresh,
        score,
        reasons,
        qualifyingStrategies,
    };
}

/** Ranks markets by score descending; ties broken by sample size then freshness. */
export function rankMarkets(scans: MarketScan[]): MarketScan[] {
    return scans
        .filter(scan => scan.sampleSize > 0)
        .sort((a, b) => b.score - a.score || b.sampleSize - a.sampleSize || (b.feedAgeMs ?? Infinity) - (a.feedAgeMs ?? Infinity));
}
