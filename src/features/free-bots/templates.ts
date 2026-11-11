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
 * may carry it or not.
 *
 * The two `*_cold_run_recovery` bots add the confirmed losing pair: digits 0/1 (or
 * 8/9) both stay at or below the adaptive share ceiling and a pair from that set is
 * confirmed by a later tick ending in the same digits. `over1_parity_recovery` holds
 * both of its legs in one Digits block: Over 1 first, then the Even/Odd reversal of
 * the newest digits after a settled loss.
 *
 * Every card's entry rule follows the published Deriv digit setups, not just the
 * contract's own digit: the two `*_entry_every_time` assets AND the tick pattern
 * with a frequency guard on the digits the contract loses to ("Over 1: digit 0 and
 * 1 at or below 10.2%"), which the asset builds from `digits_frequency` compares
 * against 10.2% of the last 1000 ticks. The red (coldest) bar is never a condition.
 */

import over1EntryEveryTimeXml from '@/xml/over1_entry_every_time.xml';
import under8EntryEveryTimeXml from '@/xml/under8_entry_every_time.xml';
import parityRecoveryXml from '@/xml/parity_recovery_bot.xml';
import over1ColdRunRecoveryXml from '@/xml/over1_cold_run_recovery.xml';
import under8ColdRunRecoveryXml from '@/xml/under8_cold_run_recovery.xml';

export type FreeBotId =
    | 'under8_entry_every_time'
    | 'over1_entry_every_time'
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
            'Win → stake back to 10 and straight into the next Over 1 trade · Loss → stake × 1.5 and the next entry is the Even/Odd reversal of the last 2 digits · stops at +10 profit or −20 loss · stops the run with a reason as soon as digit 0 or 1 rises above 10.2%',
        restartCondition:
            'Continuous: the confirmed pair opens the entry once, then the bot keeps taking Over 1 trades back to back while digits 0 and 1 stay at or below 10.2% — no new pair needed. After a loss it buys the opposite parity of the last 2 digits — both even → ODD, both odd → EVEN — and keeps trading from that same live entry until the take profit or the stop loss ends the run, with a sweet alert announcing which of the two limits it was. It also stops, with the reason in the run log, the moment digit 0 or 1 rises above 10.2% of the last 1000 ticks.',
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
            'Win → stake back to 10 and straight into the next Under 8 trade · Loss → stake × 1.5 and the next entry is the Even/Odd reversal of the last 2 digits · stops at +10 profit or −20 loss · stops the run with a reason as soon as digit 8 or 9 rises above 10.2%',
        restartCondition:
            'Continuous: the confirmed pair opens the entry once, then the bot keeps taking Under 8 trades back to back while digits 8 and 9 stay at or below 10.2% — no new pair needed. After a loss it buys the opposite parity of the last 2 digits — both even → ODD, both odd → EVEN — and keeps trading from that same live entry until the take profit or the stop loss ends the run, with a sweet alert announcing which of the two limits it was. It also stops, with the reason in the run log, the moment digit 8 or 9 rises above 10.2% of the last 1000 ticks.',
        blocksUsed:
            'Digits: Pair entry: Over 1 / Under 8, Even/Odd recovery · Pair, then a confirmation digit · Cold pair setup ready · Two digits below a share · Market intelligence: Discover eligible markets · Risk management: Set risk limits · Reset risk session · Risk guard allows trade · Strategy learning: Learn following trades as strategy · Trading & execution: A contract is open · Bot control: Trade limit reached · Reporting: Session report · Report journal · Notify · Sweet alert · AND',
    },
];

const FREE_BOT_XML: Record<string, string> = {
    under8_entry_every_time: under8EntryEveryTimeXml,
    over1_entry_every_time: over1EntryEveryTimeXml,
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
