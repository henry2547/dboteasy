import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_longest_run = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Longest run of digit {{ digit }} in last {{ sample }} ticks', {
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
            tooltip: localize(
                'The most ticks in a row that ended in the digit you choose, within the sample. 0 means the digit never repeated.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Longest digit run'),
            description: localize(
                'Finds the longest run the digit you choose ever managed inside the sample, so a bot can tell a digit that clusters from one that only appeared once.'
            ),
            key_words: localize('digit longest run streak repeated consecutive cluster'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_longest_run = block => {
    const digit = block.getFieldValue('DIGIT');
    const sample =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'SAMPLE',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || '100';
    return [
        `Bot.getLongestDigitRun(${digit}, ${sample})`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
