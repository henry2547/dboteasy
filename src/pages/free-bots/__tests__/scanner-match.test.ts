/**
 * The scanner decides which Free Bots a result may load. These tests pin the contract the "Load Bot"
 * buttons rely on: a row offers bot 8 when the scanned digits keep 0 and 1 under 10%, bot 9 when they
 * keep 8 and 9 under, both when both rules hold, and the closest partial setup when neither does —
 * never a silent match.
 */

jest.mock('@/xml/over1_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_two_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_two_high_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/even_odd_window.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_under6_recovery.xml', () => '', { virtual: true });
jest.mock('@/xml/parity_recovery_bot.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_cold_run_recovery.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_cold_run_recovery.xml', () => '', { virtual: true });

import { MIN_SETUP_SAMPLE, matchFreeBotSetup, matchFreeBotSetups } from '../scanner-match';

/** `counts[digit]` copies of each digit, so a sample can be built exactly. */
function sample(counts: number[]): number[] {
    const digits: number[] = [];
    counts.forEach((count, digit) => {
        for (let i = 0; i < count; i += 1) digits.push(digit);
    });
    return digits;
}

describe('matchFreeBotSetups', () => {
    it('returns nothing below the minimum sample', () => {
        const digits = sample([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
        expect(digits.length).toBeLessThan(MIN_SETUP_SAMPLE);
        expect(matchFreeBotSetups(digits)).toEqual([]);
        expect(matchFreeBotSetup(digits)).toBeNull();
    });

    it('offers bot 8 when digits 0 and 1 are both below 10%', () => {
        // 100 ticks: 0 and 1 at two ticks each (2%), the rest spread over 2–9.
        const digits = sample([2, 2, 12, 12, 12, 12, 12, 12, 12, 12]);
        const setups = matchFreeBotSetups(digits);

        expect(setups).toHaveLength(1);
        const [setup] = setups;
        expect(setup.templateId).toBe('over1_cold_run_recovery');
        expect(setup.botNumber).toBe(8);
        expect(setup.strategy).toBe('over1');
        expect(setup.contractType).toBe('DIGITOVER');
        expect(setup.prediction).toBe(1);
        expect(setup.ready).toBe(true);
        expect(setup.conditions.filter(condition => condition.passed)).toHaveLength(2);
        expect(setup.evidence.map(item => item.digit)).toEqual([0, 1]);
    });

    it('offers bot 9 when digits 8 and 9 are both below 10%', () => {
        // 8 and 9 suppressed, 0–7 carry the rest; 0 and 1 are far above 10% so Over 1 does not hold.
        const digits = sample([13, 13, 12, 12, 13, 13, 12, 12, 0, 0]);
        const setups = matchFreeBotSetups(digits);

        expect(setups).toHaveLength(1);
        const [setup] = setups;
        expect(setup.templateId).toBe('under8_cold_run_recovery');
        expect(setup.botNumber).toBe(9);
        expect(setup.strategy).toBe('under8');
        expect(setup.contractType).toBe('DIGITUNDER');
        expect(setup.prediction).toBe(8);
        expect(setup.ready).toBe(true);
        expect(setup.evidence.map(item => item.digit)).toEqual([8, 9]);
    });

    it('offers both bots when both losing pairs are cold', () => {
        // Digits 0, 1, 8 and 9 at one tick each; 2–7 carry the rest.
        const digits = sample([1, 1, 16, 16, 16, 16, 16, 16, 1, 1]);
        const setups = matchFreeBotSetups(digits);

        expect(setups.map(setup => setup.botNumber).sort()).toEqual([8, 9]);
        expect(setups.every(setup => setup.ready)).toBe(true);
    });

    it('reports a partial setup instead of a match when neither rule holds', () => {
        // Flat distribution: every digit at 10%, so nothing is below the ceiling.
        const digits = sample([6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
        const setups = matchFreeBotSetups(digits);

        expect(setups).toHaveLength(1);
        expect(setups[0].ready).toBe(false);
        expect(setups[0].conditions.every(condition => typeof condition.passed === 'boolean')).toBe(true);
        expect(setups[0].reason).toMatch(/conditions passed/);
    });

    it('arms a bot only when the red bar and a confirmed pair are both on the sample', () => {
        // The last 100 ticks keep digit 0 the coldest (2%), 0 and 1 under 10%, and end 0, 1, 0 —
        // a confirmed 0/1 pair with the red bar on one of its digits.
        const digits = [
            ...Array(3).fill(0),
            ...Array(3).fill(1),
            ...Array(11).fill(2),
            ...Array(11).fill(3),
            ...Array(12).fill(4),
            ...Array(12).fill(5),
            ...Array(12).fill(6),
            ...Array(12).fill(7),
            ...Array(12).fill(8),
            ...Array(12).fill(9),
            0,
            1,
            0,
        ];

        const [setup] = matchFreeBotSetups(digits);
        expect(setup.strategy).toBe('over1');
        expect(setup.armed).toBe(true);
        expect(setup.redBarDigit).toBe(0);
        expect(setup.adaptiveCeiling).not.toBeNull();
    });

    it('reports no red bar when neither losing digit is the coldest', () => {
        // 0 and 1 cold and a 0/1 pair at the end, but digit 9 (5%) is colder than both.
        const digits = [
            ...Array(8).fill(0),
            ...Array(8).fill(1),
            ...Array(12).fill(2),
            ...Array(12).fill(3),
            ...Array(11).fill(4),
            ...Array(11).fill(5),
            ...Array(11).fill(6),
            ...Array(11).fill(7),
            ...Array(11).fill(8),
            ...Array(5).fill(9),
            0,
            1,
            0,
        ];

        const [setup] = matchFreeBotSetups(digits);
        expect(setup.strategy).toBe('over1');
        expect(setup.ready).toBe(true);
        expect(setup.redBarDigit).toBeNull();
        expect(setup.armed).toBe(false);
    });
});
