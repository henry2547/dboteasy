import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Market is in cooldown" — true while a cooldown this program set still excludes the market.
 * It never reports a data or account problem as a cooldown, because such a cooldown is refused.
 */
window.Blockly.Blocks.market_is_cooling = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Market %1 is in cooldown', {
                symbol: '%1',
            }),
            args0: [
                {
                    type: 'field_input',
                    name: 'SYMBOL',
                    text: '',
                },
            ],
            output: 'Condition',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True while that market is excluded by a cooldown — either its scan cycles are not used up or its minutes have not elapsed. The journal line names the reason and what is left. Leave the field empty for the market the bot is on.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Market is in cooldown'),
            description: localize(
                'A yes/no test for a market’s cooldown, so a program can wait, report it, or move to another market without guessing.'
            ),
            key_words: localize('market cooldown excluded is cooling waiting how long'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_is_cooling = block => {
    const symbol = String(block.getFieldValue('SYMBOL') ?? '');
    return [
        `Bot.marketIntelligenceIsCooling({ symbol: ${JSON.stringify(symbol)} })`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
