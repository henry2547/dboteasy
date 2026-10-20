/**
 * Plain-language analysis summary for one scanned market.
 *
 * Everything here is derived from the scanned digit sample only — no network,
 * no React. The important constraint: the *qualification* decision is not made
 * here. It comes from `matchFreeBotSetup`, the single source of the scanner's
 * Over 1 / Under 8 rules, so the summary can never contradict the setup the
 * result row offers or weaken a qualifying condition.
 */

import { matchFreeBotSetup } from '@/pages/free-bots/scanner-match';
import { calculateStatisticsFromDigits } from './statistics';
import type { DigitFrequency, DigitStatistics } from './types';

/** Below this many ticks a half-window reading is too thin to call a trend. */
export const MIN_TREND_SAMPLE = 20;
/** A losing-share move smaller than this stays "stable". */
export const TREND_STABLE_BAND_PERCENT = 1.5;

export type SetupStrategy = 'over1' | 'under8';

export type QualificationStatus = 'qualified' | 'unqualified' | 'insufficient';

export type TrendDirection = 'improving' | 'deteriorating' | 'stable' | 'unknown';

export interface DigitTrend {
    direction: TrendDirection;
    /** Moving-average-style read of the digit group across the sample halves. */
    earlierPercentage: number | null;
    recentPercentage: number | null;
    /** Recent share minus earlier share, in percentage points. */
    deltaPercentagePoints: number | null;
    label: string;
}

export interface ScanSetupSummary {
    strategy: SetupStrategy | null;
    /** 'Over 1' / 'Under 8', or '—' when the sample is too small to judge. */
    strategyLabel: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER' | null;
    /** The Over or Under barrier digit the setup trades against. */
    barrier: number | null;
    /** The digits that lose the contract for this setup. */
    losingDigits: number[];
    /** Sum of the losing digits' shares of the sample — the combined losing %. */
    combinedLosingPercentage: number | null;
    /** Combined losing % a fair wheel would give this setup (digits × 10%). */
    expectedLosingPercentage: number | null;
    /** Trajectory of the losing digits across the sample. */
    trend: DigitTrend;
    qualified: boolean;
    armed: boolean;
    status: QualificationStatus;
    statusLabel: string;
    /** Concise explanation, phrased by the scanner's own rule module. */
    reason: string;
}

/** The digits that lose the contract for an Over/Under setup. */
export function losingDigitsFor(strategy: SetupStrategy, barrier: number): number[] {
    const digits: number[] = [];
    for (let digit = 0; digit <= 9; digit++) {
        const loses = strategy === 'over1' ? digit <= barrier : digit >= barrier;
        if (loses) digits.push(digit);
    }
    return digits;
}

/** Sum of the given digits' shares of the sample. */
export function combinedPercentage(frequencies: DigitFrequency[], digits: number[]): number | null {
    if (frequencies.length === 0 || digits.length === 0) return null;
    const total = digits.reduce((sum, digit) => sum + (frequencies.find(item => item.digit === digit)?.percentage ?? 0), 0);
    return Number.isFinite(total) ? total : null;
}

/**
 * Compares a digit group's share in the earlier half of the sample with the
 * recent half. Fewer than two full halves of `MIN_TREND_SAMPLE` ticks reports
 * `unknown` rather than a trend built on thin data.
 */
export function digitGroupTrend(digits: number[], group: number[]): DigitTrend {
    const half = Math.floor(digits.length / 2);
    const unknown: DigitTrend = {
        direction: 'unknown',
        earlierPercentage: null,
        recentPercentage: null,
        deltaPercentagePoints: null,
        label: 'Not enough ticks for a trend',
    };

    if (group.length === 0 || half < MIN_TREND_SAMPLE) return unknown;

    const earlier = digits.slice(digits.length - half * 2, digits.length - half);
    const recent = digits.slice(digits.length - half);

    const shareOf = (sample: number[]) => {
        if (sample.length === 0) return null;
        const hits = sample.filter(digit => group.includes(digit)).length;
        return (hits / sample.length) * 100;
    };

    const earlierPercentage = shareOf(earlier);
    const recentPercentage = shareOf(recent);
    if (earlierPercentage === null || recentPercentage === null) return unknown;

    const delta = recentPercentage - earlierPercentage;
    // A rising losing-digit share makes the setup worse, a falling one better.
    const direction: TrendDirection =
        Math.abs(delta) <= TREND_STABLE_BAND_PERCENT ? 'stable' : delta > 0 ? 'deteriorating' : 'improving';
    const verb = direction === 'improving' ? 'improving' : direction === 'deteriorating' ? 'worsening' : 'stable';

    return {
        direction,
        earlierPercentage,
        recentPercentage,
        deltaPercentagePoints: delta,
        label: `Losing share ${earlierPercentage.toFixed(1)}% → ${recentPercentage.toFixed(1)}% (${verb})`,
    };
}

export function statusLabelFor(status: QualificationStatus): string {
    if (status === 'qualified') return 'Qualified';
    if (status === 'unqualified') return 'Not qualified';
    return 'Insufficient data';
}

/**
 * Builds the summary shown next to one scanned market. Pass the statistics the
 * caller already computed to avoid recalculating them.
 */
export function summariseScanSetup(
    digits: number[],
    statistics: DigitStatistics = calculateStatisticsFromDigits(digits)
): ScanSetupSummary {
    const setup = matchFreeBotSetup(digits);

    if (!setup) {
        return {
            strategy: null,
            strategyLabel: '—',
            contractType: null,
            barrier: null,
            losingDigits: [],
            combinedLosingPercentage: null,
            expectedLosingPercentage: null,
            trend: digitGroupTrend(digits, []),
            qualified: false,
            armed: false,
            status: 'insufficient',
            statusLabel: statusLabelFor('insufficient'),
            reason: `Only ${digits.length} ticks were read — at least 30 are needed to judge a setup.`,
        };
    }

    const barrier = setup.prediction;
    const losingDigits = losingDigitsFor(setup.strategy, barrier);
    const combinedLosingPercentage = combinedPercentage(statistics.frequencies, losingDigits);
    const status: QualificationStatus = setup.ready ? 'qualified' : 'unqualified';

    return {
        strategy: setup.strategy,
        strategyLabel: setup.strategyLabel,
        contractType: setup.contractType,
        barrier,
        losingDigits,
        combinedLosingPercentage,
        expectedLosingPercentage: losingDigits.length * 10,
        trend: digitGroupTrend(digits, losingDigits),
        qualified: setup.ready,
        armed: setup.armed,
        status,
        statusLabel: statusLabelFor(status),
        reason: setup.reason,
    };
}
