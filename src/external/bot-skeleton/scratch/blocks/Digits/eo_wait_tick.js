import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Wait for next valid tick" — suspends the program until the engine hands it a genuine new tick.
 *
 * The program resumes inside the existing tick stream: it does not poll, it does not block the UI
 * thread, it never processes the same tick twice (a repeated epoch is dropped) and a session that
 * stops releases the wait immediately instead of leaving the program suspended.
 */
window.Blockly.Blocks.eo_wait_tick = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Wait for next valid tick'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Pauses the program until a new valid tick arrives on the subscribed market. No polling and no repeated tick; a stopped session continues immediately.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Wait for next valid tick'),
            description: localize('Resumes the strategy on the next genuine tick.'),
            key_words: localize('even odd wait next valid tick resume evenodd'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_wait_tick = () => 'Bot.eoWaitTick();\n';
