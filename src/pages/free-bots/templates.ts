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
 *
 * `over1_under6_recovery` is the only two-leg template: its trade definition
 * carries the `both` contract type, so its purchase conditions buy Over 1 in the
 * primary branch and Under 6 in the recovery branch, with the shared prediction
 * variable set per branch. Its extra gates come from the Digits analysis blocks
 * (`Digits above in a row`, `Two digits below a share`, `Digit bar is neutral`)
 * rather than the observer blocks.
 */

import { multiMarketById } from './multi-market';
import evenEntryEveryTimeXml from '@/xml/even_entry_every_time.xml';
import oddEntryEveryTimeXml from '@/xml/odd_entry_every_time.xml';
import over1EntryEveryTimeXml from '@/xml/over1_entry_every_time.xml';
import over1TwoLowDigitsXml from '@/xml/over1_two_low_digits.xml';
import over2EntryEveryTimeXml from '@/xml/over2_entry_every_time.xml';
import over2ThreeLowDigitsXml from '@/xml/over2_three_low_digits.xml';
import over3EntryEveryTimeXml from '@/xml/over3_entry_every_time.xml';
import under6EntryEveryTimeXml from '@/xml/under6_entry_every_time.xml';
import under7EntryEveryTimeXml from '@/xml/under7_entry_every_time.xml';
import under7RareNineXml from '@/xml/under7_rare_nine.xml';
import under5NineRareXml from '@/xml/under5_nine_rare.xml';
import over4FiveHotXml from '@/xml/over4_five_hot.xml';
import under8EntryEveryTimeXml from '@/xml/under8_entry_every_time.xml';
import under8TwoHighDigitsXml from '@/xml/under8_two_high_digits.xml';
import over1Under6RecoveryXml from '@/xml/over1_under6_recovery.xml';

/** Generated multi-market templates carry a configuration-derived id. */
export type MultiMarketBotId = `multi_market_${string}`;

export type FreeBotId =
    | MultiMarketBotId
    | 'over1_entry_every_time'
    | 'under8_entry_every_time'
    | 'over2_entry_every_time'
    | 'over3_entry_every_time'
    | 'under7_entry_every_time'
    | 'under6_entry_every_time'
    | 'over1_two_low_digits'
    | 'under8_two_high_digits'
    | 'over2_three_low_digits'
    | 'under7_rare_nine'
    | 'under5_nine_rare'
    | 'over4_five_hot'
    | 'even_entry_every_time'
    | 'odd_entry_every_time'
    | 'over1_under6_recovery';

export type FreeBotStrategy =
    | 'over1'
    | 'under8'
    | 'over2'
    | 'under7'
    | 'over3'
    | 'under6'
    | 'under5'
    | 'over4'
    | 'even'
    | 'odd'
    | 'matches'
    | 'differs';

export type FreeBotContractType =
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'DIGITEVEN'
    | 'DIGITODD'
    | 'DIGITMATCH'
    | 'DIGITDIFF';

/**
 * Contract type written into the trade definition: the single contract a plain
 * template trades, or `both` for a template whose purchase conditions choose
 * between two legs (Over/Under) and set the barrier for each one.
 */
export type FreeBotTradeContractType = FreeBotContractType | 'both';

/** The second leg of a two-contract template: what it buys, on which barrier and when. */
export interface FreeBotRecoveryLeg {
    contractType: FreeBotContractType;
    /** Barrier the recovery leg trades on, set into the shared prediction variable. */
    prediction: number;
    /** Plain-language trigger, shown on the card as the recovery's "Buys when". */
    trigger: string;
}

/**
 * Digit trade type in the Bot Builder: Over/Under carries a prediction, Even/Odd a
 * parity, Matches/Differs a target digit.
 */
export type FreeBotTradeType = 'overunder' | 'evenodd' | 'matchesdiffers';

export type FreeBotParity = 'even' | 'odd';

