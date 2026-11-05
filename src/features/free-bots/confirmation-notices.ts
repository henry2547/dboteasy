/**
 * "Confirmation needed" notices for the Free Bots library.
 *
 * While the library is open it reads the selected market's live digits and, the moment a bot's own
 * entry conditions are met, writes one line into the run panel's Journal — in its own colour — saying
 * the bot is ready and that starting it is the user's confirmation.
 *
 * Each rule mirrors the template's entry gate in `templates.ts`:
 * - bots 8 and 9 are announced when their losing pair (0/1 or 8/9) is at or below 10.2% — the red
 *   (coldest) bar is never required;
 * - every other bot is announced when its share gate (where it has one) and its entry digits/run are
 *   both true.
 *
 * This only reports readings of ticks already seen: nothing is loaded, bought or started here.
 */

import { areDigitsAtOrBelowShare } from '@/external/bot-skeleton/services/tradeEngine/utils/digit-analysis';
import { FREE_BOT_TEMPLATES, freeBotById, type FreeBotId } from './templates';

/** The bots read the last 1000 ticks; the library watches the same window. */
export const CONFIRMATION_SAMPLE = 1000;
/** The bots' share ceiling, in percent — the ceiling their XML gates carry. */
export const CONFIRMATION_SHARE_CEILING = 10.2;
/** Below this many ticks a reading is not a setup yet. */
export const CONFIRMATION_MIN_TICKS = 30;

export interface ConfirmationNotice {
    templateId: FreeBotId;
    botNumber: number;
    name: string;
    message: string;
}

interface NoticeRule {
    templateId: FreeBotId;
    /** Digits the contract loses to; `null` for a bot with no share gate. */
    pair: [number, number] | null;
    /** The rest of the entry gate, on top of the share gate. */
    entry: (digits: number[]) => boolean;
    /** What the library read on this tick, for the journal line. */
    reading: (digits: number[]) => string;
}

const lastDigit = (digits: number[]): number => digits[digits.length - 1];

const lastTwoDigits = (digits: number[]): [number, number] => [digits[digits.length - 2], digits[digits.length - 1]];

const newestIs = (digits: number[]): string => `the newest digit is ${lastDigit(digits)}`;

const RULES: NoticeRule[] = [
    {
        templateId: 'under8_entry_every_time',
        pair: [8, 9],
        entry: digits => [4, 7, 9].includes(lastDigit(digits)),
        reading: newestIs,
    },
    {
        templateId: 'over1_entry_every_time',
        pair: [0, 1],
        entry: digits => [2, 5, 6].includes(lastDigit(digits)),
        reading: newestIs,
    },
    {
        templateId: 'over1_two_low_digits',
        pair: [0, 1],
        entry: digits => lastTwoDigits(digits).every(digit => digit <= 1),
        reading: () => 'the last two digits are both 0 or 1',
    },
    {
        templateId: 'under8_two_high_digits',
        pair: [8, 9],
        entry: digits => lastTwoDigits(digits).every(digit => digit >= 8),
        reading: () => 'the last two digits are both 8 or 9',
    },
    {
        templateId: 'even_odd_window',
        pair: null,
        entry: digits => {
            const [previous, newest] = lastTwoDigits(digits);
            return previous % 2 === newest % 2;
        },
        reading: digits => `the last two digits are both ${lastDigit(digits) % 2 === 0 ? 'even' : 'odd'}`,
    },
    {
        templateId: 'over1_under6_recovery',
        pair: [0, 1],
        entry: digits => [5, 6].includes(lastDigit(digits)),
        reading: newestIs,
    },
    {
        // Primary leg: the newest digit is above the Over 1 barrier.
        templateId: 'over1_parity_recovery',
        pair: null,
        entry: digits => lastDigit(digits) > 1,
        reading: digits => `${newestIs(digits)} — above 1`,
    },
    {
        // Bots 8 and 9 are announced on the pair itself; the confirmed-pair pattern is their
        // own entry trigger, and the red bar is never part of the rule.
        templateId: 'over1_cold_run_recovery',
        pair: [0, 1],
        entry: () => true,
        reading: () => 'the 0/1 pair is hit',
    },
    {
        templateId: 'under8_cold_run_recovery',
        pair: [8, 9],
        entry: () => true,
        reading: () => 'the 8/9 pair is hit',
    },
];

const shareReading = (pair: [number, number] | null): string =>
    pair ? ` — digits ${pair[0]} and ${pair[1]} at or below ${CONFIRMATION_SHARE_CEILING}%` : '';

/**
 * One notice per bot whose entry conditions the newest ticks satisfy, in library order.
 *
 * Returns an empty list below `CONFIRMATION_MIN_TICKS` — like the scanner, the library does not
 * call a setup from a sample it cannot measure.
 */
export function collectConfirmationNotices(digits: number[], marketName: string): ConfirmationNotice[] {
    if (digits.length < CONFIRMATION_MIN_TICKS) return [];

    return RULES.filter(rule => {
        const sharePassed =
            rule.pair === null ||
            areDigitsAtOrBelowShare(digits, rule.pair, CONFIRMATION_SHARE_CEILING, CONFIRMATION_SAMPLE);
        return sharePassed && rule.entry(digits);
    }).map(rule => {
        const name = freeBotById(rule.templateId)?.name ?? rule.templateId;
        const botNumber = FREE_BOT_TEMPLATES.findIndex(template => template.id === rule.templateId) + 1;
        const reading = `${rule.reading(digits)}${shareReading(rule.pair)}`;

        return {
            templateId: rule.templateId,
            botNumber,
            name,
            message: `Confirmation needed — Bot ${botNumber} (${name}) on ${marketName}: ${reading}. Load the bot and press Run to confirm.`,
        };
    });
}
