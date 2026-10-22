import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Hit rate of strategy" — wins as a percentage of that strategy's settled trades. */
window.Blockly.Blocks.learn_hit_rate = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Hit rate of strategy %1 (%)', { name: '%1' }),
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
                'Percentage of that strategy’s settled contracts that ended in profit. A strategy with no settled trades reports 0 — it is a measured result, not a prediction. Leave the name empty to read the strategy currently being learned.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Strategy hit rate'),
            description: localize(
                'Reports how often a named strategy won among the contracts this run really settled.'
            ),
            key_words: localize('learning hit rate win percentage strategy performance'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_hit_rate = block => {
    const name = String(block.getFieldValue('NAME') ?? '');
    return [`Bot.learnHitRate(${JSON.stringify(name)})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
