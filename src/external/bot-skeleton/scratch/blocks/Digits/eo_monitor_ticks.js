import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const MAX_TICKS = 1000;

/**
 * "Monitor last N valid ticks" — arms the rolling window the Even/Odd blocks analyse.
 *
 * The window is filled from the engine's own tick subscription (one genuine tick at a time, in
 * arrival order). A repeated or out-of-order tick, a market change or a closed connection
 * invalidates it, and the analysis is not ready until the full window has been collected again.
 * With no number connected, the window is the one "Configure Even/Odd strategy" carries.
 */
window.Blockly.Blocks.eo_monitor_ticks = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Monitor last {{ ticks }} valid ticks', { ticks: '%1' }),
            args0: [
                {
                    type: 'input_value',
                    name: 'TICKS',
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
                'Starts the rolling window: only genuine ticks of the subscribed market are collected, in order, and the analysis stays "not ready" until the window is full. Leave the number empty to use the window the Configure block carries.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Monitor last N valid ticks'),
            description: localize('Collects the last N genuine ticks the strategy analyses.'),
            key_words: localize('even odd monitor ticks window valid rolling last'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_monitor_ticks = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const ticks_block = block.getInputTargetBlock('TICKS');

    if (!ticks_block) {
        // No number connected: the configured window is used, so there is one source of truth.
        return 'Bot.eoMonitor(null);\n';
    }

    if (ticks_block.type === 'math_number') {
        const value = Number(ticks_block.getFieldValue('NUM'));
        if (!Number.isInteger(value) || value < 1 || value > MAX_TICKS) {
            throw new Error(
                localize('Ticks to monitor must be a whole number between 1 and {{ max }}', { max: MAX_TICKS })
            );
        }
    }

    const ticks = generator.valueToCode(block, 'TICKS', generator.ORDER_ATOMIC) || 'null';
    return `Bot.eoMonitor(${ticks});\n`;
};
