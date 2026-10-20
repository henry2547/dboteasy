/**
 * Free Bots library — the digit-contract templates that ship with the app.
 *
 * The Botly XML assets in `src/xml/` are the source of truth for each bot's
 * logic; this module only *describes* them so the library UI can show the
 * settings, and `bot-xml.ts` re-reads the asset before anything is loaded into
 * the Bot Builder — a card never shows a value the XML does not carry.
 *
 * The first two assets were built from the two uploaded strategy files
 * ("Over 1 with Entry every time.xml" / "Under 8 with Entry every time.xml");
 * `sourceFile` records that origin. The later four are derived from those two
 * and add an extra confirmation gate built from the Bot Builder's observer
 * blocks (`Read Digit N Ticks Ago`, `Check Minimum Sample Size`,
 * `Digit Frequency Below`), which is why each card lists the blocks it uses.
 */

import evenEntryEveryTimeXml from '@/xml/even_entry_every_time.xml';
import oddEntryEveryTimeXml from '@/xml/odd_entry_every_time.xml';
import over1EntryEveryTimeXml from '@/xml/over1_entry_every_time.xml';
import over1TwoLowDigitsXml from '@/xml/over1_two_low_digits.xml';
import over2ThreeLowDigitsXml from '@/xml/over2_three_low_digits.xml';
import under7RareNineXml from '@/xml/under7_rare_nine.xml';
import under8EntryEveryTimeXml from '@/xml/under8_entry_every_time.xml';
import under8TwoHighDigitsXml from '@/xml/under8_two_high_digits.xml';

export type FreeBotId =
    | 'over1_entry_every_time'
    | 'under8_entry_every_time'
    | 'over1_two_low_digits'
    | 'under8_two_high_digits'
    | 'over2_three_low_digits'
    | 'under7_rare_nine'
    | 'even_entry_every_time'
    | 'odd_entry_every_time';

export type FreeBotStrategy = 'over1' | 'under8' | 'over2' | 'under7' | 'even' | 'odd';

export type FreeBotContractType = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';

/** Digit trade type in the Bot Builder: Over/Under carries a prediction, Even/Odd a parity. */
export type FreeBotTradeType = 'overunder' | 'evenodd';

export type FreeBotParity = 'even' | 'odd';

export interface FreeBotTemplate {
    id: FreeBotId;
    name: string;
    /** Uploaded XML the template was taken from (or the template it was derived from). */
    sourceFile: string;
    /** Asset under `src/xml/` that is loaded into the Bot Builder. */
    asset: string;
    strategy: FreeBotStrategy;
    /** Scanner/strategy label, e.g. "Digit Over". */
    strategyLabel: string;
    contractType: FreeBotContractType;
    /** Defaults to `overunder` when the template does not say. */
    tradeType?: FreeBotTradeType;
    /** Barrier digit for Over/Under; `null` for an Even/Odd template. */
    prediction: number | null;
    /** Parity for an Even/Odd template; absent for Over/Under. */
    entryParity?: FreeBotParity;
    durationTicks: number;
    /** Symbol baked into the XML — replaced by the chosen market when loading. */
    defaultMarket: string;
    stake: number;
    takeProfit: number;
    stopLoss: number;
    multiplier: number;
    /** Comparison operator of the digit entry gate; `null` for an Even/Odd template. */
    entryOperator: 'LTE' | 'GTE' | null;
    triggerDigit: number | null;
    entryRule: string;
    /** Plain-language purchase condition, shown on the card as "Buys when". */
    buyCondition: string;
    afterPurchase: string;
    /** Plain-language restart rule, shown on the card as "Trades again when". */
    restartCondition: string;
    /** Observer blocks the template leans on, or "Standard digit blocks only". */
    blocksUsed: string;
}

const MARTINGALE_STOP = 'the bot stops for good at +10 profit or −20 loss';

