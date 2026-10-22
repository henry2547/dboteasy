import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';
import { digitOptions } from './digit-options';

/**
 * The share gate two low digits have to pass together — for example digit 0 *and* digit 1 both
 * under 10.3% of the window. Strictly below: a digit sitting exactly on the threshold fails, and an
 * empty window fails too instead of reporting a share nobody measured.
 */
window.Blockly.Blocks.digits_shares_below = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize(
                'Digits {{ first }} and {{ second }} are both below {{ percent }} % in last {{ sample }} ticks',
                { first: '%1', second: '%2', percent: '%3', sample: '%4' }
            ),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'FIRST',
                    options: digitOptions(),
                },
                {
                    type: 'field_dropdown',
                    name: 'SECOND',
                    options: digitOptions(),
                },
                {
                    type: 'input_value',
                    name: 'PERCENT',
                    check: 'Number',
                },
                {
                    type: 'input_value',
                    name: 'SAMPLE',
                    check: 'Number',
                },
            ],
            inputsInline: true,
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('True when both digits took less than the percentage you set of the recent ticks'),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Two digits below a share'),
            description: localize(
                'Checks two digits against one percentage at once, which is how the Over 1 setup is gated: digit 0 and digit 1 both below 10.3% of the analysis window. Both digits must be strictly below the threshold; with no ticks loaded it answers false.'
            ),
            key_words: localize('digit frequency share percentage below two digits window'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_shares_below = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const first = block.getFieldValue('FIRST');
    const second = block.getFieldValue('SECOND');
    const percent = generator.valueToCode(block, 'PERCENT', generator.ORDER_ATOMIC) || '10.3';
    const sample = generator.valueToCode(block, 'SAMPLE', generator.ORDER_ATOMIC) || '1000';
    const code = `Bot.areDigitSharesBelow([${first}, ${second}], ${percent}, ${sample})`;
    return [code, generator.ORDER_ATOMIC];
};
