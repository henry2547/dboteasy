import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Contracts taken" — how many contracts this session really bought. */
window.Blockly.Blocks.exec_session_trades = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Contracts taken this session'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How many contracts the engine bought in this run, including one that is still open. It counts purchases that really happened, not attempts.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('Contracts taken'),
            description: localize('Number of contracts this session has bought.'),
            key_words: localize('trades count contracts taken bought execution session'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_session_trades = () => [
    'Bot.sessionTradesTaken()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
