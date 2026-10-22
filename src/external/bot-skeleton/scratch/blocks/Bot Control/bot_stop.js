import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Stop the bot" — ends the session through the run panel's own Stop path, so the current contract
 * is still allowed to settle and the UI reports the stop exactly as if Stop had been pressed.
 */
window.Blockly.Blocks.bot_stop = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Stop the bot — reason %1', { reason: '%1' }),
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
                'Stops the run the same way the Stop button does: the open contract is allowed to settle, the subscriptions are cleared and the reason is written to the run log. Further calls in the same session do nothing.'
            ),
            category: window.Blockly.Categories.Bot_Control,
        };
    },
    meta() {
        return {
            display_name: localize('Stop the bot'),
            description: localize('Ends the session with a reason recorded in the run log.'),
            key_words: localize('stop bot end session halt abort control'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.bot_stop = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const reason = generator.valueToCode(block, 'REASON', generator.ORDER_ATOMIC) || "''";
    return `Bot.sessionStop(${reason});\n`;
};
