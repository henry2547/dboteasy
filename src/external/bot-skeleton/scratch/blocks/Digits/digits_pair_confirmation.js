import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

/** The two losing-digit pairs the digit setups wait for. */
const SETS = ['0_1', '8_9'];

/**
 * "A 0 or 1 pair (or 8 or 9), then a confirmation digit" — the observed pattern the Over 1 and
 * Under 8 entries wait for.
 *
 * A pair from the set — 0,0 · 0,1 · 1,1 · 1,0 for Over 1, 8,8 · 8,9 · 9,9 · 9,8 for Under 8 — has
 * to appear, and the newest tick then confirms it by ending in the same set. The confirmation may
 * sit right after the pair or several ticks later, and any digits may pass in between, including
 * digits from the pair itself: 0, 1, 5, 4, 1 and 0, 0, 5, 1, 0 are both confirmed pairs.
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
        'True when a pair from the set appeared and a later tick confirmed it by ending in the same set: 0, 1 then 0 is confirmed, and so is 0, 1 then 3, 5, 7 then 1; for the high pair 8, 9 then 9 and 9, 8 then 6, 7, 5 then 8. Up to 3 digits — digits from the set included — may pass between the pair and its confirmation, and a pair further back than that is stale.'
    ),
    displayName: localize('Pair, then a confirmation digit'),
    description: localize(
        'The observed pair setup, read from where each digit sits: with “0 or 1”, 0, 1 then 0 is true — and so is 0, 1 then 3, 5, 7 then 1, because up to 3 digits may pass between the pair and its confirmation, in-set ones included. With “8 or 9”, 8, 9 then 9 is true, and so is 9, 8 then 6, 7, 5 then 8. A bare pair (0, 1 with no confirmation yet) is false, and so is a pair that sits further back than 3 ticks.'
    ),
    keyWords: localize('pair confirmation confirmed 0 1 8 9 pattern observed digit gap'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_pair_confirmation = digitGenerator(block => {
    const chosen = block.getFieldValue('SET');
    const set = SETS.includes(chosen) ? chosen : '0_1';
    return `Bot.isPairConfirmed('${set}')`;
});
