import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Forget strategy learning" — clears every recorded strategy number without touching limits. */
window.Blockly.Blocks.learn_reset = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Forget all strategy learning'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Clears every recorded strategy sample, hit rate, streak and profit, and returns to the default strategy label. Risk limits are not touched.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Forget strategy learning'),
            description: localize('Clears the recorded strategy results so a new measurement can start.'),
            key_words: localize('learning reset clear forget strategy samples'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_reset = () => 'Bot.learnReset();\n';
