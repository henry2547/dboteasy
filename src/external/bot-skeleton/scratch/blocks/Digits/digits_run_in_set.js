import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';

/** The two losing-digit pairs the digit setups wait for. */
const SETS = ['0_1', '8_9'];

/**
 * "Last N digits all 0 or 1" (or 8 or 9) — the run the Over 1 / Under 8 entries wait for.
 *
 * With a count of 3 it reads the user's own rule literally: the last two digits were a pair from
 * the set — 0,0 · 0,1 · 1,1 · 1,0 for Over 1 and 8,8 · 8,9 · 9,9 · 9,8 for Under 8 — and the newest
 * tick then *confirmed* the run by ending in the same pair. Any other digit in between stops the run.
 */
window.Blockly.Blocks.digits_run_in_set = digitBlock({
    message: localize('Last {{ count }} digits all {{ set }}', { count: '%1', set: '%2' }),
    args: [
        {
            type: 'input_value',
            name: 'COUNT',
            check: 'Number',
        },
        {
            type: 'field_dropdown',
            name: 'SET',
            options: [
                [localize('0 or 1'), '0_1'],
                [localize('8 or 9'), '8_9'],
            ],
        },
    ],
    output: 'Boolean',
    tooltip: localize(
        'True when that many ticks in a row ended in a digit from the pair you choose — 0,0 · 0,1 · 1,1 · 1,0 for 0 or 1'
    ),
    displayName: localize('Low / high digits in a row'),
    description: localize(
        'Reads the newest ticks in order: with 3 and “0 or 1”, 0, 0, 1 is true (the pair then its confirmation) and 1, 5, 0 is false because the 5 breaks the run. This is the trigger for the Over 1 and Under 8 cold-run setups.'
    ),
    keyWords: localize('digit consecutive run streak in a row pair low high zero one eight nine'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_run_in_set = digitGenerator(block => {
    const chosen = block.getFieldValue('SET');
    const set = SETS.includes(chosen) ? chosen : '0_1';
    return `Bot.areLastDigitsInSet(${sampleCode(block, 'COUNT', '3')}, '${set}')`;
});
