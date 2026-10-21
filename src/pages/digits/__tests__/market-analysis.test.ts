import { matchFreeBotSetup } from '@/pages/free-bots/scanner-match';
import {
    MIN_TREND_SAMPLE,
    combinedPercentage,
    digitGroupTrend,
    losingDigitsFor,
    summariseScanSetup,
} from '../market-analysis';
import { calculateStatisticsFromDigits } from '../statistics';

/** 100 ticks: digits 0 and 1 take 5% each, digit 5 dominates — a valid Over 1 setup. */
function qualifiedSample(): number[] {
    const firstHalf = [...Array(5).fill(0), ...Array(5).fill(1), ...Array(40).fill(5)];
    const secondHalf = [...Array(25).fill(5), ...Array(25).fill(7)];
    return [...firstHalf, ...secondHalf];
}

describe('losingDigitsFor', () => {
    it('keeps the digits at or below the barrier for an Over setup', () => {
        expect(losingDigitsFor('over1', 1)).toEqual([0, 1]);
        expect(losingDigitsFor('over1', 2)).toEqual([0, 1, 2]);
    });

    it('keeps the digits at or above the barrier for an Under setup', () => {
        expect(losingDigitsFor('under8', 8)).toEqual([8, 9]);
        expect(losingDigitsFor('under8', 7)).toEqual([7, 8, 9]);
    });
});

describe('combinedPercentage', () => {
    it('sums the shares of the given digits', () => {
        const statistics = calculateStatisticsFromDigits(qualifiedSample());
        // Digits 0 and 1 take 5% each in this sample.
        expect(combinedPercentage(statistics.frequencies, [0, 1])).toBeCloseTo(10, 5);
    });

    it('returns null when there is nothing to sum', () => {
        const statistics = calculateStatisticsFromDigits([]);
        expect(combinedPercentage(statistics.frequencies, [])).toBeNull();
    });
});

describe('digitGroupTrend', () => {
    it('reports unknown for a sample too thin for two halves', () => {
        const trend = digitGroupTrend([...Array(MIN_TREND_SAMPLE * 2 - 1).fill(5)], [0, 1]);
        expect(trend.direction).toBe('unknown');
        expect(trend.earlierPercentage).toBeNull();
    });

    it('calls a falling losing share improving', () => {
        const trend = digitGroupTrend(qualifiedSample(), [0, 1]);
        expect(trend.direction).toBe('improving');
        expect(trend.earlierPercentage).toBeCloseTo(20, 5);
        expect(trend.recentPercentage).toBeCloseTo(0, 5);
        expect(trend.deltaPercentagePoints).toBeCloseTo(-20, 5);
    });

    it('calls a rising losing share deteriorating', () => {
        const rising = [...Array(50).fill(5), ...Array(5).fill(0), ...Array(5).fill(1), ...Array(40).fill(5)];
        expect(digitGroupTrend(rising, [0, 1]).direction).toBe('deteriorating');
    });

    it('stays stable for a flat losing share', () => {
        expect(digitGroupTrend(Array(100).fill(5), [5]).direction).toBe('stable');
    });
});

describe('summariseScanSetup', () => {
    it('reports insufficient data below the scanner minimum sample', () => {
        const summary = summariseScanSetup(Array(12).fill(4));
        expect(summary.status).toBe('insufficient');
        expect(summary.strategy).toBeNull();
        expect(summary.combinedLosingPercentage).toBeNull();
        expect(summary.reason).toContain('at least 30');
    });

    it('describes the Over 1 setup, its barrier and its combined losing share', () => {
        const summary = summariseScanSetup(qualifiedSample());
        expect(summary.strategy).toBe('over1');
        expect(summary.strategyLabel).toBe('Over 1');
        expect(summary.barrier).toBe(1);
        expect(summary.losingDigits).toEqual([0, 1]);
        expect(summary.combinedLosingPercentage).toBeCloseTo(10, 5);
        expect(summary.status).toBe('qualified');
        expect(summary.statusLabel).toBe('Qualified');
    });

    it('never disagrees with the scanner rules about qualification', () => {
        const samples = [
            qualifiedSample(),
            Array(60).fill(3),
            [...Array(40).fill(9), ...Array(40).fill(8)],
            [...Array(50).fill(2), ...Array(50).fill(6)],
            Array(45).fill(0),
        ];

        samples.forEach(sample => {
            const summary = summariseScanSetup(sample);
            const setup = matchFreeBotSetup(sample);
            expect(summary.qualified).toBe(setup?.ready ?? false);
            expect(summary.strategy).toBe(setup?.strategy ?? null);
            expect(summary.barrier).toBe(setup?.prediction ?? null);
            if (setup) expect(summary.reason).toBe(setup.reason);
        });
    });
});
