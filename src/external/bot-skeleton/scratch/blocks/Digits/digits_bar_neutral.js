import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';
import { digitOptions } from './digit-options';

/**
 * The digit bar the Digits page draws: green (hottest) for the digit that appeared most in the
 * window, red (coldest) for the one that appeared least. A digit with neither bar is neutral —
 * and a bar that cannot be read at all is *unknown*, which this block reports as false.
 */
window.Blockly.Blocks.digits_bar_neutral = digitBlock({
    message: localize('Digit {{ digit }} has no hot / cold bar, last {{ sample }} ticks', {
        digit: '%1',
        sample: '%2',
    }),
    args: [
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
    output: 'Boolean',
    tooltip: localize(
        'True when the digit carries neither the green (hottest) nor the red (coldest) bar of the digit grid'
    ),
    displayName: localize('Neutral digit bar'),
    description: localize(
        'Reads the same green (hottest) and red (coldest) bars the Digits page draws. True only when the digit genuinely has neither bar; a bar that cannot be read — no ticks yet — answers false, never neutral.'
    ),
    keyWords: localize('digit bar neutral hottest coldest green red hot cold'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_bar_neutral = digitGenerator(
    block => `Bot.isDigitBarNeutral(${block.getFieldValue('DIGIT')}, ${sampleCode(block, 'SAMPLE', '100')})`
);
