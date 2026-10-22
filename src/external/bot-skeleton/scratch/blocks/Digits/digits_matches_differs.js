import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_matches_differs = digitBlock({
    message: localize('Last digit {{ mode }} {{ digit }}', { mode: '%1', digit: '%2' }),
    args: [
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
    tooltip: localize('True when the last digit of the newest tick matches or differs from the digit you choose'),
    displayName: localize('Digit matches / differs'),
    description: localize('Checks whether the last digit of the newest tick is, or is not, the digit you choose.'),
    keyWords: localize('digit last matches differs'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_matches_differs = digitGenerator(block => {
    const digit = block.getFieldValue('DIGIT');
    return block.getFieldValue('MODE') === 'differs'
        ? `Bot.isLastDigitDiffers(${digit})`
        : `Bot.isLastDigitMatches(${digit})`;
});
