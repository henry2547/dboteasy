import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Exposed stake" — what the engine paid for contracts that have not settled yet. */
window.Blockly.Blocks.risk_exposure = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Stake currently exposed'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The total stake the bot paid for contracts that are still open. It drops back as each contract settles.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Stake exposed'),
            description: localize(
                'Shows the stake tied up in open contracts, so a program can cap how much is at risk at once.'
            ),
            key_words: localize('risk exposure open stake at risk concurrent'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_exposure = () => [
    'Bot.riskExposure()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
