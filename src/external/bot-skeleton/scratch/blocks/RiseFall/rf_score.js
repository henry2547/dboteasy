import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Rise/Fall score of side" — the 0..100 filter strength of the Rise or the Fall case. */
window.Blockly.Blocks.rf_score = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Rise/Fall score of %1'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'SIDE',
                    options: [
                        [localize('Rise'), 'rise'],
                        [localize('Fall'), 'fall'],
                    ],
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How strongly the selected strategy’s components support that side, 0–100. It is a filter strength, not a probability of winning.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Rise/Fall score'),
            description: localize('Reads the 0–100 strength of the Rise or Fall case.'),
            key_words: localize('rise fall score strength filter'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_score = block => {
    const side = block.getFieldValue('SIDE') === 'fall' ? 'fall' : 'rise';
    return [`Bot.rfScore(${JSON.stringify(side)})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
