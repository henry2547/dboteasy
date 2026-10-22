/**
 * The digit-window rules behind the new Digits blocks, tested in isolation.
 *
 * Every number is measured from the digits the engine actually received: a digit that never
 * appeared reports -1 instead of pretending it just did, and a window with nothing to measure
 * reports 0 rather than an invented share.
 */
import {
    digitGap,
    lastDigitsOfSample,
    longestDigitRun,
    parityShare,
    repeatShare,
    transitionCount,
} from '../digit-analysis';

describe('digit window sampling', () => {
    it('keeps the newest digits of the sample and tolerates a sample larger than the history', () => {
        expect(lastDigitsOfSample([1, 2, 3, 4], 2)).toEqual([3, 4]);
        expect(lastDigitsOfSample([1, 2, 3], 100)).toEqual([1, 2, 3]);
        expect(lastDigitsOfSample([1, 2, 3], 0)).toEqual([1, 2, 3]);
    });

    it('ignores values that are not a whole digit', () => {
        expect(lastDigitsOfSample([1, 12, '4', 7.5, 0], 100)).toEqual([1, 4, 0]);
    });
});

describe('digit gap', () => {
    it('counts the ticks since the digit last appeared', () => {
        expect(digitGap([1, 2, 3, 2, 5], 2)).toBe(1);
        expect(digitGap([1, 2, 3, 2, 5], 1)).toBe(4);
        expect(digitGap([1, 2, 3, 2, 5], 5)).toBe(0);
    });

    it('reports -1 for a digit that never appeared instead of 0', () => {
        expect(digitGap([1, 2, 3], 9)).toBe(-1);
        expect(digitGap([], 9)).toBe(-1);
    });
});

describe('longest digit run', () => {
    it('finds the longest consecutive run inside the window', () => {
        expect(longestDigitRun([1, 3, 3, 3, 1, 3], 3)).toBe(3);
        expect(longestDigitRun([4, 4, 1, 4], 4)).toBe(2);
    });

    it('reports 0 when the digit never appeared', () => {
        expect(longestDigitRun([1, 2, 3], 9)).toBe(0);
        expect(longestDigitRun([], 9)).toBe(0);
    });
});

describe('parity share', () => {
    it('measures even and odd share as complementary percentages', () => {
        expect(parityShare([0, 2, 4, 1], 'even')).toBe(75);
        expect(parityShare([0, 2, 4, 1], 'odd')).toBe(25);
        expect(parityShare([1, 3, 5, 7, 9], 'odd')).toBe(100);
    });

    it('reports 0 for an empty window rather than an invented share', () => {
        expect(parityShare([], 'even')).toBe(0);
        expect(parityShare(null, 'odd')).toBe(0);
    });
});

describe('digit transition count', () => {
    it('counts only adjacent from → to pairs', () => {
        expect(transitionCount([1, 2, 1, 2, 2], 1, 2)).toBe(2);
        expect(transitionCount([1, 2, 1, 2, 2], 2, 2)).toBe(1);
    });

    it('does not count a pair that is not adjacent', () => {
        expect(transitionCount([1, 5, 2], 1, 2)).toBe(0);
        expect(transitionCount([1], 1, 1)).toBe(0);
    });
});

describe('repeat share', () => {
    it('measures how often a tick repeated the previous digit', () => {
        expect(repeatShare([1, 1, 2, 2], 100)).toBeCloseTo((2 / 3) * 100, 5);
        expect(repeatShare([1, 2, 3, 4], 100)).toBe(0);
    });

    it('has nothing to measure below two ticks', () => {
        expect(repeatShare([7], 100)).toBe(0);
        expect(repeatShare([], 100)).toBe(0);
    });

    it('honours the sample window', () => {
        // The newest two ticks repeat; the older pair must not be counted.
        expect(repeatShare([5, 5, 1, 2], 2)).toBe(0);
        expect(repeatShare([1, 2, 5, 5], 2)).toBe(100);
    });
});
