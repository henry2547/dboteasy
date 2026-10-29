import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** The two legs the block can trade first, and the barrier each one reads. */
const PRIMARY_LEGS = {
    over_1: { contract: 'DIGITOVER', barrier: 1, compare: '>' },
    under_8: { contract: 'DIGITUNDER', barrier: 8, compare: '<' },
};

const MIN_RUN = 2;
const MAX_RUN = 100;

/**
 * "Trade Over 1 / Under 8, recover on Even/Odd" — both legs of a digit strategy in one block.
 *
 * The first leg buys the bot's own Over/Under contract when the newest genuine digit passes the
 * barrier the block is configured with. Only after a settled loss does the second leg run: it reads
 * the newest RUN digits of the market the bot is already trading (`Bot.eoParityReversal`) and buys
 * the parity those digits predict to break — the last RUN digits all even → ODD, all odd → EVEN, a
 * mixed run → no entry. The read is synchronous and comes from the same genuine tick stream the
 * trade loop runs on, so the run always belongs to the market the contract is bought on.
 *
 * Both buys go through the engine's own purchase path (`Bot.purchase`), which carries the contract
 * type — and the barrier only for the family that reads one — and records the session entry, so the
 * martingale and the take-profit / stop-loss keep working across the switch. A contract that is
 * already open is never doubled.
 */
window.Blockly.Blocks.digits_parity_recovery = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize(
                'Trade {{ primary }}, then after a loss buy {{ parity }} when the last {{ run }} digits share a parity',
                {
                    primary: '%1',
                    parity: '%2',
                    run: '%3',
                }
            ),
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
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('both reversals'), 'both'],
                        [localize('EVEN only'), 'even'],
                        [localize('ODD only'), 'odd'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'RUN',
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
                'Buys Over 1 (or Under 8) when the newest digit passes that barrier. After a settled loss it buys the parity the newest digits predict to break, on the market it is already trading: the last N digits all even → ODD, all odd → EVEN. A mixed run is no entry, so the block waits for one instead of trading blind.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Trade Over 1 / Under 8, recover on Even/Odd'),
            description: localize(
                'One two-leg entry: the Over 1 or Under 8 digit trade first, then — after a loss — the reversal of the newest digits (all even → ODD, all odd → EVEN) on the same market.'
            ),
            key_words: localize('over 1 under 8 even odd recovery loss reversal parity digit'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_parity_recovery = block => {
    const primary = PRIMARY_LEGS[block.getFieldValue('PRIMARY')] ?? PRIMARY_LEGS.over_1;
    const parity = block.getFieldValue('PARITY');
    const run = Number(block.getFieldValue('RUN'));

    if (!Number.isInteger(run) || run < MIN_RUN || run > MAX_RUN) {
        throw new Error(
            localize('Digits to reverse must be a whole number between {{ min }} and {{ max }}', {
                min: MIN_RUN,
                max: MAX_RUN,
            })
        );
    }

    // The engine reports a settled contract as `win` or `loss`, so the loss branch has to read
    // `loss` — the recovery never ran while this compared against anything else.
    return `
        if (!Bot.sessionHasOpenContract()) {
            if (Bot.sessionLastResult() === 'loss') {
                if (Bot.eoParityReversal(${run}, '${parity}') === 'ODD') {
                    Bot.purchase('DIGITODD');
                } else if (Bot.eoParityReversal(${run}, '${parity}') === 'EVEN') {
                    Bot.purchase('DIGITEVEN');
                }
            } else if (Bot.getLastDigit() ${primary.compare} ${primary.barrier} && Bot.riskCanTrade()) {
                Bot.purchase('${primary.contract}', { barrier: ${primary.barrier} });
            }
        }
    `;
};
