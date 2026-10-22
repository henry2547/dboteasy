import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Report excluded markets" — journals every exclusion this session holds: the cooldowns the
 * program set (with their remaining cycles/minutes) and the quality or contract reasons the scan
 * recorded. The two lists stay apart, so a cooldown can never quietly replace a real error.
 */
window.Blockly.Blocks.market_excluded_report = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Report excluded markets'),
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Writes what is being left out right now: the markets in cooldown with why and how long they stay out, and separately the markets the scan skipped for data, availability or contract reasons.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Report excluded markets'),
            description: localize(
                'Shows which markets are currently out of the scan and why, so a cooldown can be inspected rather than taken on trust.'
            ),
            key_words: localize('market excluded cooldown list reason inspect skipped report'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_excluded_report = () =>
    'Bot.marketIntelligenceExcludedReport();\n';
