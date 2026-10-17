import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_over_under = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last digit is {{ side }} {{ digit }}', { side: '%1', digit: '%2' }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'SIDE',
                    options: [
                        [localize('Over'), 'over'],
                        [localize('Under'), 'under'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'DIGIT',
                    options: digitOptions(),
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('True when the last digit of the latest tick is over or under the digit you choose'),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit over/under'),
            description: localize(
                'Checks the last digit of the latest tick against a digit you choose. “Over 2” is true for digits 3 to 9, “Under 7” is true for digits 0 to 6.'
            ),
            key_words: localize('digit last over under'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_over_under = block => {
    const side = block.getFieldValue('SIDE');
    const digit = block.getFieldValue('DIGIT');
    const code = side === 'over' ? `Bot.isLastDigitOver(${digit})` : `Bot.isLastDigitUnder(${digit})`;
    return [code, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
