import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Learning report" — one line per strategy with the numbers this run really recorded. */
window.Blockly.Blocks.learn_report = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Learning report'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'One line per strategy with settled trades: trades, wins/losses, hit rate and profit. A session that settled nothing says so instead of showing zeros.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Learning report'),
            description: localize(
                'Summarises every strategy’s real settled results so the run log shows which one actually performed.'
            ),
            key_words: localize('learning report summary strategies log performance'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_report = () => [
    'Bot.learnReport()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
