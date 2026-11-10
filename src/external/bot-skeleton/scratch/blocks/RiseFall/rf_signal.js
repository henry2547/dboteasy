import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Rise/Fall signal" — the selected strategy's current direction: rise, fall or none. */
window.Blockly.Blocks.rf_signal = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Rise/Fall signal'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The strategy selected on the Rise/Fall tab answers "rise", "fall" or "none" for the newest genuine tick. "none" is NO TRADE — it is a real reading, not an error.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Rise/Fall signal'),
            description: localize('Reads the current Rise, Fall or NO TRADE signal from the engine.'),
            key_words: localize('rise fall signal direction no trade'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_signal = () => [
    'Bot.rfSignal()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
