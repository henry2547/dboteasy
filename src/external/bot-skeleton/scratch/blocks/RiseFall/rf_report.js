import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Rise/Fall report" — every strategy's current reading plus the backtest ranking. */
window.Blockly.Blocks.rf_report = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Rise/Fall report'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'A multi-line report: the active mode, one line per strategy, and the walk-forward ranking when it has been run. Feed it to a Reporting block to write it to the journal.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Rise/Fall report'),
            description: localize('Summarises every strategy’s reading and the backtest ranking.'),
            key_words: localize('rise fall report summary strategies backtest journal'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_report = () => [
    'Bot.rfReport()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
