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
 * blocks, which is why each card lists the blocks it uses. That gate draws on
 * all four Blocks-menu groups: the digit/frequency condition (`Read Digit N
 * Ticks Ago`, `Digit Frequency Below`, …) is ANDed with a pattern/parity read
 * (`Parity Switched`), a data-quality guard (`Check Market Data Freshness`) and
 * an entry monitor (`Require Minimum Sample Size`).
 *
 * `over1_under6_recovery` is the only two-leg template: its trade definition
 * carries the `both` contract type, so its purchase conditions buy Over 1 in the
 * primary branch and Under 6 in the recovery branch, with the shared prediction
 * variable set per branch. Run on Start seeds every number those blocks call —
 * OVER 1, UNDER PREDICTION 6, LOSS COUNT 0, TAKE PROFIT 10, STOP LOSS −20 and the
 * three-tick run — and the purchase conditions branch on the loss count itself
 * rather than on a recovery flag. Its extra gates come from the Digits analysis
 * blocks (`Digits above in a row`, `Two digits below a share`, `Digit bar is
 * neutral`) rather than the observer blocks.
 */

import { multiMarketById } from './multi-market';
import evenOddWindowXml from '@/xml/even_odd_window.xml';
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
    | 'even_odd_window'
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

export type FreeBotContractType = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITMATCH' | 'DIGITDIFF';

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

export type FreeBotParity = 'even' | 'odd' | 'both';

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
    /**
     * Entry gate built from the Even/Odd strategy blocks (`eo_buy_even` / `eo_buy_odd`)
     * instead of a `purchase` block, so the loader expects both buys and the
     * "Selected signal direction" comparison around them.
     */
    entryBlocks?: 'even-odd-window';
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

