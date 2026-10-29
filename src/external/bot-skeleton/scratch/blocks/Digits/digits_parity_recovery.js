import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** The two legs the block can trade first, and the barrier each one reads. */
const PRIMARY_LEGS = {
    over_1: { contract: 'DIGITOVER', barrier: 1, compare: '>' },
    under_8: { contract: 'DIGITUNDER', barrier: 8, compare: '<' },
};

const MAX_TICKS = 1000;
const MIN_RUN = 2;
const MAX_RUN = 100;

/**
 * "Trade Over 1 / Under 8, recover on Even/Odd" — both legs of a digit strategy in one block.
 *
 * The first leg buys the bot's own Over/Under contract when the newest genuine digit passes the
 * barrier the block is configured with. Only after a settled loss does the second leg run: it
 * measures every eligible volatility market through the engine's own parity scan
 * (`Bot.marketScanBestParity`) ONCE for that loss, arms the parity-reversal window on the market it
 * kept and reads it (`Bot.eoRecoveryPrepare`): the last {{ run }} digits all even buy ODD, all odd
 * buy EVEN, a mixed run is no entry. The buy itself goes through the engine's own purchase path
 * (`Bot.eoBuyEven` / `Bot.eoBuyOdd`), which refuses — with the reason in the journal — while the
 * window is incomplete, the risk limits block new entries, or the trade definition is not a digit
 * definition listing `both`. A contract that is already open is never doubled.
 */
window.Blockly.Blocks.digits_parity_recovery = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize(
                'Trade {{ primary }}, then after a loss buy {{ parity }} when the last {{ run }} digits share a parity',
                {
                    primary: '%1',
                    parity: '%2',
                    run: '%3',
                }
            ),
            // Blockly numbers each message's placeholders from %1, so this one starts again at %1.
            message1: localize('on the best even/odd market, measured over {{ ticks }} ticks', {
                ticks: '%1',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PRIMARY',
                    options: [
                        [localize('Over 1'), 'over_1'],
                        [localize('Under 8'), 'under_8'],
                    ],
                },
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('both reversals'), 'both'],
                        [localize('EVEN only'), 'even'],
                        [localize('ODD only'), 'odd'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'RUN',
                    value: 2,
                    min: MIN_RUN,
                    max: MAX_RUN,
                    precision: 0,
                },
            ],
            args1: [
                {
                    type: 'field_number',
                    name: 'TICKS',
                    value: 100,
                    min: 1,
                    max: MAX_TICKS,
                    precision: 0,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Buys Over 1 (or Under 8) when the newest digit passes that barrier. After a settled loss it scans every eligible volatility market once, keeps the one whose own last ticks are the most lopsided between even and odd, and buys the parity the opposite of the run it reads: the last N digits all even → ODD, all odd → EVEN. A mixed run is no entry. Refused, with the reason in the log, while the window is incomplete, the risk limits block it, or the trade definition cannot buy that contract.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Trade Over 1 / Under 8, recover on Even/Odd'),
            description: localize(
                'One two-leg entry: the Over 1 or Under 8 digit trade first, then — after a loss — the reversal of the last digits (all even → ODD, all odd → EVEN) on the best even/odd market it finds.'
            ),
            key_words: localize('over 1 under 8 even odd recovery loss reversal scan market parity digit'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_parity_recovery = block => {
    const primary = PRIMARY_LEGS[block.getFieldValue('PRIMARY')] ?? PRIMARY_LEGS.over_1;
    const parity = block.getFieldValue('PARITY');
    const run = Number(block.getFieldValue('RUN'));
    const ticks = Number(block.getFieldValue('TICKS'));

    if (!Number.isInteger(run) || run < MIN_RUN || run > MAX_RUN) {
        throw new Error(
            localize('Digits to reverse must be a whole number between {{ min }} and {{ max }}', {
                min: MIN_RUN,
                max: MAX_RUN,
            })
        );
    }
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > MAX_TICKS) {
        throw new Error(
            localize('Ticks to analyse must be a whole number between 1 and {{ max }}', { max: MAX_TICKS })
        );
    }

    // The first leg reads the newest genuine digit against the barrier it was configured with. After
    // a settled loss the recovery leg prepares once (scan + reversal window) and then enters on the
    // reversal it reads — so an open contract is never doubled, and the market scan is not repeated
    // on every pass of the trade loop.
    return `
        if (!Bot.sessionHasOpenContract()) {
            if (Bot.sessionLastResult() === 'lost') {
                if (Bot.eoRecoveryPrepare({ run: ${run}, direction: '${parity}', ticks: ${ticks} })) {
                    if (Bot.eoSignalDirection() === 'EVEN') {
                        Bot.eoBuyEven();
                    } else if (Bot.eoSignalDirection() === 'ODD') {
                        Bot.eoBuyOdd();
                    }
                }
            } else if (Bot.getLastDigit() ${primary.compare} ${primary.barrier} && Bot.riskCanTrade()) {
                Bot.purchase('${primary.contract}', { barrier: ${primary.barrier} });
            }
        }
    `;
};
