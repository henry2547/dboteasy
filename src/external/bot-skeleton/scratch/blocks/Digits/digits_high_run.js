import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_high_run = digitBlock({
    message: localize('Last {{ count }} digits all {{ mode }} {{ digit }}', {
        count: '%1',
        mode: '%2',
        digit: '%3',
    }),
    args: [
        {
            type: 'input_value',
            name: 'COUNT',
            check: 'Number',
        },
        {
            type: 'field_dropdown',
            name: 'MODE',
            options: [
                [localize('at or above'), 'at_or_above'],
                [localize('above'), 'above'],
            ],
        },
        {
            type: 'field_dropdown',
            name: 'DIGIT',
            options: digitOptions(),
        },
    ],
    output: 'Boolean',
    tooltip: localize(
        'True when that many ticks in a row ended in a digit above — or at or above — the digit you choose'
    ),
    displayName: localize('High digits in a row'),
    description: localize(
        'Reads the newest ticks in order: with 3 and “at or above 6”, 6, 8, 7 is true and 6, 5, 9 is false because the 5 breaks the run. This is the trigger for the Under 6 recovery leg.'
    ),
    keyWords: localize('digit consecutive run streak in a row above over high three'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_high_run = digitGenerator(block => {
    const mode = block.getFieldValue('MODE') === 'above' ? 'above' : 'at_or_above';
    return `Bot.areLastDigitsHigh(${block.getFieldValue('DIGIT')}, ${sampleCode(block, 'COUNT', '3')}, '${mode}')`;
});
