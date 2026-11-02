import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

/** The two losing-digit pairs the digit setups wait for. */
const SETS = ['0_1', '8_9'];

/**
 * "A 0 or 1 pair (or 8 or 9), then a confirmation digit" — the observed pattern the Over 1 and
 * Under 8 entries wait for.
 *
 * The last two digits have to be a pair from the set — 0,0 · 0,1 · 1,1 · 1,0 for Over 1, 8,8 ·
 * 8,9 · 9,9 · 9,8 for Under 8 — and the newest tick then confirms it by ending in the same pair.
 * Other digits may pass between the pair and its confirmation: 0, 1, 5, 4, 1 is a confirmed pair.
 * A digit from the set inside that gap (0, 0, 5, 1, 0) has already used the pattern up.
 */
window.Blockly.Blocks.digits_pair_confirmation = digitBlock({
    message: localize('A {{ set }} pair, then a confirmation digit', { set: '%1' }),
    args: [
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
        'True when the last two digits were a pair from the set and a later tick confirmed it by ending in the same pair. Other digits may pass in between.'
    ),
    displayName: localize('Pair, then a confirmation digit'),
    description: localize(
        'The observed pair setup: with “0 or 1”, 0, 0 then 1 is true — and so is 0, 1, 5, 4, 1, because other digits may pass between the pair and its confirmation. A bare pair (0, 1 with no confirmation yet) is false, and so is a digit from the set that already used the pattern up.'
    ),
    keyWords: localize('pair confirmation confirmed 0 1 8 9 pattern observed digit gap'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_pair_confirmation = digitGenerator(block => {
    const chosen = block.getFieldValue('SET');
    const set = SETS.includes(chosen) ? chosen : '0_1';
    return `Bot.isPairConfirmed('${set}')`;
});
