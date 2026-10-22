import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Best strategy" — the name of the strategy that did best among those with enough settled trades.
 * It answers an empty text when no strategy reached the sample, so a tiny sample is never "best".
 */
window.Blockly.Blocks.learn_best_strategy = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Best strategy by %1 with at least %2 settled trades', {
                criterion: '%1',
                min_sample: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'CRITERION',
                    options: [
                        [localize('hit rate'), 'hit_rate'],
                        [localize('profit'), 'profit'],
                    ],
                },
                {
                    type: 'field_number',
                    name: 'MIN_SAMPLE',
                    value: 10,
                    min: 1,
                    max: 100000,
                    precision: 1,
                },
            ],
            inputsInline: true,
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The name of the best-performing strategy, or an empty text when no strategy has reached the minimum number of settled trades. A tie goes to the strategy with more trades.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Best strategy'),
            description: localize(
                'Names the strategy with the best hit rate or profit among those that reached a minimum sample of settled trades.'
            ),
            key_words: localize('learning best strategy compare ranking hit rate profit minimum sample'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_best_strategy = block => {
    const criterion = block.getFieldValue('CRITERION');
    const min_sample = Number(block.getFieldValue('MIN_SAMPLE')) || 1;
    return [
        `Bot.learnBestStrategy(${JSON.stringify(criterion)}, ${min_sample})`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
