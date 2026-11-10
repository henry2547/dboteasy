import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Best backtested strategy" — the top qualifying strategy from the walk-forward ranking. */
window.Blockly.Blocks.rf_best_strategy = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Best backtested strategy'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The strategy that ranked first in the last walk-forward ranking on the Rise/Fall tab, or an empty text when nothing qualified. Run the ranking there first — with nothing run the block answers empty instead of guessing.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Best backtested strategy'),
            description: localize('Reads the top qualifying strategy from the last walk-forward ranking.'),
            key_words: localize('best strategy backtest ranking walk forward'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_best_strategy = () => [
    'Bot.rfBestStrategy()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
