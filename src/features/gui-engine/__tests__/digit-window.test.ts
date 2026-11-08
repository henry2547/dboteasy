import { computeDigitStats, computeParityStats, isWindowComplete, pushTick, replaceWindow } from '../digit-window';
import type { EngineTick } from '../types';

function tick(epoch: number, digit: number, symbol = 'R_100'): EngineTick {
    return {
        key: `${symbol}:${epoch}:${digit}`,
        symbol,
        epoch,
        quote: digit,
        formattedQuote: `1.${digit}`,
        lastDigit: digit,
    };
}

describe('rolling digit window', () => {
    it('never stores the same observation twice', () => {
        const first = pushTick([], tick(1, 4));
        const again = pushTick(first, tick(1, 4));
        expect(again).toBe(first);
        expect(again).toHaveLength(1);
    });

    it('keeps only the latest 1,000 ticks in chronological order', () => {
        let window: EngineTick[] = [];
        for (let index = 0; index < 1005; index++) {
            window = pushTick(window, tick(index, index % 10));
        }
        expect(window).toHaveLength(1000);
        expect(window[0].epoch).toBe(5);
        expect(window[999].epoch).toBe(1004);
    });

    it('rebuilds the window from history without duplicates', () => {
        const rebuilt = replaceWindow([], [tick(3, 1), tick(1, 2), tick(3, 1)]);
        expect(rebuilt.map(item => item.epoch)).toEqual([1, 3]);
    });

    it('computes individual digit shares over the observed window', () => {
        const stats = computeDigitStats([tick(1, 0), tick(2, 1), tick(3, 1), tick(4, 7)]);
        expect(stats.total).toBe(4);
        expect(stats.counts[0]).toBe(1);
        expect(stats.counts[1]).toBe(2);
        expect(stats.percent[1]).toBeCloseTo(50, 5);
    });

    it('computes even/odd shares against the 50% baseline', () => {
        const parity = computeParityStats([tick(1, 2), tick(2, 4), tick(3, 1), tick(4, 3)]);
        expect(parity.even).toBe(2);
        expect(parity.odd).toBe(2);
        expect(parity.evenPercent).toBe(50);
        expect(parity.evenDelta).toBe(0);
        expect(parity.baseline).toBe(50);
    });

    it('knows when the full window is loaded', () => {
        expect(isWindowComplete(Array.from({ length: 999 }, (_, index) => tick(index, 0)))).toBe(false);
        expect(isWindowComplete(Array.from({ length: 1000 }, (_, index) => tick(index, 0)))).toBe(true);
    });
});