const MARTINGALE_STOP =
    'the bot stops for good at +10 profit or −20 loss — every tick it skips is journalled with the last digit';

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
        entryRule:
            'Last digit ≤ 1 AND the tick before it was also ≤ 1 · no hot/cold bar on digit 1 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 0 or 1 and the tick before it was also 0 or 1, digit 1 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken — and the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next double low tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Less Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≥ 8 AND the tick before it was also ≥ 8 · no hot/cold bar on digit 8 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 8 or 9 and the tick before it was also 8 or 9, digit 8 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken — and the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next double high tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Greater Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≤ 2 AND the tick before it was also ≤ 2 · no hot/cold bar on digit 2 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 0, 1 or 2 and the tick before it was also 0, 1 or 2, digit 2 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken — and the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next double low tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Less Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≤ 3 AND the tick before it was also ≤ 3 · no hot/cold bar on digit 3 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 0–3 and the tick before it was also 0–3, digit 3 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken — and the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next double low tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Less Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≥ 7 AND the tick before it was also ≥ 7 · no hot/cold bar on digit 7 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 7, 8 or 9 and the tick before it was also 7, 8 or 9, digit 7 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken — and the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next double high tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Greater Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≥ 6 AND the tick before it was also ≥ 6 · no hot/cold bar on digit 6 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 6, 7, 8 or 9 and the tick before it was also 6, 7, 8 or 9, digit 6 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken — and the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next double high tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Greater Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≤ 1 AND the digit one tick earlier was also ≤ 1 · no hot/cold bar on digit 1 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 0 or 1 and the digit one tick before it was also 0 or 1 — a double low run, checked with Read Digit N Ticks Ago — digit 1 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken, while the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next tick that shows another double low run and still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Less Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≥ 8 AND the digit one tick earlier was also ≥ 8 · no hot/cold bar on digit 8 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last digit is 8 or 9 and the digit one tick before it was also 8 or 9 — a double high run, checked with Read Digit N Ticks Ago — digit 8 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken, while the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next tick that shows another double high run and still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Greater Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≤ 2 AND the two digits before it were also ≤ 2 · no hot/cold bar on digit 2 · risk guard, no open contract, trade cap · parity switched · fresh data · 100-tick sample',
        buyCondition:
            'The last three digits in a row are all 0, 1 or 2 — one tick ago and two ticks ago are both checked with Read Digit N Ticks Ago, then combined with AND — digit 2 carries neither the hottest nor the coldest bar of the last 100 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken, while the newest tick switched parity on fresh data after 100 genuine ticks.',
        afterPurchase: 'Win → stake back to 5 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 5 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next tick that completes another three-in-a-row run and still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Less Than Or Equal To · Number · AND · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≥ 7 · at least 100 ticks observed · digit 9 under 10% of the window · digit 9 carries no hot/cold bar · risk guard, no open contract, trade cap · parity switched · fresh data',
        buyCondition:
            'The last digit is 7, 8 or 9, this run has already seen 100 genuine ticks, digit 9 took less than 10% of the analysis window and carries neither the hottest nor the coldest bar of the last 100 ticks — and the risk guard allows a trade, no contract is still open, fewer than 250 trades have been taken, the newest tick switched parity and the market data is fresh.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Check Minimum Sample Size · Digit Frequency Below · AND · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral on digit 9 · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≤ 4 · at least 100 ticks observed · digit 9 under 10% of the window · digit 5 carries no hot/cold bar · risk guard, no open contract, trade cap · parity switched · fresh data',
        buyCondition:
            'The last digit is 0–4, this run has already seen 100 genuine ticks, digit 9 took less than 10% of the analysis window and digit 5 carries neither the hottest nor the coldest bar of the last 100 ticks — and the risk guard allows a trade, no contract is still open, fewer than 250 trades have been taken, the newest tick switched parity and the market data is fresh. Under 5 wins on 0–4, so the filters only skip entries taken while 9 is unusually common or 5 is an extreme of the grid.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Check Minimum Sample Size · Digit Frequency Below · AND · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral on digit 5 · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
        entryRule:
            'Last digit ≥ 5 · at least 100 ticks observed · digit 5 above 12% of the window · digit 5 carries no hot/cold bar · risk guard, no open contract, trade cap · parity switched · fresh data',
        buyCondition:
            'The last digit is 5–9, this run has already seen 100 genuine ticks, digit 5 took more than 12% of the analysis window and carries neither the hottest nor the coldest bar of the last 100 ticks — and the risk guard allows a trade, no contract is still open, fewer than 250 trades have been taken, the newest tick switched parity and the market data is fresh. Over 4 wins on 5–9, and 5 is one of those winning digits.',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next tick that still passes every gate, until the bot stops for good at +10 profit or −20 loss.',
        blocksUsed:
            'Digit & frequency: Check Minimum Sample Size · Digit Frequency Above · AND · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit bar is neutral on digit 5 · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
    },
    {
        id: 'even_odd_window',
        name: 'Even / Odd — Best Volatility Market',
        sourceFile: 'Built from the Even/Odd strategy blocks',
        asset: 'even_odd_window.xml',
        strategy: 'even',
        strategyLabel: 'Digit Even / Odd',
        contractType: 'both',
        primaryContractType: 'DIGITEVEN',
        tradeType: 'evenodd',
        prediction: null,
        entryParity: 'both',
        entryBlocks: 'even-odd-window',
        // The bot does not stay on the market it was loaded with: it measures every volatility
        // market itself on the first trade loop of the run and moves to the best one.
        marketScan: true,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: null,
        triggerDigit: null,
        entryRule:
            'Every volatility market is measured on the last 100 ticks of its own history · the bot keeps the market whose even/odd split is the most lopsided · on that market the last 20 valid ticks then need one parity at 65% or more',
        buyCondition:
            "Nothing is bought on the market the bot was loaded with. On the first trade loop of the run it scans every volatility market the app offers, reads the last 100 ticks of each market with that market's own price precision, and moves to the one where a parity holds the largest share — the best market of the pool. Closed, suspended and cooldown markets are skipped with their reason, and the measurement behind every market it looked at is journalled. Then nothing is bought until the rolling window of that market holds 20 genuine ticks and one parity reached 65% of them. With the direction set to BOTH the higher parity wins (an exact tie resolves to EVEN), and Buy EVEN or Buy ODD sends that contract through the engine's own purchase path. One entry per signal, so the same tick can never enter twice; a window that is incomplete, stale or disconnected never signals. While it waits the journal shows the current signal. After a loss the whole pool is measured again, so the next entry is looked for on a freshly picked market.",
        afterPurchase:
            'Win → stake back to 10 · Loss → stake × 1.5 and every volatility market is scanned again · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again on the next tick whose 20-tick window still reaches the threshold, until ' +
            MARTINGALE_STOP +
            '. The market scan runs on the first trade loop of the run and again after every loss, so the bot re-picks the best market before it looks for the next entry; stopping and starting the bot scans from scratch.',
        blocksUsed:
            'Use the best even/odd market · Configure Even/Odd strategy · Monitor last N valid ticks · Selected signal direction · Buy EVEN · Buy ODD · Allow one entry per signal · Digit & frequency: Check Minimum Sample Size · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with',
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
            trigger:
                'the loss count is 1 or more and the last three ticks each ended 7, 8 or 9 — digits above 6, with a 9 counting like 7 and 8',
        },
        prediction: 1,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 20,
        takeProfit: 20,
        stopLoss: 50,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 5,
        entryRule:
            'Last digit is 5 or 6 · digit 0 and digit 1 both under 10.3% of the last 1000 ticks · neither digit 5 nor digit 6 carries a green or red bar',
        buyCondition:
            'Nothing is bought until an entry signal appears, and which signal it waits for comes from the loss count set in Run on Start. At 0 it waits for Over 1: the newest digit is 5 or 6, digit 0 and digit 1 are both under 10.3% of the last 1000 ticks, and neither digit 5 nor digit 6 carries a green (hottest) or red (coldest) bar. At 1 or more it waits for the Under 6 recovery instead: the last three ticks in a row each ended 7, 8 or 9 — every one of them above 6, so a 6 breaks the wait (9, 9, 8 counts, 8, 6, 9 does not), and a 9 on the newest tick counts as a high digit like 7 and 8. While a leg waits it buys nothing and notifies the journal with the last digit. Every gate fails until real ticks are loaded.',
        afterPurchase:
            'Win → stake back to 10 and the loss count back to 0 (Over 1 again) · Loss → stake × 2 and the loss count + 1 (Under 6 recovery) · the session exits on the take-profit or stop-loss variable',
        restartCondition:
            'Straight after each contract settles it trades again while the stop is not set, so it keeps running through losses until the take profit — or the stop loss — is hit. The barrier comes from the prediction variable, which Run on Start recalculates from the loss count: 0 buys Over 1, 1 or more buys Under 6. While a leg waits for its setup the journal shows the last digit that failed the gate.',
        blocksUsed:
            'Digits above in a row · Two digits below a share · Digit bar is neutral · Digit & frequency: Digit Frequency Below · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Create text with · AND',
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
    even_odd_window: evenOddWindowXml,
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
