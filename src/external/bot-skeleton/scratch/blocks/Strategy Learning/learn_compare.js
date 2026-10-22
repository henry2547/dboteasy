import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Strategy A beats strategy B" — a condition comparing two recorded hit rates. It fails closed:
 * when either strategy has too few settled trades the answer is false, never a guess.
 */
window.Blockly.Blocks.learn_compare = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Strategy %1 has a better hit rate than %2', {
                first: '%1',
                second: '%2',
            }),
            args0: [
                {
                    type: 'field_input',
                    name: 'FIRST',
                    text: localize('strategy 1'),
                },
                {
                    type: 'field_input',
                    name: 'SECOND',
                    text: localize('strategy 2'),
                },
            ],
            message1: localize('with at least %1 settled trades each', { min_sample: '%1' }),
            args1: [
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
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True only when the first strategy’s hit rate is strictly higher and both strategies have reached the minimum number of settled trades. Too little evidence answers false.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Compare strategies'),
            description: localize(
                'A condition that is true when one named strategy’s recorded hit rate beats another’s, both with enough settled trades.'
            ),
            key_words: localize('learning compare strategies better hit rate minimum sample'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_compare = block => {
    const first = String(block.getFieldValue('FIRST') ?? '');
    const second = String(block.getFieldValue('SECOND') ?? '');
    const min_sample = Number(block.getFieldValue('MIN_SAMPLE')) || 1;
    return [
        `Bot.learnCompare(${JSON.stringify(first)}, ${JSON.stringify(second)}, ${min_sample})`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
