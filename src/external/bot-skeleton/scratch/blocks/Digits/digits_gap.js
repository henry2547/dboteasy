import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_gap = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Ticks since digit {{ digit }} last appeared', { digit: '%1' }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'DIGIT',
                    options: digitOptions(),
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How many ticks ago the digit you choose last appeared. 0 means the newest tick ended in it, and -1 means it has not appeared in the loaded ticks at all.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit gap'),
            description: localize(
                'Counts how many ticks have passed since the digit you choose last showed up, so a condition can wait for a digit that has been away.'
            ),
            key_words: localize('digit gap absent missing since last appeared overdue'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_gap = block => {
    const digit = block.getFieldValue('DIGIT');
    return [`Bot.getDigitGap(${digit})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
