import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Last trade profit" — the profit the engine really booked for the last settled contract. */
window.Blockly.Blocks.exec_last_profit = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Profit of the last settled trade'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The profit the engine booked for the last settled contract (sell price − buy price). It is 0 before anything settles, and a losing contract answers a negative number.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('Last trade profit'),
            description: localize('The real profit or loss of the last settled contract.'),
            key_words: localize('trade profit last result pnl settled execution'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_last_profit = () => [
    'Bot.sessionLastProfit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
