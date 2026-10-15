import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_matches_differs = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last digit {{ mode }} {{ digit }}', { mode: '%1', digit: '%2' }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'MODE',
                    options: [
                        [localize('matches'), 'matches'],
                        [localize('differs from'), 'differs'],
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
            tooltip: localize('True when the last digit of the latest tick matches or differs from the digit you choose'),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit matches/differs'),
            description: localize('Checks whether the last digit of the latest tick is (or is not) the digit you choose.'),
            key_words: localize('digit last matches differs'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_matches_differs = block => {
    const mode = block.getFieldValue('MODE');
    const digit = block.getFieldValue('DIGIT');
    const code = mode === 'differs' ? `Bot.isLastDigitDiffers(${digit})` : `Bot.isLastDigitMatches(${digit})`;
    return [code, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
