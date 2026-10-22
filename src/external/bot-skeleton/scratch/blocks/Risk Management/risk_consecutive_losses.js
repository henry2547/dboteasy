import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Consecutive losses" — settled contracts since the last winning one. */
window.Blockly.Blocks.risk_consecutive_losses = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Consecutive losses this session'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How many settled contracts in a row lost money. It resets to 0 as soon as a contract settles with a profit.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Consecutive losses'),
            description: localize(
                'Counts the settled contracts that lost since the last win, so the program can stop after a losing run.'
            ),
            key_words: localize('risk consecutive losses streak losing run'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_consecutive_losses = () => [
    'Bot.riskConsecutiveLosses()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
