import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const MIN_RUN = 2;
const MAX_RUN = 100;

/**
 * "Journal the last digits & buy the reverse" — the reversal entry as one block.
 *
 * It reads the newest RUN digits of the market the bot is already trading, writes them to the
 * journal together with the parity they point at, and buys the OPPOSITE parity through the engine's
 * own purchase path: the last digits all even → ODD, all odd → EVEN. A mixed run is no entry, so the
 * block waits for the next pair instead of trading blind, and the same digits never enter twice.
 *
 * The read comes from the engine's genuine tick stream, so an incomplete, stale or disconnected
 * feed never signals and never trades.
 */
window.Blockly.Blocks.eo_journal_reverse = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Journal the last {{ run }} digits & buy the reverse parity', { run: '%1' }),
            args0: [
                {
                    type: 'field_number',
                    name: 'RUN',
                    value: 2,
                    min: MIN_RUN,
                    max: MAX_RUN,
                    precision: 0,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Journals the newest digits and buys the parity they predict to break: the last N digits all even → ODD, all odd → EVEN. A mixed run is no entry, so the block waits for the next pair instead of trading blind. The purchase goes through the engine’s own purchase path and the same digits never enter twice.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Journal last digits & buy the reverse'),
            description: localize(
                'One reversal entry: journals the last N digits and buys the opposite parity (all even → ODD, all odd → EVEN). A mixed run is no entry.'
            ),
            key_words: localize('even odd journal last digits reversal buy purchase parity entry'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_journal_reverse = block => {
    const run = Number(block.getFieldValue('RUN'));

    if (!Number.isInteger(run) || run < MIN_RUN || run > MAX_RUN) {
        throw new Error(
            localize('Digits to reverse must be a whole number between {{ min }} and {{ max }}', {
                min: MIN_RUN,
                max: MAX_RUN,
            })
        );
    }

    return `Bot.eoJournalReverse(${run});\n`;
};
