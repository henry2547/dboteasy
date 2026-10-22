import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Report market readiness" — journals every readiness check of a market, pass or fail, so a
 * refusal can be diagnosed instead of guessed at.
 */
window.Blockly.Blocks.market_readiness_report = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Report readiness of market %1', {
                symbol: '%1',
            }),
            args0: [
                {
                    type: 'field_input',
                    name: 'SYMBOL',
                    text: '',
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Writes one journal line per readiness check — metadata, genuine tick history, live subscription, freshness, connection and contract compatibility — with the measured value behind each. Leave the field empty for the market the bot is on.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Report market readiness'),
            description: localize(
                'The diagnostic twin of “Market is ready”: it prints what was measured and what failed, which is what you need when a market is refused.'
            ),
            key_words: localize('market readiness report diagnose reason why not ready journal'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_readiness_report = block => {
    const symbol = String(block.getFieldValue('SYMBOL') ?? '');
    return `Bot.marketIntelligenceReadinessReport({ symbol: ${JSON.stringify(symbol)} });\n`;
};
