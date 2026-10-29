import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

window.Blockly.Blocks.digits_parity_run = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Last {{ count }} digits are all {{ parity }}', {
                count: '%1',
                parity: '%2',
            }),
            args0: [
                {
                    type: 'field_number',
                    name: 'COUNT',
                    value: 2,
                    min: 2,
                    max: 20,
                    precision: 1,
                },
                {
                    type: 'field_dropdown',
                    name: 'PARITY',
                    options: [
                        [localize('Even'), 'even'],
                        [localize('Odd'), 'odd'],
                    ],
                },
            ],
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True when the newest digits are all even (0, 2, 4, 6, 8) or all odd (1, 3, 5, 7, 9). Two is the digit-pair rule: both even, or both odd.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Digit parity run'),
            description: localize(
                'Checks the newest digits as a run of one parity. “Last 2 digits are all even” is the pair rule used to buy Odd, and “all odd” to buy Even.'
            ),
            key_words: localize('digit last even odd pair run consecutive parity'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_parity_run = block => {
    const count = block.getFieldValue('COUNT');
    const parity = block.getFieldValue('PARITY');
    const code = `Bot.isDigitParityRun('${parity}', ${count})`;
    return [code, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
