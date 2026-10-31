/**
 * The scanner decides which Free Bot a result may load. These tests pin the
 * contract the "Load Bot" button relies on: a row can only ever offer the
 * template its digits actually match, and a market that satisfies neither setup
 * still returns the closest one with `ready: false` — never a silent match.
 */

jest.mock('@/xml/over1_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_two_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_two_high_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/even_odd_window.xml', () => '', { virtual: true });

import { MIN_SETUP_SAMPLE, matchFreeBotSetup } from '../scanner-match';

/** `counts[digit]` copies of each digit, so a sample can be built exactly. */
function sample(counts: number[]): number[] {
    const digits: number[] = [];
    counts.forEach((count, digit) => {
        for (let i = 0; i < count; i += 1) digits.push(digit);
    });
    return digits;
}

describe('matchFreeBotSetup', () => {
    it('returns null below the minimum sample', () => {
        const digits = sample([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
        expect(digits.length).toBeLessThan(MIN_SETUP_SAMPLE);
        expect(matchFreeBotSetup(digits)).toBeNull();
    });

    it('matches the Over 1 template when 0 and 1 are suppressed and 5 peaks', () => {
        // 60 ticks: 0 and 1 at one tick each (1.7%), 5 dominant.
        const digits = sample([1, 1, 8, 8, 8, 22, 4, 4, 4, 0]);
        const setup = matchFreeBotSetup(digits);

        expect(setup).not.toBeNull();
        expect(setup?.templateId).toBe('over1_entry_every_time');
        expect(setup?.strategy).toBe('over1');
        expect(setup?.contractType).toBe('DIGITOVER');
        expect(setup?.prediction).toBe(1);
        expect(setup?.ready).toBe(true);
        expect(setup?.conditions.filter(condition => condition.passed)).toHaveLength(3);
        expect(setup?.evidence.map(item => item.digit)).toEqual([0, 1]);
    });

    it('matches the Under 8 template when 8 and 9 are suppressed and 2 peaks', () => {
        // 60 ticks: 8 and 9 at one tick each (1.7%), 2 dominant.
        const digits = sample([8, 8, 20, 4, 8, 4, 4, 3, 1, 0]);
        const setup = matchFreeBotSetup(digits);

        expect(setup).not.toBeNull();
        expect(setup?.templateId).toBe('under8_entry_every_time');
        expect(setup?.strategy).toBe('under8');
        expect(setup?.contractType).toBe('DIGITUNDER');
        expect(setup?.prediction).toBe(8);
        expect(setup?.ready).toBe(true);
        expect(setup?.evidence.map(item => item.digit)).toEqual([8, 9]);
    });

    it('prefers a ready setup over a partial one', () => {
        // 0/1 suppressed with 5 peaking, while 8/9 are not suppressed.
        const digits = sample([1, 1, 4, 4, 4, 30, 6, 5, 5, 0]);
        const setup = matchFreeBotSetup(digits);

        expect(setup?.ready).toBe(true);
        expect(setup?.strategy).toBe('over1');
    });

    it('reports a partial setup instead of a match when neither holds', () => {
        // Flat distribution: every digit at 10%, so nothing is suppressed.
        const digits = sample([6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
        const setup = matchFreeBotSetup(digits);

        expect(setup).not.toBeNull();
        expect(setup?.ready).toBe(false);
        expect(setup?.conditions.every(condition => typeof condition.passed === 'boolean')).toBe(true);
        expect(setup?.reason).toMatch(/conditions passed/);
    });

    it('arms the entry when the latest tick sits on an entry digit', () => {
        const digits = sample([1, 1, 8, 8, 8, 22, 4, 4, 4, 0]);
        digits.push(5); // Over 1 enters on 2, 5 or 6 — 5 arms it

        const setup = matchFreeBotSetup(digits);
        expect(setup?.strategy).toBe('over1');
        expect(setup?.armed).toBe(true);
        expect(setup?.triggerLabel).toBe('Last digit 2, 5, 6');
    });
});
