/**
 * The Free Bots library announces every bot whose entry conditions the live digits meet, so the
 * journal can ask the user for the confirmation that starts it. These tests pin the readings the
 * notices are built from: bots 8 and 9 on their cold losing pair (0/1, 8/9 — red bar irrelevant),
 * the other bots only when their entry digits/run join the share gate.
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

import { CONFIRMATION_MIN_TICKS, collectConfirmationNotices } from '../confirmation-notices';

/** `counts[digit]` copies of each digit, then `newest` appended in order. */
function sample(counts: number[], newest: number[] = []): number[] {
    const digits: number[] = [];
    counts.forEach((count, digit) => {
        for (let i = 0; i < count; i += 1) digits.push(digit);
    });
    return [...digits, ...newest];
}

/** 100 ticks with digits 8 and 9 reduced to `share` ticks, so the 8/9 pair is cold. */
const coldHighPair = [10, 10, 10, 10, 10, 10, 10, 10, 2, 2];

/** 100 ticks with digits 0 and 1 reduced to `share` ticks, so the 0/1 pair is cold. */
const coldLowPair = [2, 2, 12, 12, 12, 12, 12, 12, 12, 12];

const ids = (digits: number[]): string[] =>
    collectConfirmationNotices(digits, 'Volatility 100 Index').map(notice => notice.templateId);

describe('collectConfirmationNotices', () => {
    it('stays silent below the minimum sample', () => {
        expect(collectConfirmationNotices(new Array(CONFIRMATION_MIN_TICKS - 1).fill(0), 'R_100')).toEqual([]);
    });

    it('announces bot 8 when digits 0 and 1 are at or below 10.2%', () => {
        const notices = collectConfirmationNotices(sample(coldLowPair), 'Volatility 100 Index');
        const bot8 = notices.find(notice => notice.templateId === 'over1_cold_run_recovery');

        expect(bot8).toBeDefined();
        expect(bot8?.botNumber).toBe(8);
        expect(bot8?.message).toContain('Confirmation needed');
        expect(bot8?.message).toContain('digits 0 and 1 at or below 10.2%');
    });

    it('announces bot 9 when digits 8 and 9 are at or below 10.2%', () => {
        const notices = collectConfirmationNotices(sample(coldHighPair), 'Volatility 100 Index');
        const bot9 = notices.find(notice => notice.templateId === 'under8_cold_run_recovery');

        expect(bot9?.botNumber).toBe(9);
        expect(bot9?.message).toContain('the 8/9 pair is hit');
    });

    it('announces the confirmed-pair bots even when a losing digit carries the red bar', () => {
        // 0 and 1 are the coldest digits (2% each), so both carry the red bar — still a notice.
        expect(ids(sample(coldLowPair))).toContain('over1_cold_run_recovery');
        expect(ids(sample(coldHighPair))).toContain('under8_cold_run_recovery');
    });

    it('never announces bot 8 while digits 0 and 1 stay hot', () => {
        const hot = sample([20, 20, 10, 10, 10, 10, 10, 10, 10, 10]);
        expect(ids(hot)).not.toContain('over1_cold_run_recovery');
    });

    it('announces bot 1 only when the newest digit is 4, 7 or 9 and 8/9 are cold', () => {
        const hit = sample(coldHighPair, [4]);
        const missed = sample(coldHighPair, [5]);

        expect(ids(hit)).toContain('under8_entry_every_time');
        expect(ids(missed)).not.toContain('under8_entry_every_time');
    });

    it('announces bot 2 when the newest digit is 2, 5 or 6 and 0/1 are cold', () => {
        expect(ids(sample(coldLowPair, [6]))).toContain('over1_entry_every_time');
        expect(ids(sample(coldLowPair, [7]))).not.toContain('over1_entry_every_time');
    });

    it('announces the Even/Odd bot only on two same-parity digits', () => {
        expect(ids(sample(coldHighPair, [2, 4]))).toContain('even_odd_window');
        expect(ids(sample(coldHighPair, [2, 3]))).not.toContain('even_odd_window');
    });
});
