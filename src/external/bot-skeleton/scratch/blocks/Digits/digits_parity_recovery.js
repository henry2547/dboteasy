import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** The two legs the block can trade first, and the barrier each one reads. */
const PRIMARY_LEGS = {
    over_1: { contract: 'DIGITOVER', barrier: 1, compare: '>' },
    under_8: { contract: 'DIGITUNDER', barrier: 8, compare: '<' },
};

const MAX_TICKS = 1000;

/**
 * "Trade Over 1 / Under 8, recover on Even/Odd" — both legs of a digit strategy in one block.
 *
 * The first leg buys the bot's own Over/Under contract when the newest genuine digit passes the
 * barrier the block is configured with. Only after a settled loss does the second leg run: it
 * measures every eligible volatility market through the engine's own parity scan
 * (`Bot.marketScanBestParity`), configures the Even/Odd window on the market it kept
 * (`Bot.eoConfigure` / `Bot.eoMonitor`) and enters through the engine's own purchase path
 * (`Bot.eoBuyEven` / `Bot.eoBuyOdd`). That entry is refused — with the reason in the journal — while
 * the window is incomplete, the risk limits block new entries, or the trade definition is not set to
 * Even/Odd, so the block never invents an entry. A contract that is already open is never doubled.
 */
window.Blockly.Blocks.digits_parity_recovery = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize(
                'Trade {{ primary }}, then after a loss find an {{ parity }} entry over the last {{ ticks }} ticks (at least {{ percent }}%)',
                {
                    primary: '%1',
                    parity: '%2',
                    ticks: '%3',
                    percent: '%4',
                }
            ),
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
                        [localize('stronger even/odd side'), 'both'],
                        [localize('EVEN'), 'even'],
                        [localize('ODD'), 'odd'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'TICKS',
                    value: 100,
                    min: 1,
                    max: MAX_TICKS,
                    precision: 0,
                },
                {
                    type: 'field_number',
                    name: 'PERCENT',
                    value: 55,
                    min: 0,
                    max: 100,
                    precision: 1,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Buys Over 1 (or Under 8) when the newest digit passes that barrier. After a settled loss it scans every eligible volatility market, keeps the one whose own last ticks are the most lopsided between even and odd, and enters the Even/Odd contract the trade definition offers — refused, with the reason in the log, while the window is incomplete, the risk limits block it, or the trade definition is not set to Even/Odd.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Trade Over 1 / Under 8, recover on Even/Odd'),
            description: localize(
                'One two-leg entry: the Over 1 or Under 8 digit trade first, then — after a loss — the best even/odd market it finds.'
            ),
            key_words: localize('over 1 under 8 even odd recovery loss scan market parity digit'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_parity_recovery = block => {
    const primary = PRIMARY_LEGS[block.getFieldValue('PRIMARY')] ?? PRIMARY_LEGS.over_1;
    const parity = block.getFieldValue('PARITY');
    const ticks = Number(block.getFieldValue('TICKS'));
    const percent = Number(block.getFieldValue('PERCENT'));

    if (!Number.isInteger(ticks) || ticks < 1 || ticks > MAX_TICKS) {
        throw new Error(
            localize('Ticks to analyse must be a whole number between 1 and {{ max }}', { max: MAX_TICKS })
        );
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error(localize('The even/odd share must be a percentage between 0 and 100'));
    }

    // The first leg reads the newest genuine digit against the barrier it was configured with; the
    // second leg only runs on a settled loss, so an open contract is never doubled.
    return `
        if (!Bot.sessionHasOpenContract()) {
            if (Bot.sessionLastResult() === 'lost') {
                Bot.marketScanBestParity({ ticks: ${ticks} });
                Bot.eoConfigure({ ticks: ${ticks}, percent: ${percent}, direction: '${parity}' });
                Bot.eoMonitor(${ticks});
                if (Bot.eoWindowReady() && Bot.eoEntryAllowed()) {
                    if (Bot.eoSignalDirection() === 'EVEN') {
                        Bot.eoBuyEven();
                    } else {
                        Bot.eoBuyOdd();
                    }
                }
            } else if (Bot.getLastDigit() ${primary.compare} ${primary.barrier} && Bot.riskCanTrade()) {
                Bot.purchase('${primary.contract}', { barrier: ${primary.barrier} });
            }
        }
    `;
};
