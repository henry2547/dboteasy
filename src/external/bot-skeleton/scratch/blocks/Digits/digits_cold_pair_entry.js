import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';

/**
 * The two legs the gate can read, with the losing pair each one waits for and its digit pair.
 * Over 1 loses to 0 and 1, Under 8 loses to 8 and 9.
 */
const PRIMARY_LEGS = {
    over_1: { set: '0_1', digits: [0, 1] },
    under_8: { set: '8_9', digits: [8, 9] },
};

const MIN_PERCENT = 0.1;
const MAX_PERCENT = 100;

/**
 * "Over 1 / Under 8 setup ready" — the whole entry condition of the cold-pair setup as one Boolean:
 * the pair was confirmed on the newest tick, both losing digits sit under the share you set and
 * neither of them carries the red (coldest) bar.
 *
 * It buys nothing itself, so it drops into any entry gate in front of a normal Purchase block.
 */
window.Blockly.Blocks.digits_cold_pair_entry = digitBlock({
    message: localize(
        '{{ primary }} setup: pair confirmed, both digits under {{ percent }} %, no red bar, last {{ sample }} ticks',
        { primary: '%1', percent: '%2', sample: '%3' }
    ),
    args: [
        {
            type: 'field_dropdown',
            name: 'PRIMARY',
            options: [
                [localize('Over 1'), 'over_1'],
                [localize('Under 8'), 'under_8'],
            ],
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
    tooltip: localize(
        'True when the last two digits were a 0/1 pair (or 8/9) and a later tick confirmed it, both losing digits are under the percentage you set, and neither of them carries the red bar.'
    ),
    displayName: localize('Cold pair setup ready'),
    description: localize(
        'The Over 1 / Under 8 entry in one condition: the pair is confirmed (other digits may pass before the confirmation), both losing digits — 0 and 1 for Over 1, 8 and 9 for Under 8 — are under the percentage you set, and neither carries the red (coldest) bar. Join it to a Purchase block inside “before purchase”.'
    ),
    keyWords: localize('over 1 under 8 cold pair confirmed frequency red bar entry ready'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_cold_pair_entry = digitGenerator(block => {
    const leg = PRIMARY_LEGS[block.getFieldValue('PRIMARY')] ?? PRIMARY_LEGS.over_1;
    const percent = Number(sampleCode(block, 'PERCENT', '10.2'));
    const sample = sampleCode(block, 'SAMPLE', '100');

    if (!Number.isFinite(percent) || percent < MIN_PERCENT || percent > MAX_PERCENT) {
        throw new Error(
            localize('The cold share must be a number between {{ min }} and {{ max }} %', {
                min: MIN_PERCENT,
                max: MAX_PERCENT,
            })
        );
    }

    const [first, second] = leg.digits;
    return `(Bot.isPairConfirmed('${leg.set}') && Bot.areDigitSharesBelow([${first}, ${second}], ${percent}, ${sample}) && Bot.isDigitNotCold(${first}, ${sample}) && Bot.isDigitNotCold(${second}, ${sample}))`;
});
