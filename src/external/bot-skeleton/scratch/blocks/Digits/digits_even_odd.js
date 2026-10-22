import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

window.Blockly.Blocks.digits_even_odd = digitBlock({
    message: localize('Last digit is {{ parity }}', { parity: '%1' }),
    args: [
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
    tooltip: localize('True when the last digit of the newest tick is even or odd'),
    displayName: localize('Digit even / odd'),
    description: localize('Even is 0, 2, 4, 6, 8 and odd is 1, 3, 5, 7, 9 — the two simplest digit contracts.'),
    keyWords: localize('digit last even odd parity'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_even_odd = digitGenerator(
    block => `Bot.isLastDigitParity('${block.getFieldValue('PARITY')}')`
);
