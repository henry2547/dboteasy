import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Top ranked market" — the symbol that came first in the last ranking, or an empty value. */
window.Blockly.Blocks.market_top_ranked = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Top ranked market symbol'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The API symbol of the market that came first in the last ranking, for example R_100. It is empty until a ranking has produced at least one measured market.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Top ranked market symbol'),
            description: localize(
                'Reads the symbol of the best-placed market of the last ranking, so a program can name it in a journal line or reuse it in a configuration field.'
            ),
            key_words: localize('market top ranked best symbol first place result'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_top_ranked = () => [
    'Bot.marketIntelligenceTopMarket()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
