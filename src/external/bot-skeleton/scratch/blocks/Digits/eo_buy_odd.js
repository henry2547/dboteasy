import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Buy ODD" — the entry the Even/Odd strategy takes when its window selects ODD.
 *
 * The purchase goes through the engine's own purchase path, so the session's risk limits, the trade
 * definition's stake and duration and Deriv's own confirmation all still apply. The engine refuses
 * the entry (and says why) when the window is not complete, when the signal it selected is not ODD,
 * when the trade definition does not offer the contract, or when the same signal already entered —
 * so the block never trades on an unqualified window. The program waits until the purchase is really
 * confirmed, exactly like the other entry blocks.
 */
window.Blockly.Blocks.eo_buy_odd = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Buy ODD'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Buys an Odd digit contract when the monitored window selects ODD. Refused, with the reason in the log, while the window is incomplete or the selected signal is EVEN; the program waits for Deriv to confirm the purchase.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Buy ODD'),
            description: localize('Enters an Odd digit contract when the Even/Odd window selects ODD.'),
            key_words: localize('even odd buy odd entry purchase digit contract evenodd'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_buy_odd = () => 'Bot.eoBuyOdd();\n';
