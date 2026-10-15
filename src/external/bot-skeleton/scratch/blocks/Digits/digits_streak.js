import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

window.Blockly.Blocks.digits_streak = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Ticks in a row with the same last digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('How many ticks in a row ended with the same last digit as the latest tick'),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit streak'),
            description: localize(
                'Counts how many ticks in a row ended with the same last digit as the latest tick. A value of 1 means the newest tick is the start of a new run.'
            ),
            key_words: localize('digit streak run repeat consecutive same last'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_streak = () => [
    'Bot.getDigitStreak()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
