import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Risk guard allows a new trade" — true only while no configured risk limit is breached.
 * An untouched guard (no limits set) allows trading, so existing bots are unaffected.
 */
window.Blockly.Blocks.risk_can_trade = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Risk guard allows a new trade'),
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True while none of the risk limits you set is breached. Check it before a purchase so a broken streak, a given-back profit or an already exposed stake stops the bot instead of the next trade.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Risk guard allows trade'),
            description: localize(
                'Answers true while every risk limit you configured still holds, so a purchase can be wrapped in one condition.'
            ),
            key_words: localize('risk guard allow block stop safe limits condition'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_can_trade = () => [
    'Bot.riskCanTrade()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
