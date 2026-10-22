import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Market is ready" — the Condition form of the readiness check.
 *
 * It fails closed: a missing tick, a stale feed, a dropped connection, a closed market or an
 * unverified contract list all return false, and the journal names the failing check.
 */
window.Blockly.Blocks.market_readiness = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Market %1 is ready for this strategy', {
                symbol: '%1',
            }),
            args0: [
                {
                    type: 'field_input',
                    name: 'SYMBOL',
                    text: '',
                },
            ],
            output: 'Condition',
            outputShape: window.Blockly.OUTPUT_SHAPE_HEXAGONAL,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'True only when the market has valid metadata, enough genuine tick history, a live tick subscription, a fresh tick, a connected feed and — when contract types are configured — a contract list that offers them. Leave the field empty to check the market the bot is on.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Market is ready'),
            description: localize(
                'A yes/no readiness gate for a market. Every failure is reported with the check that failed, so nothing is treated as “ready” because data was missing.'
            ),
            key_words: localize('market ready readiness data fresh history subscription connection contract'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_readiness = block => {
    const symbol = String(block.getFieldValue('SYMBOL') ?? '');
    return [
        `Bot.marketIntelligenceReadinessPassed({ symbol: ${JSON.stringify(symbol)} })`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
