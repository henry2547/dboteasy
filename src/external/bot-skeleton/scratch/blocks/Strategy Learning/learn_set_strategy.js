import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Learn trades as strategy" — labels the settlements that follow, so hit rate, streaks and profit
 * are measured per strategy instead of over the whole session.
 */
window.Blockly.Blocks.learn_set_strategy = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Learn following trades as strategy %1', { name: '%1' }),
            args0: [
                {
                    type: 'field_input',
                    name: 'NAME',
                    text: localize('strategy 1'),
                },
            ],
            previousStatement: null,
            nextStatement: null,
            inputsInline: true,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Names the strategy used from here on. Every contract that settles afterwards is counted under this label, using the profit the engine really booked. Use the same name in the other learning blocks to compare strategies.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Learn trades as strategy'),
            description: localize(
                'Labels the trades that follow with a strategy name, so this run can measure how each named strategy really performed.'
            ),
            key_words: localize('learning strategy label name record track'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_set_strategy = block => {
    const name = String(block.getFieldValue('NAME') ?? '');
    return `Bot.learnSetStrategy(${JSON.stringify(name)});\n`;
};
