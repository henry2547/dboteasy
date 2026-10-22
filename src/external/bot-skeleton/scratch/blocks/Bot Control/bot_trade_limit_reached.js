import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Trade limit reached" — a session cap on how many contracts the bot takes. */
window.Blockly.Blocks.bot_trade_limit_reached = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Trades taken this session reached %1', { limit: '%1' }),
            args0: [
                {
                    type: 'input_value',
                    name: 'LIMIT',
                    check: 'Number',
                },
            ],
            inputsInline: true,
            output: 'Condition',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True once this run has bought the given number of contracts. A limit of 0 or less is not set, so it never stops a session. It counts contracts really bought, not proposals.'
            ),
            category: window.Blockly.Categories.Bot_Control,
        };
    },
    meta() {
        return {
            display_name: localize('Trade limit reached'),
            description: localize('True once the session has taken the chosen number of contracts.'),
            key_words: localize('limit max trades count stop control session cap'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.bot_trade_limit_reached = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const limit = generator.valueToCode(block, 'LIMIT', generator.ORDER_ATOMIC) || '0';
    return [`Bot.sessionTradeLimitReached(${limit})`, generator.ORDER_ATOMIC];
};
