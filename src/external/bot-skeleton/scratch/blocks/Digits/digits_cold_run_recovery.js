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
 * "Cold-run entry: Over 1 / Under 8 first, Even/Odd after a loss" — the whole observed setup in one
 * block.
 *
 * The first leg buys the bot's own Over/Under contract only while BOTH losing digits sit under the
 * percentage you set (10.2% by default, the fair share being 10%) AND neither of them carries the
 * red (coldest) bar, AND the newest RUN digits all ended in that losing pair — 0,0 · 0,1 · 1,1 · 1,0
 * for Over 1, 8,8 · 8,9 · 9,9 · 9,8 for Under 8. With RUN 3 the last two digits are the pair and the
 * newest tick is the confirmation digit.
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
            message0: localize('Trade {{ primary }} when the last {{ run }} digits stay cold', {
                primary: '%1',
                run: '%2',
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
                {
                    type: 'field_number',
                    name: 'RUN',
                    value: 3,
                    min: MIN_RUN,
                    max: MAX_RUN,
                    precision: 0,
                },
            ],
            message1: localize('under {{ percent }} % of the last {{ sample }} ticks, no red bar', {
                percent: '%1',
                sample: '%2',
            }),
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
                'Buys Over 1 (or Under 8) only while both losing digits are under the percentage you set and neither carries the red bar, and the newest digits all ended in that losing pair — 0/1 for Over 1, 8/9 for Under 8. After a settled loss it buys the parity the newest digits predict to break, on the market it is already trading: all even → ODD, all odd → EVEN. A mixed run is no entry, so the block waits for one instead of trading blind.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Cold-run entry: Over 1 / Under 8, Even/Odd recovery'),
            description: localize(
                'One two-leg entry: Over 1 (or Under 8) while the losing pair stays cold and the newest digits all sit in it, then — after a loss — the even/odd reversal of the newest digits on the same market.'
            ),
            key_words: localize(
                'over 1 under 8 cold run pair even odd recovery loss reversal no red bar frequency digit'
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
    const run = Number(block.getFieldValue('RUN'));
    const reversal = Number(block.getFieldValue('REVERSAL'));
    const percent = Number(block.getFieldValue('PERCENT'));
    const sample = Number(block.getFieldValue('SAMPLE'));

    const wholeNumber = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

    if (!wholeNumber(run, MIN_RUN, MAX_RUN)) {
        throw new Error(
            localize('Digits in the cold run must be a whole number between {{ min }} and {{ max }}', {
                min: MIN_RUN,
                max: MAX_RUN,
            })
        );
    }
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
            } else if (Bot.areLastDigitsInSet(${run}, '${primary.set}') && Bot.areDigitSharesBelow([${first}, ${second}], ${percent}, ${sample}) && Bot.isDigitNotCold(${first}, ${sample}) && Bot.isDigitNotCold(${second}, ${sample}) && Bot.riskCanTrade()) {
                Bot.purchase('${primary.contract}', { barrier: ${primary.barrier} });
            } else {
                Bot.sessionJournal('Cold-run gate waiting · last digit ' + Bot.getLastDigit(), 'info');
            }
        }
    `;
};
