import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';
import { digitOptions } from './digit-options';

/**
 * The share gate two low digits have to pass together — for example digit 0 *and* digit 1 both
 * under 10.3% of the window. Strictly below: a digit sitting exactly on the threshold fails, and an
 * empty window fails too instead of reporting a share nobody measured.
 */
window.Blockly.Blocks.digits_shares_below = digitBlock({
    message: localize('Digits {{ first }} + {{ second }} both under {{ percent }} %, last {{ sample }} ticks', {
        first: '%1',
        second: '%2',
        percent: '%3',
        sample: '%4',
    }),
    args: [
        {
            type: 'field_dropdown',
            name: 'FIRST',
            options: digitOptions(),
        },
        {
            type: 'field_dropdown',
            name: 'SECOND',
            options: digitOptions(),
        },
        {
            type: 'input_value',
            name: 'PERCENT',
            check: 'Number',
        },
        {
            type: 'input_value',
            name: 'SAMPLE',
            check: 'Number',
        },
    ],
    output: 'Boolean',
    tooltip: localize('True when both digits took less than the percentage you set of the recent ticks'),
    displayName: localize('Two digits below a share'),
    description: localize(
        'Checks two digits against one percentage at once — the Over 1 gate: digit 0 and digit 1 both below 10.3% of the window. Both must be strictly below the threshold; with no ticks loaded it answers false.'
    ),
    keyWords: localize('digit frequency share percentage below two digits window'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_shares_below = digitGenerator(block => {
    const first = block.getFieldValue('FIRST');
    const second = block.getFieldValue('SECOND');
    const percent = sampleCode(block, 'PERCENT', '10.3');
    const sample = sampleCode(block, 'SAMPLE', '1000');
    return `Bot.areDigitSharesBelow([${first}, ${second}], ${percent}, ${sample})`;
});
