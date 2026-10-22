import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Last trade result" — win or loss of the contract this session really settled last. */
window.Blockly.Blocks.exec_last_result = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Result of the last settled trade'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Answers “win” or “loss” for the contract this session settled last, and an empty text before anything has settled — so a first run never looks like a result.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('Last trade result'),
            description: localize('The won/lost outcome of the contract this session settled last.'),
            key_words: localize('trade result last win loss outcome settled execution'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_last_result = () => [
    'Bot.sessionLastResult()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
