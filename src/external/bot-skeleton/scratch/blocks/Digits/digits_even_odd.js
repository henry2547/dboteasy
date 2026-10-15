import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

window.Blockly.Blocks.digits_even_odd = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last digit is {{ parity }}', { parity: '%1' }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('Even'), 'even'],
                        [localize('Odd'), 'odd'],
                    ],
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('True when the last digit of the latest tick is even or odd'),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit even/odd'),
            description: localize(
                'Checks whether the last digit of the latest tick is even (0, 2, 4, 6, 8) or odd (1, 3, 5, 7, 9).'
            ),
            key_words: localize('digit last even odd parity'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_even_odd = block => {
    const parity = block.getFieldValue('PARITY');
    const code = `Bot.isLastDigitParity('${parity}')`;
    return [code, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
