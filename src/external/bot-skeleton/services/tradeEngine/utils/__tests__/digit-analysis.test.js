/**
 * The digit-window rules behind the new Digits blocks, tested in isolation.
 *
 * Every number is measured from the digits the engine actually received: a digit that never
 * appeared reports -1 instead of pretending it just did, and a window with nothing to measure
 * reports 0 rather than an invented share.
 */
import {
    areDigitsBelowShare,
    digitBarState,
    digitGap,
    digitShare,
    highDigitRun,
    hotColdDigit,
    isDigitBarNeutral,
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

describe('high digit run', () => {
    it('counts the newest ticks in a row that qualify', () => {
        expect(highDigitRun([6, 8, 7], 6)).toBe(3);
        expect(highDigitRun([9, 6, 7], 6)).toBe(3);
        expect(highDigitRun([7, 9, 9], 6)).toBe(3);
    });

    it('stops at the first digit that does not qualify', () => {
        // 6, 5, 9 — the 5 breaks the run, so only the newest tick counts.
        expect(highDigitRun([6, 5, 9], 6)).toBe(1);
        expect(highDigitRun([8, 4, 7], 6)).toBe(1);
        expect(highDigitRun([6, 7, 2], 6)).toBe(0);
        expect(highDigitRun([5, 5, 5], 6)).toBe(0);
    });

    it('reads strictly above when the mode says so', () => {
        expect(highDigitRun([6, 7, 8], 6, 'above')).toBe(2);
        expect(highDigitRun([7, 8, 9], 6, 'above')).toBe(3);
    });

    it('reports 0 when there is nothing measurable', () => {
        expect(highDigitRun([], 6)).toBe(0);
        expect(highDigitRun([6, 7], 'nonsense')).toBe(0);
    });
});

describe('digit bar state', () => {
    // 5 appeared three times, 7 twice; 0, 2 and 9 once each, 1/3/4/6/8 not at all.
    const digits = [5, 7, 5, 0, 7, 5, 2, 9];

    it('reports the hottest and coldest digit with the same tie rule as the grid', () => {
        expect(hotColdDigit(digits, 100, 'hottest')).toBe(5);
        expect(hotColdDigit(digits, 100, 'coldest')).toBe(1);
        expect(digitBarState(digits, 5, 100)).toBe('hottest');
        expect(digitBarState(digits, 1, 100)).toBe('coldest');
    });

    it('reports a digit with neither bar as neutral', () => {
        expect(digitBarState(digits, 7, 100)).toBe('neutral');
        expect(isDigitBarNeutral(digits, 7, 100)).toBe(true);
        expect(isDigitBarNeutral(digits, 5, 100)).toBe(false);
    });

    it('reports unknown — never neutral — when there is no bar to read', () => {
        expect(digitBarState([], 5, 100)).toBe('unknown');
        expect(isDigitBarNeutral([], 5, 100)).toBe(false);
        expect(isDigitBarNeutral(digits, 'x', 100)).toBe(false);
    });

    it('honours the sample window', () => {
        // The newest two ticks are 2 and 9: both appeared once, so the lower digit is hot and cold.
        expect(isDigitBarNeutral(digits, 7, 2)).toBe(true);
        expect(isDigitBarNeutral(digits, 5, 2)).toBe(true);
        expect(isDigitBarNeutral([1, 1, 2, 2, 3, 3], 3, 2)).toBe(false);
    });
});

describe('digit share gate', () => {
    /**
     * A 1000-tick window built from exact occurrence counts, so a share can be set to the digit:
     * `{ 0: 103, 1: 103 }` makes both digits take exactly 10.3% of the window.
     */
    const windowOf = counts => {
        const list = [];
        const used = digits => digits.reduce((total, digit) => total + counts[digit], 0);

        Object.keys(counts).forEach(key => {
            for (let hit = 0; hit < counts[key]; hit += 1) list.push(Number(key));
        });

        // Pad with a digit that keeps the other shares where they were set.
        const pad_digit = Object.keys(counts).includes('9') ? 8 : 9;
        for (let pad = 1000 - used(Object.keys(counts).map(Number)); pad > 0; pad -= 1) list.push(pad_digit);

        return list;
    };

    it('measures each digit share over the requested window', () => {
        expect(digitShare([0, 0, 1, 2, 3], 0, 100)).toBeCloseTo(40, 5);
        expect(digitShare(windowOf({ 0: 104, 1: 104 }), 0, 1000)).toBeCloseTo(10.4, 5);
        expect(digitShare([], 0, 100)).toBe(0);
    });

    it('passes when both digits are strictly below the threshold', () => {
        // 10.4% for digit 0 and for digit 1 — both at or above 10.3%, so the gate blocks the entry.
        expect(areDigitsBelowShare(windowOf({ 0: 104, 1: 104 }), [0, 1], 10.3, 1000)).toBe(false);
        // 10.2% for each passes. (1000 × 10.2% = 102.)
        expect(areDigitsBelowShare(windowOf({ 0: 102, 1: 102 }), [0, 1], 10.3, 1000)).toBe(true);
    });

    it('fails when either digit sits exactly on the threshold', () => {
        expect(areDigitsBelowShare(windowOf({ 0: 103, 1: 103 }), [0, 1], 10.3, 1000)).toBe(false);
        expect(areDigitsBelowShare(windowOf({ 0: 103, 1: 102 }), [0, 1], 10.3, 1000)).toBe(false);
        expect(areDigitsBelowShare(windowOf({ 0: 103, 1: 102 }), [0], 10.3, 1000)).toBe(false);
        expect(areDigitsBelowShare(windowOf({ 0: 103, 1: 102 }), [1], 10.3, 1000)).toBe(true);
    });

    it('fails closed rather than measuring nothing', () => {
        expect(areDigitsBelowShare([], [0, 1], 10.3, 1000)).toBe(false);
        expect(areDigitsBelowShare([1, 2], [], 10.3, 1000)).toBe(false);
        expect(areDigitsBelowShare([1, 2], [0, 1], 'x', 1000)).toBe(false);
    });
});
