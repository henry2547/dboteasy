import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

window.Blockly.Blocks.digits_parity_share = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Share (%) of {{ parity }} digits in last {{ sample }} ticks', {
                parity: '%1',
                sample: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('even'), 'even'],
                        [localize('odd'), 'odd'],
                    ],
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
                'The share of the sample that was even (0, 2, 4, 6, 8) or odd (1, 3, 5, 7, 9), in percent. 50% is a balanced sample.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit parity share'),
            description: localize(
                'Tells you how lopsided the recent ticks are between even and odd digits, as a percentage of the sample.'
            ),
            key_words: localize('digit parity even odd share percentage balance split'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_parity_share = block => {
    const parity = block.getFieldValue('PARITY');
    const sample =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'SAMPLE',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || '100';
    return [
        `Bot.getDigitParityShare('${parity}', ${sample})`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
