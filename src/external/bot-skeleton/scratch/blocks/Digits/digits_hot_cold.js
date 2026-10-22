import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';

window.Blockly.Blocks.digits_hot_cold = digitBlock({
    message: localize('{{ mode }} digit, last {{ sample }} ticks', { mode: '%1', sample: '%2' }),
    args: [
        {
            type: 'field_dropdown',
            name: 'MODE',
            options: [
                [localize('Hottest'), 'hottest'],
                [localize('Coldest'), 'coldest'],
            ],
        },
        {
            type: 'input_value',
            name: 'SAMPLE',
            check: 'Number',
        },
    ],
    output: 'Number',
    tooltip: localize('The digit that appeared most (hottest) or least (coldest) often in the recent ticks'),
    displayName: localize('Hot / cold digit'),
    description: localize(
        'Gives the digit that showed up most or least often in the last ticks, ready to feed a Matches or Differs block.'
    ),
    keyWords: localize('digit hottest coldest most least frequent'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_hot_cold = digitGenerator(
    block => `Bot.getHotColdDigit('${block.getFieldValue('MODE')}', ${sampleCode(block, 'SAMPLE', '100')})`
);
