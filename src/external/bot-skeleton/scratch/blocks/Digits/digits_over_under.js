import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_over_under = digitBlock({
    message: localize('Last digit is {{ side }} {{ digit }}', { side: '%1', digit: '%2' }),
    args: [
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
    tooltip: localize('True when the last digit of the newest tick is over or under the digit you choose'),
    displayName: localize('Digit over / under'),
    description: localize(
        'The contract gate. “Over 1” wins on digits 2–9, “Under 6” wins on digits 0–5 — the digit you pick is not included.'
    ),
    keyWords: localize('digit last over under barrier'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_over_under = digitGenerator(block => {
    const digit = block.getFieldValue('DIGIT');
    return block.getFieldValue('SIDE') === 'over' ? `Bot.isLastDigitOver(${digit})` : `Bot.isLastDigitUnder(${digit})`;
});
