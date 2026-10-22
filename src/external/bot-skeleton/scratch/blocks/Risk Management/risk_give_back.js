import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Given back from the peak" — profit the session reached and no longer holds. */
window.Blockly.Blocks.risk_give_back = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Profit given back from the session peak'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How much of the highest profit this session reached has since been lost. 0 while the session is still at or above its peak, and 0 when it never made a profit.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Profit given back'),
            description: localize(
                'Measures the profit the session gave back from its own peak, so a program can keep a gain instead of handing it back.'
            ),
            key_words: localize('risk give back drawdown peak profit keep gains'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_give_back = () => [
    'Bot.riskGiveBack()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
