import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Wait for settlement" — the program suspends until the open contract settles, so the blocks that
 * follow read a settled result instead of a mid-contract snapshot.
 */
window.Blockly.Blocks.exec_wait_settlement = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Wait until the open contract settles'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Pauses the program until the contract the engine is holding settles (or the session stops), then continues. It returns immediately when no contract is open, so it is safe at the start of a cycle.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('Wait for settlement'),
            description: localize('Waits until the open contract settles before the program continues.'),
            key_words: localize('wait settlement contract settle pause sync execution'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_wait_settlement = () =>
    'Bot.sessionWaitForSettlement();\n';