export interface FreeBotTemplate {
    id: FreeBotId;
    name: string;
    /** Uploaded XML the template was taken from (or the template it was derived from). */
    sourceFile: string;
    /** Asset under `src/xml/` that is loaded into the Bot Builder. */
    asset: string;
    /**
     * XML built in code instead of read from `src/xml/` — the Multi-Market Digit
     * Entry Hunter templates generate their workspace from a validated config.
     */
    xml?: string;
    /** True when the template scans and switches markets itself. */
    marketScan?: boolean;
    strategy: FreeBotStrategy;
    /** Scanner/strategy label, e.g. "Digit Over". */
    strategyLabel: string;
    /** Contract type in the trade definition — `both` when the template trades two legs. */
    contractType: FreeBotTradeContractType;
    /** Contract the entry condition buys; only needed when `contractType` is `both`. */
    primaryContractType?: FreeBotContractType;
    /** Second leg traded when the primary setup fails (see `FreeBotRecoveryLeg`). */
    recoveryLeg?: FreeBotRecoveryLeg;
    /** Defaults to `overunder` when the template does not say. */
    tradeType?: FreeBotTradeType;
    /**
     * Barrier digit for the primary Over/Under entry; `null` for an Even/Odd
     * template. A template with a recovery leg keeps this barrier in a variable,
     * so the workspace reads it back as a block rather than a fixed number.
     */
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
        id: 'over2_entry_every_time',
        name: 'Over 2 — Entry Every Time',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'over2_entry_every_time.xml',
        strategy: 'over2',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 2,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'LTE',
        triggerDigit: 2,
        entryRule: 'Last digit is less than or equal to 2 (0, 1 or 2)',
        buyCondition:
            'Every tick whose last digit is 0, 1 or 2 — no extra filter, so it buys on roughly three of every ten ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again immediately until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
    {
        id: 'over3_entry_every_time',
        name: 'Over 3 — Entry Every Time',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'over3_entry_every_time.xml',
        strategy: 'over3',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 3,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'LTE',
        triggerDigit: 3,
        entryRule: 'Last digit is less than or equal to 3 (0, 1, 2 or 3)',
        buyCondition:
            'Every tick whose last digit is 0, 1, 2 or 3 — no extra filter, so it buys on roughly four of every ten ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again immediately until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
    {
        id: 'under7_entry_every_time',
        name: 'Under 7 — Entry Every Time',
        sourceFile: 'Derived from Under 8 with Entry every time.xml',
        asset: 'under7_entry_every_time.xml',
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
        entryRule: 'Last digit is greater than or equal to 7 (7, 8 or 9)',
        buyCondition:
            'Every tick whose last digit is 7, 8 or 9 — no extra filter, so it buys on roughly three of every ten ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, and it trades again immediately until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Standard digit blocks only',
    },
    {
        id: 'under6_entry_every_time',
        name: 'Under 6 — Entry Every Time',
        sourceFile: 'Derived from Under 8 with Entry every time.xml',
        asset: 'under6_entry_every_time.xml',
        strategy: 'under6',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        prediction: 6,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 6,
        entryRule: 'Last digit is greater than or equal to 6 (6, 7, 8 or 9)',
        buyCondition:
            'Every tick whose last digit is 6, 7, 8 or 9 — no extra filter, so it buys on roughly four of every ten ticks.',
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
        id: 'under5_nine_rare',
        name: 'Under 5 — Only When 9 Is Rare',
        sourceFile: 'Derived from Under 8 with Entry every time.xml',
        asset: 'under5_nine_rare.xml',
        strategy: 'under5',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        prediction: 5,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'LTE',
        triggerDigit: 4,
        entryRule: 'Last digit ≤ 4 · at least 100 ticks observed · digit 9 under 10% of the window',
        buyCondition:
            'The last digit is 0–4, this run has already seen 100 genuine ticks, and digit 9 took less than 10% of the analysis window — Check Minimum Sample Size and Digit Frequency Below filter the entry. Under 5 wins on 0–4, so the 9 filter only skips entries taken while 9 is unusually common.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, and it trades again on the next tick that still passes all three gates, until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Check Minimum Sample Size · Digit Frequency Below · AND',
    },
    {
        id: 'over4_five_hot',
        name: 'Over 4 — Only When 5 Is Hot',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'over4_five_hot.xml',
        strategy: 'over4',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 4,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'GTE',
        triggerDigit: 5,
        entryRule: 'Last digit ≥ 5 · at least 100 ticks observed · digit 5 above 12% of the window',
        buyCondition:
            'The last digit is 5–9, this run has already seen 100 genuine ticks, and digit 5 took more than 12% of the analysis window — Check Minimum Sample Size and Digit Frequency Above. Over 4 wins on 5–9, and 5 is one of those winning digits.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again on the next tick that still passes all three gates, until ' +
            MARTINGALE_STOP +
            '.',
        blocksUsed: 'Check Minimum Sample Size · Digit Frequency Above · AND',
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
    {
        id: 'over1_under6_recovery',
        name: 'Over 1 — Under 6 Recovery',
        sourceFile: 'Derived from Over 1 with Entry every time.xml',
        asset: 'over1_under6_recovery.xml',
        strategy: 'over1',
        strategyLabel: 'Digit Over / Under',
        contractType: 'both',
        primaryContractType: 'DIGITOVER',
        recoveryLeg: {
            contractType: 'DIGITUNDER',
            prediction: 6,
            trigger: 'three ticks in a row ended in 6, 7, 8 or 9 and the newest one is not 9',
        },
        prediction: 1,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 5,
        entryRule:
            'Last digit is 5 or 6 · digit 0 and digit 1 both under 10.5% of the last 1000 ticks · neither digit 5 nor digit 6 carries a green or red bar',
        buyCondition:
            'Over 1 needs the newest digit to be 5 or 6, both digit 0 and digit 1 under 10.5% of the last 1000 ticks, and neither digit 5 nor digit 6 carrying a green (hottest) or red (coldest) bar. After a loss it switches to the Under 6 recovery and buys as soon as the last three ticks in a row each ended 6, 7, 8 or 9 (6, 8, 7 counts, 6, 5, 9 does not) with the same neutral-bar gate — digit 9 itself never gets bought. While it waits for that run it buys nothing and notifies the journal with the last digit. Every gate fails until real ticks are loaded.',
        afterPurchase:
            'Win → stake back to 10 and back to Over 1 · Loss → stake × 2 · stops for good at +10, −20, after the third Over 1 run, or on a digit 9 once a contract has been taken',
        restartCondition:
            'Straight after each contract settles it trades again while none of the stops is set: a win resets the stake to 10, clears the recovery and returns the bot to Over 1; a loss lifts the stake ×2 and arms the Under 6 recovery. The three-run limit stops the bot once three Over 1 runs have settled — the recovery trade does not count as a run — and a digit 9 seen after the first contract settles stops the run for good: press Run again to start a fresh one.',
        blocksUsed:
            'Digits above in a row · Two digits below a share · Digit bar is neutral · Notify · Create text with · Stop the bot · AND',
    },
];

const FREE_BOT_XML: Record<string, string> = {
    over1_entry_every_time: over1EntryEveryTimeXml,
    under8_entry_every_time: under8EntryEveryTimeXml,
    over2_entry_every_time: over2EntryEveryTimeXml,
    over3_entry_every_time: over3EntryEveryTimeXml,
    under7_entry_every_time: under7EntryEveryTimeXml,
    under6_entry_every_time: under6EntryEveryTimeXml,
    over1_two_low_digits: over1TwoLowDigitsXml,
    under8_two_high_digits: under8TwoHighDigitsXml,
    over2_three_low_digits: over2ThreeLowDigitsXml,
    under7_rare_nine: under7RareNineXml,
    under5_nine_rare: under5NineRareXml,
    over4_five_hot: over4FiveHotXml,
    even_entry_every_time: evenEntryEveryTimeXml,
    odd_entry_every_time: oddEntryEveryTimeXml,
    over1_under6_recovery: over1Under6RecoveryXml,
};

export function freeBotById(id: string | null | undefined): FreeBotTemplate | null {
    const generated = multiMarketById(id);
    if (generated) return generated;
    return FREE_BOT_TEMPLATES.find(template => template.id === id) ?? null;
}

export function freeBotForStrategy(strategy: FreeBotStrategy | null | undefined): FreeBotTemplate | null {
    return FREE_BOT_TEMPLATES.find(template => template.strategy === strategy) ?? null;
}

/**
 * The untouched template XML — the Free Bots asset is never edited in place. A
 * generated template carries its own XML and never reads an asset.
 */
export function freeBotXml(template: FreeBotTemplate): string {
    return template.xml ?? FREE_BOT_XML[template.id] ?? '';
}
