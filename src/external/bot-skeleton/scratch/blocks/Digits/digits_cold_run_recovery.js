import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * The two legs the block can trade first, with the losing pair each one waits for and the digits
 * only one of which may carry the red bar.
 */
const PRIMARY_LEGS = {
    over_1: { contract: 'DIGITOVER', barrier: 1, set: '0_1', digits: [0, 1] },
    under_8: { contract: 'DIGITUNDER', barrier: 8, set: '8_9', digits: [8, 9] },
};

const MIN_RUN = 2;
const MAX_RUN = 100;
const MIN_PERCENT = 0.1;
const MAX_PERCENT = 100;

/**
 * "Pair entry: Over 1 / Under 8 first, Even/Odd after a loss" — the whole observed setup in one
 * block.
 *
 * The first leg buys the bot's own Over/Under contract only while BOTH losing digits sit under the
 * share ceiling (10.2% by default, the fair share being 10%) AND at least ONE of them carries the
 * red (coldest) bar, AND the last two digits were a pair from that losing pair — 0,0 · 0,1 · 1,1 ·
 * 1,0 for Over 1, 8,8 · 8,9 · 9,9 · 9,8 for Under 8 — AND a later tick confirmed it by ending in
 * the pair. Other digits may pass between the pair and its confirmation.
 *
 * The ceiling is not a fixed number at run time: `Bot.adaptiveColdShare` re-reads the live window on
 * every trade loop and tightens the configured ceiling whenever the ten digit shares spread wider
 * than chance alone would produce, so the bot's own parameter follows the market instead of sitting
 * at whatever was typed into the block.
 *
 * Only after a settled loss does the second leg run: it reads the newest REVERSAL digits of the
 * market the bot is already trading (`Bot.eoParityReversal`) and buys the parity those digits
 * predict to break — the last digits all even → ODD, all odd → EVEN, a mixed run → no entry.
 *
 * Both buys go through the engine's own purchase path (`Bot.purchase`), which carries the contract
 * type — and the barrier only for the family that reads one — so the martingale, the risk limits and
 * the take-profit / stop-loss keep working across the switch. A contract that is already open is
 * never doubled.
 */
window.Blockly.Blocks.digits_cold_run_recovery = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Trade {{ primary }} when the last 2 digits pair, then a confirmation digit', {
                primary: '%1',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PRIMARY',
                    options: [
                        [localize('Over 1'), 'over_1'],
                        [localize('Under 8'), 'under_8'],
                    ],
                },
            ],
            message1: localize(
                'while both stay under {{ percent }} % (auto-tightened) of the last {{ sample }} ticks, red bar on either',
                {
                    percent: '%1',
                    sample: '%2',
                }
            ),
            args1: [
                {
                    // Blockly's `precision` is the rounding STEP, not a decimal count: 0.1 keeps
                    // one decimal (a step of 1 rounds 10.2 down to 10 and the share silently moves).
                    type: 'field_number',
                    name: 'PERCENT',
                    value: 10.2,
                    min: MIN_PERCENT,
                    max: MAX_PERCENT,
                    precision: 0.1,
                },
                {
                    type: 'field_number',
                    name: 'SAMPLE',
                    value: 100,
                    min: 1,
                    max: 1000,
                    precision: 0,
                },
            ],
            message2: localize('then after a loss buy the {{ parity }} reversal of the last {{ reversal }} digits', {
                parity: '%1',
                reversal: '%2',
            }),
            args2: [
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('both'), 'both'],
                        [localize('EVEN'), 'even'],
                        [localize('ODD'), 'odd'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'REVERSAL',
                    value: 2,
                    min: MIN_RUN,
                    max: MAX_RUN,
                    precision: 0,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Buys Over 1 (or Under 8) only while both losing digits are under the share ceiling — tightened automatically from the live window, never loosened above the percentage you set — and at least one of them carries the red (coldest) bar, and the last two digits were a pair from that losing pair — 0/1 for Over 1, 8/9 for Under 8 — with a later tick confirming it. Other digits may pass between the pair and its confirmation. After a settled loss it buys the parity the newest digits predict to break, on the market it is already trading: all even → ODD, all odd → EVEN. A mixed run is no entry, so the block waits for one instead of trading blind.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Pair entry: Over 1 / Under 8, Even/Odd recovery'),
            description: localize(
                'One two-leg entry: Over 1 (or Under 8) while the losing pair stays cold with the red bar on one of the two and its pair is confirmed on a later tick (other digits may pass in between), then — after a loss — the even/odd reversal of the newest digits on the same market. The cold-share ceiling adapts to the live window on every trade loop.'
            ),
            key_words: localize(
                'over 1 under 8 cold pair confirmation even odd recovery loss reversal red bar adaptive frequency digit'
            ),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_cold_run_recovery = block => {
    const primary = PRIMARY_LEGS[block.getFieldValue('PRIMARY')] ?? PRIMARY_LEGS.over_1;
    const parity = block.getFieldValue('PARITY');
    const reversal = Number(block.getFieldValue('REVERSAL'));
    const percent = Number(block.getFieldValue('PERCENT'));
    const sample = Number(block.getFieldValue('SAMPLE'));

    const wholeNumber = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

    if (!wholeNumber(reversal, MIN_RUN, MAX_RUN)) {
        throw new Error(
            localize('Digits to reverse must be a whole number between {{ min }} and {{ max }}', {
                min: MIN_RUN,
                max: MAX_RUN,
            })
        );
    }
    if (!Number.isFinite(percent) || percent < MIN_PERCENT || percent > MAX_PERCENT) {
        throw new Error(
            localize('The cold share must be a number between {{ min }} and {{ max }} %', {
                min: MIN_PERCENT,
                max: MAX_PERCENT,
            })
        );
    }
    if (!wholeNumber(sample, 1, 1000)) {
        throw new Error(localize('The frequency window must be a whole number between 1 and 1000 ticks'));
    }

    const [first, second] = primary.digits;

    // The engine reports a settled contract as `win` or `loss`, so the recovery branch has to read
    // `loss` — the reversal never runs while this compares against anything else.
    return `
        if (!Bot.sessionHasOpenContract()) {
            if (Bot.sessionLastResult() === 'loss') {
                if (Bot.eoParityReversal(${reversal}, '${parity}') === 'ODD') {
                    Bot.purchase('DIGITODD');
                } else if (Bot.eoParityReversal(${reversal}, '${parity}') === 'EVEN') {
                    Bot.purchase('DIGITEVEN');
                } else {
                    Bot.sessionJournal('Recovery waiting · the last digits are mixed', 'info');
                }
            } else if (Bot.isPairConfirmed('${primary.set}') && Bot.areDigitSharesBelow([${first}, ${second}], Bot.adaptiveColdShare(${percent}, ${sample}), ${sample}) && (Bot.isDigitCold(${first}, ${sample}) || Bot.isDigitCold(${second}, ${sample})) && Bot.riskCanTrade()) {
                Bot.purchase('${primary.contract}', { barrier: ${primary.barrier} });
            } else {
                Bot.sessionJournal('Pair gate waiting · last digit ' + Bot.getLastDigit(), 'info');
            }
        }
    `;
};
