import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Enter through the Rise/Fall engine" — a statement, not a purchase.
 *
 * The block does not buy anything itself: it asks the central executor for an
 * entry, so the engine state, the signal, the duplicate guard, the feed
 * integrity, the risk limits and the account verification all still decide.
 */
window.Blockly.Blocks.rf_enter = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Enter through Rise/Fall engine · stake %1 · duration %2 ticks'),
            args0: [
                {
                    type: 'input_value',
                    name: 'STAKE',
                    check: 'Number',
                },
                {
                    type: 'input_value',
                    name: 'DURATION',
                    check: 'Number',
                },
            ],
            inputsInline: true,
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Asks the Rise/Fall engine for an entry on its selected strategy. The engine’s own checks decide: a stopped engine, a NO TRADE signal, a stale feed, a risk limit or an unverified account all refuse it, and the reason is written to the journal.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Enter through Rise/Fall engine'),
            description: localize('Requests one entry from the Rise/Fall engine — every engine check still applies.'),
            key_words: localize('rise fall enter trade engine stake duration'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_enter = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const stake = generator.valueToCode(block, 'STAKE', generator.ORDER_ATOMIC) || '0';
    const duration = generator.valueToCode(block, 'DURATION', generator.ORDER_ATOMIC) || '5';
    return `Bot.rfEnter(${stake}, ${duration});\n`;
};
