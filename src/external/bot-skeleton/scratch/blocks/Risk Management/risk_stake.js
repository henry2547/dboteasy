import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Stake for a percentage of the balance" — sizes the amount from the authorised balance and the
 * exposure limit, and answers 0 when it cannot be sized honestly instead of inventing an amount.
 */
window.Blockly.Blocks.risk_stake = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Stake for {{ percent }} % of the account balance', {
                percent: '%1',
            }),
            args0: [
                {
                    type: 'input_value',
                    name: 'RISK_PERCENT',
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
                'A stake sized from the balance of the authorised account: balance × percentage, rounded to cents and clamped by the exposure limit still available. It answers 0 when there is no balance or percentage to size from, so check for 0 before purchasing.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Stake for balance %'),
            description: localize(
                'Turns a percentage of the real account balance into a stake, never exceeding the exposure limit that is left.'
            ),
            key_words: localize('risk stake size position balance percent money amount'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_stake = block => {
    const percent =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'RISK_PERCENT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || '1';

    return [`Bot.riskStake(${percent})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
