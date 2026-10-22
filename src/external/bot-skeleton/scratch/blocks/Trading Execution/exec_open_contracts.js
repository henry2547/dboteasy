import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Open contracts" — 1 while a contract is open, 0 when nothing is at risk. */
window.Blockly.Blocks.exec_open_contracts = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Contracts currently open'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How many contracts are still open right now, read from the contract the engine is holding. It is 0 when nothing is at risk, so a program can wait before buying again.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('Open contracts'),
            description: localize('How many contracts are still open right now.'),
            key_words: localize('open contract count exposure waiting execution'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_open_contracts = () => [
    'Bot.sessionOpenContracts()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
