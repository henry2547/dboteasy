import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const MIN_RUN = 2;
const MAX_RUN = 100;

/**
 * A standalone Even/Odd entry block. It is not a recovery leg: put it in a bot
 * whose trade definition is Digits → Even/Odd. It reads the newest RUN genuine
 * digits on the selected market and buys the opposite parity (all even → ODD,
 * all odd → EVEN); a mixed run waits without placing a trade.
 */
window.Blockly.Blocks.eo_journal_reverse = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Trade the opposite parity when the last {{ run }} digits share parity', { run: '%1' }),
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
                'Standalone Even/Odd entry for an Even/Odd trade definition. Reads the last N genuine digits on the selected market: all even buys ODD, all odd buys EVEN, and a mixed run waits. This block is not an Over/Under recovery leg.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Trade opposite Even/Odd from last N digits'),
            description: localize(
                'A self-contained Even/Odd entry. Choose the number of newest digits; all even buys ODD, all odd buys EVEN, and mixed parity does not trade. Use with a Digits → Even/Odd trade definition, not as an Over/Under recovery.'
            ),
            key_words: localize('even odd standalone last digits parity trade entry opposite'),
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
