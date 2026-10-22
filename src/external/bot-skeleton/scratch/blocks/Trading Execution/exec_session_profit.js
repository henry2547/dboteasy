import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Session profit" — everything this session's settled contracts made, added up. */
window.Blockly.Blocks.exec_session_profit = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Profit of this session'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The running total of the profits and losses this session really settled. It starts at 0 for every new run and is not the account balance.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('Session profit'),
            description: localize('Total profit or loss of the contracts settled in this run.'),
            key_words: localize('session profit total pnl running sum execution'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_session_profit = () => [
    'Bot.sessionProfit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
