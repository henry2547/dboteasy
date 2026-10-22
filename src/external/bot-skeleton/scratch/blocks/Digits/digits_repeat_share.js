import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

window.Blockly.Blocks.digits_repeat_share = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Share (%) of ticks that repeated the previous digit in last {{ sample }} ticks', {
                sample: '%1',
            }),
            args0: [
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
                'How often a tick ended in the same digit as the tick before it, in percent. About 10% is the chance level.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit repeat share'),
            description: localize(
                'Measures how often the last digit repeated the previous tick, so a bot can tell a repeating market from an ordinary one.'
            ),
            key_words: localize('digit repeat same consecutive share percentage'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_repeat_share = block => {
    const sample =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'SAMPLE',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || '100';
    return [`Bot.getDigitRepeatShare(${sample})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
