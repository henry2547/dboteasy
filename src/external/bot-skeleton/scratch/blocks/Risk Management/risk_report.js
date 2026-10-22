import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Risk session report" — one line with every measured risk number of this session. */
window.Blockly.Blocks.risk_report = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Risk session report'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'One line describing the session: settled trades, wins/losses, profit, profit given back, stake exposed, and whether the guard allows trading.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Risk session report'),
            description: localize(
                'Summarises the session’s measured risk numbers so the run log shows why a bot kept going or stopped.'
            ),
            key_words: localize('risk report summary session log stats'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_report = () => [
    'Bot.riskReport()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
