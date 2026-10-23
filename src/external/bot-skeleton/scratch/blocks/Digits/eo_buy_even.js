import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Buy EVEN" — the entry the Even/Odd strategy takes when its window selects EVEN.
 *
 * The purchase goes through the engine's own purchase path, so the session's risk limits, the trade
 * definition's stake and duration and Deriv's own confirmation all still apply. The engine refuses
 * the entry (and says why) when the window is not complete, when the signal it selected is not EVEN,
 * when the trade definition does not offer the contract, or when the same signal already entered —
 * so the block never trades on an unqualified window. The program waits until the purchase is really
 * confirmed, exactly like the other entry blocks.
 */
window.Blockly.Blocks.eo_buy_even = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Buy EVEN'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Buys an Even digit contract when the monitored window selects EVEN. Refused, with the reason in the log, while the window is incomplete or the selected signal is ODD; the program waits for Deriv to confirm the purchase.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Buy EVEN'),
            description: localize('Enters an Even digit contract when the Even/Odd window selects EVEN.'),
            key_words: localize('even odd buy even entry purchase digit contract evenodd'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_buy_even = () => 'Bot.eoBuyEven();\n';