export const FREE_BOT_TEMPLATES: FreeBotTemplate[] = [
    {
        id: 'over1_entry_every_time',
        name: 'Over 1 — Entry Every Time',
        sourceFile: 'Over 1 with Entry every time.xml',
        asset: 'over1_entry_every_time.xml',
        strategy: 'over1',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 1,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'LTE',
        triggerDigit: 1,
        entryRule: 'Last digit is less than or equal to 1 (0 or 1)',
        buyCondition: 'Every tick whose last digit is 0 or 1 — no extra filter, so it buys often.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again immediately until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
    {
        id: 'under8_entry_every_time',
        name: 'Under 8 — Entry Every Time',
        sourceFile: 'Under 8 with Entry every time.xml',
        asset: 'under8_entry_every_time.xml',
        strategy: 'under8',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        prediction: 8,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 8,
        entryRule: 'Last digit is greater than or equal to 8 (8 or 9)',
        buyCondition: 'Every tick whose last digit is 8 or 9 — no extra filter, so it buys often.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, and it trades again immediately until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
    {
        id: 'over1_two_low_digits',
        name: 'Over 1 — Two Low Digits in a Row',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'over1_two_low_digits.xml',
        strategy: 'over1',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 1,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'LTE',
        triggerDigit: 1,
        entryRule: 'Last digit ≤ 1 AND the digit one tick earlier was also ≤ 1',
        buyCondition:
            'The last digit is 0 or 1 and the digit one tick before it was also 0 or 1 — a double low run, checked with Read Digit N Ticks Ago.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again on the next tick that shows another double low run, until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Read Digit N Ticks Ago · Less Than Or Equal To · Number',
    },
    {
        id: 'under8_two_high_digits',
        name: 'Under 8 — Two High Digits in a Row',
        sourceFile: 'Derived from Under 8 with Entry every time.xml',
        asset: 'under8_two_high_digits.xml',
        strategy: 'under8',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        prediction: 8,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 8,
        entryRule: 'Last digit ≥ 8 AND the digit one tick earlier was also ≥ 8',
        buyCondition:
            'The last digit is 8 or 9 and the digit one tick before it was also 8 or 9 — a double high run, checked with Read Digit N Ticks Ago.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, and it trades again on the next tick that shows another double high run, until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Read Digit N Ticks Ago · Greater Than Or Equal To · Number',
    },
    {
        id: 'over2_three_low_digits',
        name: 'Over 2 — Three Low Digits in a Row',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'over2_three_low_digits.xml',
        strategy: 'over2',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 2,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 5,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'LTE',
        triggerDigit: 2,
        entryRule: 'Last digit ≤ 2 AND the two digits before it were also ≤ 2',
        buyCondition:
            'The last three digits in a row are all 0, 1 or 2 — one tick ago and two ticks ago are both checked with Read Digit N Ticks Ago, then combined with AND.',
        afterPurchase: 'Win → stake back to 5 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 5 after a win, ×1.5 after a loss, and it trades again on the next tick that completes another three-in-a-row run, until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Read Digit N Ticks Ago · Less Than Or Equal To · Number · AND',
    },
    {
        id: 'under7_rare_nine',
        name: 'Under 7 — Only When 9 Is Rare',
        sourceFile: 'Derived from Under 8 with Entry every time.xml',
        asset: 'under7_rare_nine.xml',
        strategy: 'under7',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        prediction: 7,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 7,
        entryRule: 'Last digit ≥ 7 · at least 100 ticks observed · digit 9 under 10% of the window',
        buyCondition:
            'The last digit is 7, 8 or 9, this run has already seen 100 genuine ticks, and digit 9 took less than 10% of the analysis window — checked with Check Minimum Sample Size and Digit Frequency Below.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, and it trades again on the next tick that still passes all three gates, until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Check Minimum Sample Size · Digit Frequency Below · AND',
    },
    {
        id: 'even_entry_every_time',
        name: 'Even — Entry Every Time',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'even_entry_every_time.xml',
        strategy: 'even',
        strategyLabel: 'Digit Even',
        contractType: 'DIGITEVEN',
        tradeType: 'evenodd',
        prediction: null,
        entryParity: 'even',
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: null,
        triggerDigit: null,
        entryRule: 'Last digit is even (0, 2, 4, 6 or 8)',
        buyCondition:
            'Every tick whose last digit is even — the Even/Odd digit block reads the parity straight from the ticker, so roughly half of all ticks qualify.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again on the next even tick until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
    {
        id: 'odd_entry_every_time',
        name: 'Odd — Entry Every Time',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'odd_entry_every_time.xml',
        strategy: 'odd',
        strategyLabel: 'Digit Odd',
        contractType: 'DIGITODD',
        tradeType: 'evenodd',
        prediction: null,
        entryParity: 'odd',
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: null,
        triggerDigit: null,
        entryRule: 'Last digit is odd (1, 3, 5, 7 or 9)',
        buyCondition:
            'Every tick whose last digit is odd — the Even/Odd digit block reads the parity straight from the ticker, so roughly half of all ticks qualify.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again on the next odd tick until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
];

const FREE_BOT_XML: Record<FreeBotId, string> = {
    over1_entry_every_time: over1EntryEveryTimeXml,
    under8_entry_every_time: under8EntryEveryTimeXml,
    over1_two_low_digits: over1TwoLowDigitsXml,
    under8_two_high_digits: under8TwoHighDigitsXml,
    over2_three_low_digits: over2ThreeLowDigitsXml,
    under7_rare_nine: under7RareNineXml,
    even_entry_every_time: evenEntryEveryTimeXml,
    odd_entry_every_time: oddEntryEveryTimeXml,
};

export function freeBotById(id: string | null | undefined): FreeBotTemplate | null {
    return FREE_BOT_TEMPLATES.find(template => template.id === id) ?? null;
}

export function freeBotForStrategy(strategy: FreeBotStrategy | null | undefined): FreeBotTemplate | null {
    return FREE_BOT_TEMPLATES.find(template => template.strategy === strategy) ?? null;
}

/** The untouched template XML — the Free Bots asset is never edited in place. */
export function freeBotXml(template: FreeBotTemplate): string {
    return FREE_BOT_XML[template.id] ?? '';
}
