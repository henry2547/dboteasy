import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Read eligible market count" — how many markets the last discovery accepted. */
window.Blockly.Blocks.market_eligible_count = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Eligible market count'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How many markets the last “Find eligible markets” run accepted, as a whole number. It reports 0 until a discovery has run, which is an empty pool rather than a market failure.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Eligible market count'),
            description: localize(
                'Reads the size of the discovered market pool, so a program can require a minimum number of markets before scanning them.'
            ),
            key_words: localize('market count eligible pool size how many symbols'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_eligible_count = () => [
    'Bot.marketIntelligenceEligibleCount()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
