import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_high_run = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last {{ count }} digits are all {{ mode }} {{ digit }}', {
                count: '%1',
                mode: '%2',
                digit: '%3',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'COUNT',
                    check: 'Number',
                },
                {
                    type: 'field_dropdown',
                    name: 'MODE',
                    options: [
                        [localize('at or above'), 'at_or_above'],
                        [localize('above'), 'above'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'DIGIT',
                    options: digitOptions(),
                },
            ],
            inputsInline: true,
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True when that many ticks in a row ended in a digit above — or at or above — the digit you choose'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digits above in a row'),
            description: localize(
                'Checks the newest ticks only, in order: with 3 and “at or above 6”, the sequence 6, 8, 7 is true while 6, 5, 9 is false because the 5 breaks the run. The count is the number of ticks in a row that must qualify.'
            ),
            key_words: localize('digit consecutive run streak in a row above over high three'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_high_run = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const digit = block.getFieldValue('DIGIT');
    const mode = block.getFieldValue('MODE') === 'above' ? 'above' : 'at_or_above';
    const count = generator.valueToCode(block, 'COUNT', generator.ORDER_ATOMIC) || '3';
    const code = `Bot.areLastDigitsHigh(${digit}, ${count}, '${mode}')`;
    return [code, generator.ORDER_ATOMIC];
};
