/**
 * The two AI bot rules are pure reading over scanned ticks, so they are pinned here without a
 * feed: hot/cold parity for Even-Odd, and a strictly rising/falling run for Rise-Fall.
 */

import { buildInsights, countSignals, readHotCold, readRun } from '../signals';
import type { ScanRow } from '../types';

/** `counts[digit]` copies of each digit. */
function digitsOf(counts: number[]): number[] {
    const digits: number[] = [];
    counts.forEach((count, digit) => {
        for (let i = 0; i < count; i += 1) digits.push(digit);
    });
    return digits;
}

function row(overrides: Partial<ScanRow>): ScanRow {
    return {
        symbol: 'R_100',
        displayName: 'Volatility 100 Index',
        digits: [],
        prices: [],
        status: 'scanned',
        reason: null,
        scannedAt: 1,
        ...overrides,
    };
}

describe('readHotCold', () => {
    it('reads no setup below the minimum sample', () => {
        expect(readHotCold([2, 2, 2])).toEqual({
            hotDigit: null,
            coldDigit: null,
            parity: null,
            lastDigit: null,
            matched: null,
            signal: null,
        });
    });

    it('signals Even when the hot and cold digits are both even and the newest digit is either', () => {
        // Digit 2 is the hottest (20%), digit 0 the coldest (4%); the newest digit is 2.
        const digits = digitsOf([4, 6, 20, 12, 12, 12, 12, 12, 12, 10]);
        const reading = readHotCold([...digits, 2]);

        expect(reading.hotDigit).toBe(2);
        expect(reading.coldDigit).toBe(0);
        expect(reading.parity).toBe('even');
        expect(reading.matched).toBe('hot');
        expect(reading.signal).toBe('Even');
    });

    it('signals on the cold digit as well as the hot one', () => {
        // 1 is the hottest odd digit, 0 the coldest even one — split parity, so no signal.
        const split = readHotCold([...digitsOf([2, 4, 14, 20, 12, 12, 12, 12, 12, 10]), 1]);
        expect(split.parity).toBeNull();
        expect(split.signal).toBeNull();

        // Both odd: 3 hottest, 1 coldest, newest digit 1.
        const odd = readHotCold([...digitsOf([6, 4, 12, 20, 12, 12, 12, 12, 10, 10]), 1]);
        expect(odd.parity).toBe('odd');
        expect(odd.matched).toBe('cold');
        expect(odd.signal).toBe('Odd');
    });

    it('stays quiet while the newest digit is neither the hot nor the cold digit', () => {
        const reading = readHotCold([...digitsOf([4, 6, 20, 12, 12, 12, 12, 12, 12, 10]), 5]);
        expect(reading.parity).toBe('even');
        expect(reading.matched).toBeNull();
        expect(reading.signal).toBeNull();
    });
});

describe('readRun', () => {
    it('signals Fall on a continuously rising run', () => {
        expect(readRun([1, 2, 3, 4, 5, 6], 5)).toEqual({
            direction: 'rising',
            signal: 'Fall',
            run: 5,
            runLength: 5,
        });
    });

    it('signals Rise on a continuously falling run', () => {
        expect(readRun([6, 5, 4, 3, 2, 1], 5)).toMatchObject({ direction: 'falling', signal: 'Rise' });
    });

    it('breaks the run on a flat tick', () => {
        expect(readRun([1, 2, 3, 4, 5, 5], 5)).toMatchObject({ direction: null, signal: null, run: 0 });
    });

    it('waits until the sample holds the whole run', () => {
        expect(readRun([1, 2, 3], 5)).toMatchObject({ direction: null, signal: null, runLength: 5 });
    });
});

describe('buildInsights', () => {
    const evenRow = row({
        digits: [...digitsOf([4, 6, 20, 12, 12, 12, 12, 12, 12, 10]), 2],
        prices: [1, 2, 3, 4, 5, 6],
    });
    const failedRow = row({
        symbol: 'R_75',
        displayName: 'Volatility 75 Index',
        status: 'failed',
        reason: 'This market is closed.',
    });

    it('describes the Even-Odd reading per market', () => {
        const [insight] = buildInsights('even_odd', [evenRow, failedRow], { ticks: 5, marketScope: 'all' });

        expect(insight.signal).toBe('Even');
        expect(insight.status).toContain('Trade Even');
        expect(insight.detail).toBe('cold 0 · hot 2');
        expect(buildInsights('even_odd', [failedRow], { ticks: 5, marketScope: 'all' })[0].status).toBe(
            'This market is closed.'
        );
    });

    it('describes the Rise-Fall reading per market and counts the signals', () => {
        const insights = buildInsights('rise_fall', [evenRow, failedRow], { ticks: 5, marketScope: 'all' });

        expect(insights[0].signal).toBe('Fall');
        expect(insights[0].status).toBe('Trade Fall / Last 5 ticks rising');
        expect(countSignals(insights)).toBe(1);
    });

    it('narrows the list to the chosen market', () => {
        const insights = buildInsights('even_odd', [evenRow, failedRow], { ticks: 5, marketScope: 'R_75' });
        expect(insights.map(insight => insight.row.symbol)).toEqual(['R_75']);
    });
});
