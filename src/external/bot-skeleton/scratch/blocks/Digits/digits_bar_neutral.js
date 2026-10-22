import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

/**
 * The digit bar the Digits page draws: green (hottest) for the digit that appeared most in the
 * window, red (coldest) for the one that appeared least. A digit with neither bar is neutral —
 * and a bar that cannot be read at all is *unknown*, which this block reports as false.
 */
window.Blockly.Blocks.digits_bar_neutral = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Digit {{ digit }} bar is neutral (not hottest / not coldest) in last {{ sample }} ticks', {
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
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True when the digit carries neither the green (hottest) nor the red (coldest) bar of the digit grid'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit bar is neutral'),
            description: localize(
                'Reads the same green (hottest) and red (coldest) bars the Digits page draws for the last ticks. It answers true only when the digit genuinely has neither bar; a bar that cannot be read — no ticks yet — answers false, never neutral.'
            ),
            key_words: localize('digit bar neutral hottest coldest green red hot cold'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_bar_neutral = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const digit = block.getFieldValue('DIGIT');
    const sample = generator.valueToCode(block, 'SAMPLE', generator.ORDER_ATOMIC) || '100';
    const code = `Bot.isDigitBarNeutral(${digit}, ${sample})`;
    return [code, generator.ORDER_ATOMIC];
};
