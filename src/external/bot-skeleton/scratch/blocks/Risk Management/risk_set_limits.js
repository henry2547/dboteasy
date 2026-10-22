import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Set risk limits" — the only place the guard gets numbers. 0 turns a limit off, so an untouched
 * block (or no block at all) leaves the bot free to trade.
 */
window.Blockly.Blocks.risk_set_limits = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Set risk limits: stop after {{ losses }} consecutive loss(es)', {
                losses: '%1',
            }),
            args0: [
                {
                    type: 'field_number',
                    name: 'MAX_LOSSES',
                    value: 3,
                    min: 0,
                    max: 1000,
                    // Blockly's precision is a rounding step: 1 keeps whole losses.
                    precision: 1,
                },
            ],
            message1: localize('stop at {{ give_back }} given back from peak profit', {
                give_back: '%1',
            }),
            args1: [
                {
                    type: 'field_number',
                    name: 'MAX_GIVE_BACK',
                    value: 0,
                    min: 0,
                    // 0 disables rounding, so any amount the account can show is accepted.
                    precision: 0,
                },
            ],
            message2: localize('limit open stake to {{ exposure }}', {
                exposure: '%1',
            }),
            args2: [
                {
                    type: 'field_number',
                    name: 'MAX_EXPOSURE',
                    value: 0,
                    min: 0,
                    precision: 0,
                },
            ],
            message3: localize('and size each stake at {{ percent }} % of the balance', {
                percent: '%1',
            }),
            args3: [
                {
                    type: 'field_number',
                    name: 'RISK_PERCENT',
                    value: 1,
                    min: 0,
                    max: 100,
                    precision: 0,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            inputsInline: false,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Configures the risk guard from this point on: a losing streak, profit given back from the session peak, and the open stake. A value of 0 turns that limit off. The limits are journalled when they are set, and the guard journals the moment one is breached.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Set risk limits'),
            description: localize(
                'Sets the losing-streak, give-back, exposure and stake-size limits the risk guard enforces. 0 disables a limit.'
            ),
            key_words: localize('risk limits set stop loss streak drawdown exposure percent'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_set_limits = block => {
    const number = name => Number(block.getFieldValue(name)) || 0;

    return `Bot.riskSetLimits({ max_consecutive_losses: ${number('MAX_LOSSES')}, max_give_back: ${number(
        'MAX_GIVE_BACK'
    )}, max_exposure: ${number('MAX_EXPOSURE')}, risk_per_trade_percent: ${number('RISK_PERCENT')} });\n`;
};
