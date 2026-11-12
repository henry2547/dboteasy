/**
 * The two AI bot rules are pure reading over scanned ticks, so they are pinned here without a
 * feed: hot/cold parity confirmed on the last five digits for Even-Odd, and a strictly
 * rising/falling five-tick run for Rise-Fall.
 */

import { EVEN_ODD_WINDOW, buildInsights, countSignals, readHotCold, readRun } from '../signals';
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

/** Digits with digit 2 hottest and digit 0 coldest (both even), then an Even-leaning tail. */
const EVEN_MARKET = [...digitsOf([4, 6, 20, 12, 12, 12, 12, 12, 12, 10]), 2, 4, 6, 8, 2];
/** Digits with digit 3 hottest and digit 1 coldest (both odd), then an Odd-leaning tail. */
const ODD_MARKET = [...digitsOf([6, 4, 12, 20, 12, 12, 12, 12, 10, 10]), 1, 3, 5, 7, 9];

describe('readHotCold', () => {
    it('reads no setup below the minimum sample', () => {
        const reading = readHotCold([2, 2, 2]);
        expect(reading.hotDigit).toBeNull();
        expect(reading.coldDigit).toBeNull();
        expect(reading.parity).toBeNull();
        expect(reading.window).toEqual([]);
        expect(reading.signal).toBeNull();
    });

    it('signals Even when hot/cold are even and the last five digits lean even', () => {
        const reading = readHotCold(EVEN_MARKET);

        expect(reading.hotDigit).toBe(2);
        expect(reading.coldDigit).toBe(0);
        expect(reading.parity).toBe('even');
        expect(reading.window).toEqual([2, 4, 6, 8, 2]);
        expect(reading.aligned).toBe(5);
        expect(reading.signal).toBe('Even');
    });

    it('signals Odd on a cold odd digit confirmed by the last five digits', () => {
        const reading = readHotCold(ODD_MARKET);
        expect(reading.hotDigit).toBe(3);
        expect(reading.coldDigit).toBe(1);
        expect(reading.parity).toBe('odd');
        expect(reading.signal).toBe('Odd');
    });

    it('stays quiet when hot and cold split parity', () => {
        // Digit 1 is the hottest (odd) and digit 0 the coldest (even).
        const split = readHotCold([...digitsOf([2, 20, 12, 12, 12, 12, 12, 12, 12, 10]), 1, 3, 5, 7, 9]);
        expect(split.parity).toBeNull();
        expect(split.signal).toBeNull();
    });

    it('stays quiet when the last five digits do not lean to the parity', () => {
        const mixed = readHotCold([...digitsOf([4, 6, 20, 12, 12, 12, 12, 12, 12, 10]), 2, 4, 5, 7, 9]);
        expect(mixed.parity).toBe('even');
        expect(mixed.aligned).toBe(2);
        expect(mixed.confirmed).toBe(false);
        expect(mixed.signal).toBeNull();
    });

    it('confirms on three of the five digits', () => {
        const leaning = readHotCold([...digitsOf([4, 6, 20, 12, 12, 12, 12, 12, 12, 10]), 2, 4, 6, 7, 9]);
        expect(leaning.window).toHaveLength(EVEN_ODD_WINDOW);
        expect(leaning.aligned).toBe(3);
        expect(leaning.signal).toBe('Even');
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

    it('reads five ticks by default', () => {
        expect(readRun([1, 2, 3, 4, 5])).toMatchObject({ runLength: 5, signal: 'Fall' });
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
        digits: EVEN_MARKET,
        prices: [1, 2, 3, 4, 5, 6],
    });
    const failedRow = row({
        symbol: 'R_75',
        displayName: 'Volatility 75 Index',
        status: 'failed',
        reason: 'This market is closed.',
    });

    it('describes the Even-Odd reading per market', () => {
        const [insight] = buildInsights('even_odd', [evenRow, failedRow], { marketScope: 'all' });

        expect(insight.signal).toBe('Even');
        expect(insight.status).toContain('Trade Even');
        expect(insight.detail).toBe('cold 0 · hot 2');
        expect(buildInsights('even_odd', [failedRow], { marketScope: 'all' })[0].status).toBe(
            'This market is closed.'
        );
    });

    it('describes the Rise-Fall reading per market and counts the signals', () => {
        const insights = buildInsights('rise_fall', [evenRow, failedRow], { marketScope: 'all' });

        expect(insights[0].signal).toBe('Fall');
        expect(insights[0].status).toBe('Trade Fall / Last 5 ticks rising');
        expect(countSignals(insights)).toBe(1);
    });

    it('narrows the list to the chosen market', () => {
        const insights = buildInsights('even_odd', [evenRow, failedRow], { marketScope: 'R_75' });
        expect(insights.map(insight => insight.row.symbol)).toEqual(['R_75']);
    });
});
