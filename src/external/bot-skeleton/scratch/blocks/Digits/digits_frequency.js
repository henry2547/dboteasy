import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_frequency = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Frequency (%) of digit {{ digit }} in last {{ sample }} ticks', {
                digit: '%1',
                sample: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'DIGIT',
                    options: digitOptions(),
                },
                {
                    type: 'input_value',
                    name: 'SAMPLE',
                    check: 'Number',
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('The share of the recent ticks, in percent, whose last digit is the digit you choose'),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit frequency'),
            description: localize(
                'Tells you how often a digit showed up in the last ticks as a percentage. Every digit should appear about 10% of the time.'
            ),
            key_words: localize('digit frequency percentage share last'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_frequency = block => {
    const digit = block.getFieldValue('DIGIT');
    const sample =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'SAMPLE',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || '100';
    const code = `Bot.getDigitFrequency(${digit}, ${sample})`;
    return [code, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
