import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Why the risk guard blocks" — the measured reason(s), empty while trading is allowed.
 */
window.Blockly.Blocks.risk_block_reason = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Reason the risk guard is blocking'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The measured reason a new trade is blocked — the loss streak, the profit given back, or the stake already exposed. Empty while the guard allows trading.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Risk block reason'),
            description: localize(
                'States which limit is blocking new trades, with the session number that reached it, so a stop can be logged or shown.'
            ),
            key_words: localize('risk reason blocked why stop limit message'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_block_reason = () => [
    'Bot.riskBlockReason()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
