import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_frequency = digitBlock({
    message: localize('Digit {{ digit }} frequency (%), last {{ sample }} ticks', { digit: '%1', sample: '%2' }),
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
    output: 'Number',
    tooltip: localize('The share of the recent ticks, in percent, whose last digit is the digit you choose'),
    displayName: localize('Digit frequency'),
    description: localize(
        'How often the digit showed up in the last ticks, as a percentage. A fair digit sits near 10%, so well above is hot and well below is cold.'
    ),
    keyWords: localize('digit frequency percentage share window'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_frequency = digitGenerator(
    block => `Bot.getDigitFrequency(${block.getFieldValue('DIGIT')}, ${sampleCode(block, 'SAMPLE', '100')})`
);
