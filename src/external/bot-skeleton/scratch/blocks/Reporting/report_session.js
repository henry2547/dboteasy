import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Session report" — one line describing what this run really did. */
window.Blockly.Blocks.report_session = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Session report'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'One line with the market, contracts taken, contracts settled, wins/losses, session profit and contracts still open. A run that bought nothing says so instead of showing zeros.'
            ),
            category: window.Blockly.Categories.Session_Reporting,
        };
    },
    meta() {
        return {
            display_name: localize('Session report'),
            description: localize('Summarises the run: trades taken and settled, wins, profit and open contracts.'),
            key_words: localize('report session summary log stats trades profit'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.report_session = () => [
    'Bot.sessionReport()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
