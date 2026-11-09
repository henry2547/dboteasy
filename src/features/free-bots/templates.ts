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
 * `sourceFile` records that origin. Their entry gates follow the setups the
 * uploads were named after: Under 8 enters on 4, 7 or 9 while digits 8 and 9 stay
 * at or below 10.2%, Over 1 enters on 2, 5 or 6 while digits 0 and 1 stay at or
 * below 10.2%. The red (coldest) bar plays no part in either gate — a losing digit
 * may carry it or not. The two `*_two_*_digits` variants add a confirmation gate built from the
 * Bot Builder's observer blocks, which is why each card lists the blocks it uses.
 * Those gates draw on all four Blocks-menu groups: the digit/frequency condition
 * (`Read Digit N Ticks Ago`, `Digit Frequency Below`, …) is ANDed with a
 * pattern/parity read (`Parity Switched`), a data-quality guard (`Check Market
 * Data Freshness`) and an entry monitor (`Require Minimum Sample Size`).
 *
 * `over1_under6_recovery` is the only two-leg template: its trade definition
 * carries the `both` contract type, so its purchase conditions buy Over 1 in the
 * primary branch and Under 6 in the recovery branch, with the shared prediction
 * variable set per branch. Run on Start seeds every number those blocks call —
 * OVER 1, UNDER PREDICTION 6, LOSS COUNT 0, TAKE PROFIT 10, STOP LOSS −20 and the
 * three-tick run — and the purchase conditions branch on the loss count itself
 * rather than on a recovery flag. Its extra gate comes from the Digits analysis
 * blocks (`Digits above in a row`, `Two digits at or below a share`) rather than
 * the observer blocks.
 *
 * Every card's entry rule follows the published Deriv digit setups, not just the
 * contract's own digit: the two `*_entry_every_time` assets AND the tick pattern
 * with a frequency guard on the digits the contract loses to ("Over 1: digit 0 and
 * 1 at or below 10.2%"), which the asset builds from `digits_frequency` compares
 * against 10.2% of the last 1000 ticks. The red (coldest) bar is never a condition.
 */

import evenOddWindowXml from '@/xml/even_odd_window.xml';
import over1EntryEveryTimeXml from '@/xml/over1_entry_every_time.xml';
import over1TwoLowDigitsXml from '@/xml/over1_two_low_digits.xml';
import under8EntryEveryTimeXml from '@/xml/under8_entry_every_time.xml';
import under8TwoHighDigitsXml from '@/xml/under8_two_high_digits.xml';
import over1Under6RecoveryXml from '@/xml/over1_under6_recovery.xml';
import parityRecoveryXml from '@/xml/parity_recovery_bot.xml';
import over1ColdRunRecoveryXml from '@/xml/over1_cold_run_recovery.xml';
import under8ColdRunRecoveryXml from '@/xml/under8_cold_run_recovery.xml';

export type FreeBotId =
    | 'under8_entry_every_time'
    | 'over1_entry_every_time'
    | 'over1_two_low_digits'
    | 'under8_two_high_digits'
    | 'even_odd_window'
    | 'over1_under6_recovery'
    | 'over1_parity_recovery'
    | 'over1_cold_run_recovery'
    | 'under8_cold_run_recovery';

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
 * The two-leg entry the `digits_parity_recovery` Digits block builds: it trades one
 * digit Over/Under leg first and, only after a settled loss, the Even/Odd reversal of
 * the newest digits on the market it is already trading. Both legs live inside that
 * one block, so the barrier travels with the block instead of a prediction input.
 */
export interface FreeBotParityRecovery {
    /** Primary leg the block trades first. */
    primary: 'over_1' | 'under_8';
    /** Barrier the primary leg trades (Over 1 → 1, Under 8 → 8). */
    barrier: number;
    /** Parity the recovery buys — `both` when the strongest even/odd side wins. */
    parity: FreeBotParity;
}

/**
 * Digit trade type in the Bot Builder: Over/Under carries a prediction, Even/Odd a
 * parity, Matches/Differs a target digit.
 */
export type FreeBotTradeType = 'overunder' | 'evenodd' | 'matchesdiffers';

export type FreeBotParity = 'even' | 'odd' | 'both';

/**
 * How many trades one confirmed entry may take — the trade definition's `MODE_LIST` field.
 *
 * - `continuous`: the entry stays live after a settled contract, so the bot keeps trading until the
 *   take profit, the stop loss or a stop rule ends the run. One entry carries several trades.
 * - `single`: one contract per entry; once it settles the bot waits for the next entry.
 */
export type FreeBotTradeMode = 'continuous' | 'single';

export interface FreeBotTemplate {
    id: FreeBotId;
    name: string;
    /**
     * Observation-only template: the workspace journals its signal every tick and holds no
     * `purchase` and no `trade_again`, so it can never buy a contract. Such a canvas runs
     * because Observation mode satisfies the Builder's mandatory-Purchase gate.
     */
    observationOnly?: boolean;
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
    /**
     * Trading mode written into the trade definition: `continuous` keeps trading inside a confirmed
     * entry, `single` takes one contract per entry and then waits for the next one.
     */
    mode: FreeBotTradeMode;
    /** Contract type in the trade definition — `both` when the template trades two legs. */
    contractType: FreeBotTradeContractType;
    /** Contract the entry condition buys; only needed when `contractType` is `both`. */
    primaryContractType?: FreeBotContractType;
    /** Second leg traded when the primary setup fails (see `FreeBotRecoveryLeg`). */
    recoveryLeg?: FreeBotRecoveryLeg;
    /** Two-leg entry held in one `digits_parity_recovery` Digits block instead of purchase blocks. */
    parityRecovery?: FreeBotParityRecovery;
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
    /**
     * Comparison operator of the digit entry gate; `null` for an Even/Odd template.
     * `EQ` when the gate is a list of entry digits (see `entryDigits`).
     */
    entryOperator: 'LTE' | 'GTE' | 'EQ' | null;
    triggerDigit: number | null;
    /**
     * Digits the entry accepts on their own ("entry is 5 or 6"), built as an OR of
     * `last digit = d` compares instead of the barrier comparison.
     */
    entryDigits?: number[];
    /** Newest digits in a row the entry needs ("any 2 digits above or equal 7"). */
    entryRun?: { digits: number; count: number; mode: 'at_or_above' | 'at_or_below' };
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
    'the bot stops for good at +10 profit or −20 loss, and a sweet alert announces which of the two limits stopped it — every tick it skips is journalled with the last digit';

export const FREE_BOT_TEMPLATES: FreeBotTemplate[] = [
    {
        id: 'under8_entry_every_time',
        mode: 'continuous',
        name: 'Under 8 — Entries 4, 7, 9',
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
        entryOperator: 'EQ',
        triggerDigit: 4,
        entryDigits: [4, 7, 9],
        entryRule:
            'Last digit is 4, 7 or 9 · digits 8 and 9 at or below 10.2% of the last 1000 ticks · risk guard, no open contract, trade cap',
        buyCondition:
            'Under 8 is bought when the newest digit is 4, 7 or 9 — any other digit skips the tick — while the losing digits 8 and 9 both hold 10.2% or less of the last 1000 ticks. The red (coldest) bar plays no part: either losing digit may carry it or not. The risk guard must allow a trade, no contract may still be open and fewer than 250 trades may have been taken.',
        afterPurchase:
            'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20 · stops the run with a reason as soon as digit 8 or 9 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next tick that ends 4, 7 or 9 while digits 8 and 9 are still at or below 10.2%, until the bot stops for good at +10 profit or −20 loss — a sweet alert then announces whether the take profit or the stop loss ended the run. It also stops, with the reason in the run log, the moment digit 8 or 9 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits: Last Digit · Compare · Digit frequency · AND / OR · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · Create text with',
    },
    {
        id: 'over1_entry_every_time',
        mode: 'continuous',
        name: 'Over 1 — Entries 2, 5, 6',
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
        entryOperator: 'EQ',
        triggerDigit: 2,
        entryDigits: [2, 5, 6],
        entryRule:
            'Last digit is 2, 5 or 6 · digits 0 and 1 at or below 10.2% of the last 1000 ticks · risk guard, no open contract, trade cap',
        buyCondition:
            'Over 1 is bought when the newest digit is 2, 5 or 6 — any other digit skips the tick — while the losing digits 0 and 1 both hold 10.2% or less of the last 1000 ticks. The red (coldest) bar plays no part: either losing digit may carry it or not. The risk guard must allow a trade, no contract may still be open and fewer than 250 trades may have been taken.',
        afterPurchase:
            'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20 · stops the run with a reason as soon as digit 0 or 1 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next tick that ends 2, 5 or 6 while digits 0 and 1 are still at or below 10.2%, until the bot stops for good at +10 profit or −20 loss — a sweet alert then announces whether the take profit or the stop loss ended the run. It also stops, with the reason in the run log, the moment digit 0 or 1 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits: Last Digit · Compare · Digit frequency · AND / OR · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · Create text with',
    },
    {
        id: 'over1_two_low_digits',
        mode: 'single',
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
            'Last digit ≤ 1 AND the digit one tick earlier was also ≤ 1 · digits 0 and 1 at or below 10.2% of the last 1000 ticks · risk guard, no open contract, trade cap · parity switched · fresh data · 1000-tick sample',
        buyCondition:
            'The last digit is 0 or 1 and the digit one tick before it was also 0 or 1 — a double low run, checked with Read Digit N Ticks Ago — the losing digits 0 and 1 both hold 10.2% or less of the last 1000 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken, while the newest tick switched parity on fresh data after 1000 genuine ticks. The red (coldest) bar plays no part.',
        afterPurchase:
            'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20 · stops the run with a reason as soon as digit 0 or 1 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, the result and the session report are journalled, and it trades again on the next tick that shows another double low run and still passes every gate, until the bot stops for good at +10 profit or −20 loss — a sweet alert then announces whether the take profit or the stop loss ended the run. It also stops, with the reason in the run log, the moment digit 0 or 1 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Less Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit frequency · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · Create text with',
    },
    {
        id: 'under8_two_high_digits',
        mode: 'single',
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
            'Last digit ≥ 8 AND the digit one tick earlier was also ≥ 8 · digits 8 and 9 at or below 10.2% of the last 1000 ticks · risk guard, no open contract, trade cap · parity switched · fresh data · 1000-tick sample',
        buyCondition:
            'The last digit is 8 or 9 and the digit one tick before it was also 8 or 9 — a double high run, checked with Read Digit N Ticks Ago — the losing digits 8 and 9 both hold 10.2% or less of the last 1000 ticks, the risk guard allows a trade, no contract is still open and fewer than 250 trades have been taken, while the newest tick switched parity on fresh data after 1000 genuine ticks. The red (coldest) bar plays no part.',
        afterPurchase:
            'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20 · stops the run with a reason as soon as digit 8 or 9 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×2 after a loss, the result and the session report are journalled, and it trades again on the next tick that shows another double high run and still passes every gate, until the bot stops for good at +10 profit or −20 loss — a sweet alert then announces whether the take profit or the stop loss ended the run. It also stops, with the reason in the run log, the moment digit 8 or 9 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digit & frequency: Read Digit N Ticks Ago · Greater Than Or Equal To · Number · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Digits: Digit frequency · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · Create text with',
    },
    {
        id: 'even_odd_window',
        mode: 'single',
        name: 'Even / Odd — Last 2 Digits Reversal',
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
            'Every volatility market is measured on the last 1000 ticks of its own history · the bot keeps the market whose even/odd split is the most lopsided · on that market the last 2 digits decide: both even → buy ODD, both odd → buy EVEN, a mixed pair is no entry',
        buyCondition:
            "Nothing is bought on the market the bot was loaded with. On the first trade loop of the run it scans every volatility market the app offers, reads the last 1000 ticks of each market with that market's own price precision, and moves to the one where a parity holds the largest share — the best market of the pool. Closed, suspended and cooldown markets are skipped with their reason, and the measurement behind every market it looked at is journalled. Then the configured rule is the reversal of the last 2 digits: when both of them are EVEN the bot buys ODD, when both are ODD it buys EVEN, and a mixed pair is no entry at all — it waits for the next pair instead of trading blind. Buy EVEN or Buy ODD sends that contract through the engine's own purchase path. One entry per signal, so the same tick can never enter twice; a window that is incomplete, stale or disconnected never signals. While it waits the journal shows the current signal. After a loss the whole pool is measured again, so the next entry is looked for on a freshly picked market.",
        afterPurchase:
            'Win → stake back to 10 · Loss → stake × 1.5 and every volatility market is scanned again · stops at +10 / −20',
        restartCondition:
            'Straight after each contract settles: stake resets to 10 after a win, ×1.5 after a loss, and it trades again on the next pair of same-parity digits — two even digits buy ODD, two odd digits buy EVEN — until ' +
            MARTINGALE_STOP +
            '. The market scan runs on the first trade loop of the run and again after every loss, so the bot re-picks the best market before it looks for the next entry; stopping and starting the bot scans from scratch.',
        blocksUsed:
            'Use the best even/odd market · Configure Even/Odd strategy · Monitor last N valid ticks · Selected signal direction · Buy EVEN · Buy ODD · Allow one entry per signal · Digit & frequency: Check Minimum Sample Size · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · Create text with',
    },
    {
        id: 'over1_under6_recovery',
        mode: 'continuous',
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
            'Last digit is 5 or 6 · digit 0 and digit 1 both at or below 10.2% of the last 1000 ticks',
        buyCondition:
            'Nothing is bought until an entry signal appears, and which signal it waits for comes from the loss count set in Run on Start. At 0 it waits for Over 1: the newest digit is 5 or 6 and digit 0 and digit 1 are both at or below 10.2% of the last 1000 ticks — the red (coldest) bar on any digit plays no part. At 1 or more it waits for the Under 6 recovery instead: the last three ticks in a row each ended 7, 8 or 9 — every one of them above 6, so a 6 breaks the wait (9, 9, 8 counts, 8, 6, 9 does not), and a 9 on the newest tick counts as a high digit like 7 and 8. While a leg waits it buys nothing and notifies the journal with the last digit. Every gate fails until real ticks are loaded.',
        afterPurchase:
            'Win → stake back to 10 and the loss count back to 0 (Over 1 again) · Loss → stake × 2 and the loss count + 1 (Under 6 recovery) · the session exits on the take-profit or stop-loss variable · stops the run with a reason as soon as digit 0 or 1 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles it trades again while the stop is not set, so it keeps running through losses until the take profit — or the stop loss — is hit, and a sweet alert then announces which of the two limits ended the run. The barrier comes from the prediction variable, which Run on Start recalculates from the loss count: 0 buys Over 1, 1 or more buys Under 6. While a leg waits for its setup the journal shows the last digit that failed the gate. It also stops, with the reason in the run log, the moment digit 0 or 1 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits above in a row · Two digits at or below a share · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · Create text with · AND',
    },
    {
        id: 'over1_parity_recovery',
        mode: 'continuous',
        name: 'Over 1 — Even/Odd Recovery',
        sourceFile: 'Built from the "Trade Over 1 / Under 8, recover on Even/Odd" Digits block',
        asset: 'parity_recovery_bot.xml',
        strategy: 'over1',
        strategyLabel: 'Digit Over → Even / Odd',
        contractType: 'both',
        primaryContractType: 'DIGITOVER',
        tradeType: 'evenodd',
        // One block holds both legs: Over 1 first, then the best even/odd market after a loss.
        parityRecovery: { primary: 'over_1', barrier: 1, parity: 'both' },
        prediction: null,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: null,
        triggerDigit: null,
        entryRule:
            'Newest digit above 1 · 20 genuine ticks observed · fresh market data · parity switched for the first leg · risk guard, no open contract, trade cap',
        buyCondition:
            'Nothing is bought until the observer gate passes. Then the first leg buys Over 1 as soon as the newest genuine digit is above 1 — 2 to 9 wins, 0 and 1 lose — while the risk guard allows a trade, no contract is still open and the trade cap is not reached. After a settled loss the second leg takes over on the same market: the last 2 genuine digits all even → buy ODD, both odd → buy EVEN, and a mixed pair is no entry, so the bot waits for the next pair instead of trading blind. Every refusal or wait is journalled with the digits it read, so a waiting bot always says why it did not trade.',
        afterPurchase:
            'Win → stake back to 10 and Over 1 again · Loss → stake × 1.5 and the next entry is the Even/Odd reversal of the newest digits · stops at +10 profit or −20 loss · stops the run with a reason as soon as digit 0 or 1 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles it trades again while the stop is not set: after a win it is back on Over 1, after a loss it waits for the next pair of same-parity digits and buys the opposite parity, until the take profit or the stop loss ends the run — a sweet alert announces which of the two limits it was. It also stops, with the reason in the run log, the moment digit 0 or 1 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits: Trade Over 1 / Under 8, recover on Even/Odd · Digit & frequency: Check Minimum Sample Size · Pattern & parity: Parity Switched · Observer control: Check Market Data Freshness · Entry & monitoring: Require Minimum Sample Size · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Result of last trade · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · OR · AND',
    },
    {
        id: 'over1_cold_run_recovery',
        mode: 'continuous',
        name: 'Over 1 — Confirmed 0/1 Pair',
        sourceFile: 'Built from the "Pair entry: Over 1 / Under 8, Even/Odd recovery" Digits block',
        asset: 'over1_cold_run_recovery.xml',
        strategy: 'over1',
        strategyLabel: 'Digit Over → Even / Odd',
        contractType: 'both',
        primaryContractType: 'DIGITOVER',
        tradeType: 'evenodd',
        // One block holds both legs: the confirmed-pair Over 1 entry, then the Even/Odd reversal after a loss.
        parityRecovery: { primary: 'over_1', barrier: 1, parity: 'both' },
        prediction: null,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: null,
        triggerDigit: null,
        entryRule:
            'A 0,0 · 0,1 · 1,1 · 1,0 pair, then a later tick ended in 0 or 1 — the confirmation may come next or with digits (0/1 included) in between, up to 3 ticks · digits 0 and 1 both at or below 10.2% of the last 1000 ticks, a ceiling that tightens itself from the live window · red bar on 0 or 1 optional · risk guard, no open contract, trade cap',
        buyCondition:
            'Over 1 is bought only when the whole observed setup holds: a pair from 0 and 1 — 0,0 · 0,1 · 1,1 · 1,0 — appeared, and a later tick confirmed it by ending in 0 or 1. The confirmation may come straight after the pair — 0,1,0 trades — or up to 3 digits later, and any digits may pass in between — including a 0 or 1 — so 0,1 then 3,5,7 then 1 is a confirmed pair. The check reads where the confirmation sits relative to the pair: a pair more than 3 ticks behind it is stale and the bot waits for a fresh one. Digits 0 and 1 both hold 10.2% or less of the last 1000 ticks, and either of them may carry the red (coldest) bar or not — it is not part of the rule. The share ceiling is not fixed: on every trade loop the bot re-reads the live window and tightens it whenever the ten digit shares spread wider than chance would, so a lopsided market has to show colder losing digits before it trades — the configured 10.2% is the loosest it ever gets. The risk guard must allow a trade, no contract may still be open and fewer than 250 trades may have been taken. After a settled loss the bot takes the Even/Odd reversal instead of another Over 1: the last 2 digits both even → buy ODD, both odd → buy EVEN, and a mixed pair buys nothing, so it waits for the next pair. Every wait is journalled with the newest digit.',
        afterPurchase:
            'Win → stake back to 10 and the confirmed-pair Over 1 entry again · Loss → stake × 1.5 and the next entry is the Even/Odd reversal of the last 2 digits · stops at +10 profit or −20 loss · stops the run with a reason as soon as digit 0 or 1 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles it trades again while the stop is not set: after a win it is back to waiting for digits 0 and 1 to stay at or below 10.2% in a confirmed pair, after a loss it buys the opposite parity of the last 2 digits — both even → ODD, both odd → EVEN — until the take profit or the stop loss ends the run, and a sweet alert announces which of the two limits it was. It also stops, with the reason in the run log, the moment digit 0 or 1 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits: Pair entry: Over 1 / Under 8, Even/Odd recovery · Pair, then a confirmation digit · Cold pair setup ready · Two digits below a share · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · AND',
    },
    {
        id: 'under8_cold_run_recovery',
        mode: 'continuous',
        name: 'Under 8 — Confirmed 8/9 Pair',
        sourceFile: 'Built from the "Pair entry: Over 1 / Under 8, Even/Odd recovery" Digits block',
        asset: 'under8_cold_run_recovery.xml',
        strategy: 'under8',
        strategyLabel: 'Digit Under → Even / Odd',
        contractType: 'both',
        primaryContractType: 'DIGITUNDER',
        tradeType: 'evenodd',
        // One block holds both legs: the confirmed-pair Under 8 entry, then the Even/Odd reversal after a loss.
        parityRecovery: { primary: 'under_8', barrier: 8, parity: 'both' },
        prediction: null,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: null,
        triggerDigit: null,
        entryRule:
            'An 8,8 · 8,9 · 9,9 · 9,8 pair, then a later tick ended in 8 or 9 — the confirmation may come next or with digits (8/9 included) in between, up to 3 ticks · digits 8 and 9 both at or below 10.2% of the last 1000 ticks, a ceiling that tightens itself from the live window · red bar on 8 or 9 optional · risk guard, no open contract, trade cap',
        buyCondition:
            'Under 8 is bought only when the whole observed setup holds: a pair from 8 and 9 — 8,8 · 8,9 · 9,9 · 9,8 — appeared, and a later tick confirmed it by ending in 8 or 9. The confirmation may come straight after the pair — 8,9,9 trades — or up to 3 digits later, and any digits may pass in between — including an 8 or 9 — so 9,8 then 6,7,5 then 8 is a confirmed pair. The check reads where the confirmation sits relative to the pair: a pair more than 3 ticks behind it is stale and the bot waits for a fresh one. Digits 8 and 9 both hold 10.2% or less of the last 1000 ticks, and either of them may carry the red (coldest) bar or not — it is not part of the rule. The share ceiling is not fixed: on every trade loop the bot re-reads the live window and tightens it whenever the ten digit shares spread wider than chance would, so a lopsided market has to show colder losing digits before it trades — the configured 10.2% is the loosest it ever gets. The risk guard must allow a trade, no contract may still be open and fewer than 250 trades may have been taken. After a settled loss the bot takes the Even/Odd reversal instead of another Under 8: the last 2 digits both even → buy ODD, both odd → buy EVEN, and a mixed pair buys nothing, so it waits for the next pair. Every wait is journalled with the newest digit.',
        afterPurchase:
            'Win → stake back to 10 and the confirmed-pair Under 8 entry again · Loss → stake × 1.5 and the next entry is the Even/Odd reversal of the last 2 digits · stops at +10 profit or −20 loss · stops the run with a reason as soon as digit 8 or 9 rises above 10.2%',
        restartCondition:
            'Straight after each contract settles it trades again while the stop is not set: after a win it is back to waiting for digits 8 and 9 to stay at or below 10.2% in a confirmed pair, after a loss it buys the opposite parity of the last 2 digits — both even → ODD, both odd → EVEN — until the take profit or the stop loss ends the run, and a sweet alert announces which of the two limits it was. It also stops, with the reason in the run log, the moment digit 8 or 9 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits: Pair entry: Over 1 / Under 8, Even/Odd recovery · Pair, then a confirmation digit · Cold pair setup ready · Two digits below a share · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · AND',
    },
];

const FREE_BOT_XML: Record<string, string> = {
    under8_entry_every_time: under8EntryEveryTimeXml,
    over1_entry_every_time: over1EntryEveryTimeXml,
    over1_two_low_digits: over1TwoLowDigitsXml,
    under8_two_high_digits: under8TwoHighDigitsXml,
    even_odd_window: evenOddWindowXml,
    over1_under6_recovery: over1Under6RecoveryXml,
    over1_parity_recovery: parityRecoveryXml,
    over1_cold_run_recovery: over1ColdRunRecoveryXml,
    under8_cold_run_recovery: under8ColdRunRecoveryXml,
};

export function freeBotById(id: string | null | undefined): FreeBotTemplate | null {
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
