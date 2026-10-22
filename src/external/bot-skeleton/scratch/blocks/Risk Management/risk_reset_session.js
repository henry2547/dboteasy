import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Reset the risk session" — starts a fresh baseline (trades, streaks, peak, exposure). The limits
 * stay as they were. The statistics panel's Clear resets the same baseline.
 */
window.Blockly.Blocks.risk_reset_session = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Reset the risk session'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Clears this session’s risk numbers — trades, win/loss streak, peak profit and exposure — and keeps the limits you set. Clearing the statistics panel does the same.'
            ),
            category: window.Blockly.Categories.Risk_Management,
        };
    },
    meta() {
        return {
            display_name: localize('Reset risk session'),
            description: localize(
                'Starts the risk guard over from a clean baseline without changing its limits.'
            ),
            key_words: localize('risk reset clear session start over baseline'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.risk_reset_session = () => 'Bot.riskResetSession();\n';
