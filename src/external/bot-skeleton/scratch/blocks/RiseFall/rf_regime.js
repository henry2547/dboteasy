import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Market regime" — the classifier's own label for the market right now. */
window.Blockly.Blocks.rf_regime = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Market regime'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The regime id the classifier reports: strong_uptrend, weak_downtrend, sideways, volatility_expansion, possible_reversal, and so on. It is a description of the ticks, never a forecast.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Market regime'),
            description: localize('Reads the market-regime classifier’s current label.'),
            key_words: localize('regime trend sideways volatility expansion reversal'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_regime = () => [
    'Bot.rfRegime()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
