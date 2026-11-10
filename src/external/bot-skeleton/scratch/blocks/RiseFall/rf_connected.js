import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Rise/Fall engine connected" — true only while the Rise/Fall tab's engine is mounted. */
window.Blockly.Blocks.rf_connected = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Rise/Fall engine is connected'),
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True while the Rise/Fall tab is open, so its engine can answer. With the tab closed every Rise/Fall block answers neutral and an entry is refused with the reason.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Rise/Fall connected'),
            description: localize('Checks whether the Rise/Fall engine is open before reading it.'),
            key_words: localize('rise fall engine connected ready'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_connected = () => [
    'Bot.rfConnected()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
