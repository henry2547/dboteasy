import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';
import { digitOptions } from './digit-options';

/**
 * The red (coldest) bar the Digits page draws. "Not cold" is looser than "neutral": the digit may
 * carry the green (hottest) bar, it just may not be the coldest one. A bar that cannot be read is
 * unknown and answers false, so a missing feed never looks like a passed condition.
 */
window.Blockly.Blocks.digits_no_red_bar = digitBlock({
    message: localize('Digit {{ digit }} has no red bar, last {{ sample }} ticks', {
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
    tooltip: localize('True when the digit is not the coldest one in the window — it carries no red bar'),
    displayName: localize('Digit has no red bar'),
    description: localize(
        'Reads the same red (coldest) bar the Digits page draws. True when the digit does not carry it — the digit may still be the hottest (green) one. A bar that cannot be read — no ticks yet — answers false.'
    ),
    keyWords: localize('digit bar red coldest cold not cold no red bar'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_no_red_bar = digitGenerator(
    block => `Bot.isDigitNotCold(${block.getFieldValue('DIGIT')}, ${sampleCode(block, 'SAMPLE', '100')})`
);
