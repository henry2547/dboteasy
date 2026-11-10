import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Rise/Fall session stat" — one number the engine's own journal recorded. */
window.Blockly.Blocks.rf_stat = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Rise/Fall %1'),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'STAT',
                    options: [
                        [localize('trades taken'), 'trades'],
                        [localize('wins'), 'wins'],
                        [localize('losses'), 'losses'],
                        [localize('net profit'), 'net'],
                        [localize('open contracts'), 'open'],
                    ],
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'The active mode’s own journal only — a Virtual number is never shown as Demo or Real. Virtual profit is an ESTIMATE at a stated payout.'
            ),
            category: window.Blockly.Categories.Rise_Fall,
        };
    },
    meta() {
        return {
            display_name: localize('Rise/Fall session stat'),
            description: localize('Reads trades, wins, losses, net profit or open contracts for the active mode.'),
            key_words: localize('rise fall stats trades wins losses profit open contracts'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rf_stat = block => {
    const stat = String(block.getFieldValue('STAT') ?? 'trades');
    return [`Bot.rfStat(${JSON.stringify(stat)})`, window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC];
};
