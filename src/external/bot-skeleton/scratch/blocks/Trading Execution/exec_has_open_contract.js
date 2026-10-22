import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "A contract is open" — the condition form, for gating a second purchase. */
window.Blockly.Blocks.exec_has_open_contract = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('A contract is open'),
            output: 'Condition',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True while the engine is still holding a contract that has not settled. Use it to wait before buying again instead of stacking trades on the same market.'
            ),
            category: window.Blockly.Categories.Trading_Execution,
        };
    },
    meta() {
        return {
            display_name: localize('A contract is open'),
            description: localize('True while a contract is still open and unsettled.'),
            key_words: localize('open contract condition busy waiting execution'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.exec_has_open_contract = () => [
    'Bot.sessionHasOpenContract()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
