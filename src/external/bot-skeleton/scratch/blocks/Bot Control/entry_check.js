import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Failed entry check" — records one entry check that came back invalid.
 *
 * The engine keeps the count consecutive: a third failure stops the session through the run panel's
 * own Stop path with the reason written to the run log, and a real entry starts the count again. It
 * is the block the Free Bots templates place in their waiting branches, so a bot whose conditions
 * stay invalid ends the run instead of waiting forever.
 */
window.Blockly.Blocks.entry_check = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Count a failed entry check — stop with reason %1', { reason: '%1' }),
            args0: [
                {
                    type: 'input_value',
                    name: 'REASON',
                    check: 'String',
                },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Records one entry check that came back invalid. After 3 in a row the bot stops itself with this reason in the run log, the same way the Stop button does; a real entry restarts the count.'
            ),
            category: window.Blockly.Categories.Bot_Control,
        };
    },
    meta() {
        return {
            display_name: localize('Failed entry check'),
            description: localize('Stops the bot after 3 invalid entry checks in a row, with the reason recorded.'),
            key_words: localize('invalid entry check stop condition frequency percentage failed'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.entry_check = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const reason = generator.valueToCode(block, 'REASON', generator.ORDER_ATOMIC) || "''";
    return `Bot.entryCheckFailed(${reason});\n`;
};
