import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const MAX_TICKS = 1000;

/**
 * "Use the best Even/Odd market" — one scan that compares every eligible volatility market and
 * hands the strategy the most lopsided one.
 *
 * The generated code drives the trade engine's own market scan
 * (`Bot.marketScanBestParity`): every eligible market is subscribed through the ordinary scan path,
 * its own tick history is read with its own quote precision, and the market whose last N ticks hold
 * the largest share of one parity becomes the market the bot trades on. The engine journals the
 * measurement behind every market it looked at, so the choice can be checked against the ticks it
 * was made on. Nothing is traded by this block — proposals, risk checks and the Demo/Real
 * protections stay in the trade engine, and the entry gates the user attached decide the trade.
 */
window.Blockly.Blocks.switch_best_parity_market = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Scan every volatility market, compare the last {{ ticks }} ticks and use the best even/odd market', {
                ticks: '%1',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'TICKS',
                    check: 'Number',
                },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Walks every volatility market the app offers, reads the last N ticks of each market’s own history with its own quote precision, and moves the bot to the market whose even/odd split is the most lopsided. Markets that are closed, cooling down or have no usable history are skipped with their reason. A split describes the ticks already seen, never the next one, and no trade is placed by this block.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Use the best even/odd market'),
            description: localize(
                'Scans every eligible volatility market and continues on the one with the strongest even/odd split over its own recent ticks.'
            ),
            key_words: localize('even odd best market scan volatility switch parity compare'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.switch_best_parity_market = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const ticks_block = block.getInputTargetBlock('TICKS');

    if (ticks_block && ticks_block.type === 'math_number') {
        const value = Number(ticks_block.getFieldValue('NUM'));
        if (!Number.isInteger(value) || value < 1 || value > MAX_TICKS) {
            throw new Error(
                localize('Ticks to compare must be a whole number between 1 and {{ max }}', { max: MAX_TICKS })
            );
        }
    }

    // No number connected: the engine's own default sample is used, so there is one source of truth.
    const ticks = generator.valueToCode(block, 'TICKS', generator.ORDER_ATOMIC) || 'null';
    return `Bot.marketScanBestParity({ ticks: ${ticks} });\n`;
};
