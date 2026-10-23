import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Allow one entry per signal" — stops a second purchase while the same qualifying signal is still
 * active.
 *
 * The signal is identified by market, window size, threshold, configured direction and the tick it
 * was read on, so a new tick is a new signal while the same tick is the same one. Nothing here is a
 * timer, and the entry stays blocked only while the identical signal is still current.
 */
window.Blockly.Blocks.eo_one_entry_per_signal = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Allow one entry per signal'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Refuses a second Even/Odd entry while the same signal is still active. The signal is identified by market, window, threshold, direction and the tick it came from — no time delay is involved.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Allow one entry per signal'),
            description: localize('Blocks a repeated entry while the same signal is still current.'),
            key_words: localize('even odd one entry per signal duplicate trigger evenodd'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_one_entry_per_signal = () => 'Bot.eoAllowOneEntry();\n';
