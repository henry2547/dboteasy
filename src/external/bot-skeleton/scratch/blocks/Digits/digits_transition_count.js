import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

window.Blockly.Blocks.digits_transition_count = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Times digit {{ from }} was followed by {{ to }} in last {{ sample }} ticks', {
                from: '%1',
                to: '%2',
                sample: '%3',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'FROM_DIGIT',
                    options: digitOptions(),
                },
                {
                    type: 'field_dropdown',
                    name: 'TO_DIGIT',
                    options: digitOptions(),
                },
                {
                    type: 'input_value',
                    name: 'SAMPLE',
                    check: 'Number',
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'How often the first digit was immediately followed by the second one, by the very next tick, inside the sample.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit transition count'),
            description: localize(
                'Counts how often one digit followed another on the next tick, so a bot can act on a pattern the sample actually repeated instead of a guess.'
            ),
            key_words: localize('digit transition pair sequence followed next pattern'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_transition_count = block => {
    const from_digit = block.getFieldValue('FROM_DIGIT');
    const to_digit = block.getFieldValue('TO_DIGIT');
    const sample =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'SAMPLE',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || '100';
    return [
        `Bot.getDigitTransitionCount(${from_digit}, ${to_digit}, ${sample})`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
