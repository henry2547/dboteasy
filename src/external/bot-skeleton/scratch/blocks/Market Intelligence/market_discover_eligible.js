import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Find eligible markets" — asks the app's own market-discovery service for the markets this run
 * may trade and filters them by supported market category, availability, and (optionally) the
 * contract types the bot is configured to trade. Genuine discovery only: no symbol is ever
 * hardcoded and a failure is reported with its reason.
 */
window.Blockly.Blocks.market_discover_eligible = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Find eligible markets in {{ category }}', {
                category: '%1',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'CATEGORY',
                    options: [
                        [localize('all supported volatility markets'), 'all'],
                        [localize('Volatility Indices'), 'Volatility Indices'],
                        [localize('Volatility 1-Second Indices'), '1-Second Volatility Indices'],
                    ],
                },
            ],
            // Blockly numbers the placeholders of each message against that message's own `argsN`
            // array, so this row starts at %1 again (same as the switch-market block).
            message1: localize('verify contract compatibility {{ verify }}, and require {{ history }} tick(s)', {
                verify: '%1',
                history: '%2',
            }),
            args1: [
                {
                    type: 'field_dropdown',
                    name: 'VERIFY',
                    options: [
                        [localize('no'), 'no'],
                        [localize('yes'), 'yes'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'MIN_HISTORY',
                    check: 'Number',
                },
            ],
            previousStatement: null,
            nextStatement: null,
            inputsInline: false,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Discovers the eligible volatility markets from the app’s market list and reports how many it found. With contract verification on, each market is also checked against the API’s contract list for the contract types this bot trades. Nothing is traded and no market is switched by this block.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Find eligible markets'),
            description: localize(
                'Builds the pool of markets that may be scanned: supported volatility families, open right now, and optionally offering the configured contract types. The pool is the basis of every readiness check and ranking that follows.'
            ),
            key_words: localize('market discover eligible pool symbols volatility filter scan'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_discover_eligible = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const category = block.getFieldValue('CATEGORY');
    const verify_contracts = block.getFieldValue('VERIFY') === 'yes';
    const min_history = generator.valueToCode(block, 'MIN_HISTORY', generator.ORDER_ATOMIC) || '20';

    return `Bot.marketIntelligenceDiscover({ category: '${category}', verify_contracts: ${
        verify_contracts ? 'true' : 'false'
    }, min_history: +(${min_history}) });\n`;
};
