import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Settled trades learned" — how much evidence a strategy's numbers rest on. */
window.Blockly.Blocks.learn_sample_size = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Settled trades learned for strategy %1', { name: '%1' }),
            args0: [
                {
                    type: 'field_input',
                    name: 'NAME',
                    text: '',
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How many contracts this run has settled under that strategy name. Guard a decision with a minimum sample so a few trades cannot look meaningful. Leave the name empty to read the strategy currently being learned.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Learning sample size'),
            description: localize('Counts the settled contracts the learning numbers for a strategy are based on.'),
            key_words: localize('learning sample size count trades evidence'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_sample_size = block => {
    const name = String(block.getFieldValue('NAME') ?? '');
    return [`Bot.learnSampleSize(${JSON.stringify(name)})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
