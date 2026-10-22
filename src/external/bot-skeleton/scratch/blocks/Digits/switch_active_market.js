import { localize } from '@deriv-com/translations';
import { MARKET_SCAN_STATES } from '../../../services/tradeEngine/utils/market-scan-states';
import { modifyContextMenu } from '../../utils';

/**
 * "Switch active market" — moves the bot to the next eligible volatility market.
 *
 * The block genuinely re-points the strategy: its generated code drives the trade engine's market
 * scan (`Bot.marketScanBegin/Next/Lock/Report`), which discovers the eligible markets, subscribes to
 * the selected market's own ticks, waits for its history and a genuine live tick, and only then lets
 * the program analyse it. The condition socket takes any of the existing digit blocks (over/under,
 * even/odd, matches/differs, frequency, …); while it is false the scan moves on to the next market,
 * up to the configured limit. Nothing is traded by this block — proposals, risk checks and the
 * Demo/Real protections stay in the trade engine.
 */
window.Blockly.Blocks.switch_active_market = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Switch active market, {{ order }} order, up to {{ limit }} markets', {
                order: '%1',
                limit: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'ORDER',
                    options: [
                        [localize('sequential'), 'sequential'],
                        [localize('round-robin'), 'round_robin'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'MAX_SWITCHES',
                    check: 'Number',
                },
            ],
            message1: localize('keep switching until %1'),
            args1: [
                {
                    type: 'input_value',
                    name: 'CONDITION',
                    check: 'Boolean',
                },
            ],
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            previousStatement: null,
            nextStatement: null,
            tooltip: localize(
                'Moves the bot to the next eligible volatility market and keeps searching while the entry condition you attach is false. The strategy is evaluated on the selected market’s own history and live ticks; 0 markets means every eligible market once.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Switch active market'),
            description: localize(
                'Scans the supported volatility markets and switches the bot to the next eligible one. Attach a digit condition to keep searching until it is met, or leave it empty to switch once and let your strategy decide.'
            ),
            key_words: localize('market symbol switch scan volatility next'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.switch_active_market = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const order = block.getFieldValue('ORDER');

    const limit_block = block.getInputTargetBlock('MAX_SWITCHES');
    if (limit_block && limit_block.type === 'math_number') {
        const limit_value = Number(limit_block.getFieldValue('NUM'));
        if (!Number.isFinite(limit_value) || limit_value < 0) {
            throw new Error(localize('Market switch limit must be a number, or 0 for every eligible market'));
        }
    }

    const limit = generator.valueToCode(block, 'MAX_SWITCHES', generator.ORDER_ATOMIC) || '0';
    const condition = generator.valueToCode(block, 'CONDITION', generator.ORDER_ATOMIC) || 'true';

    // The scan states come from the engine's own vocabulary, so the generated loop can only branch
    // on a state the engine really reports.
    const analyzing = JSON.stringify(MARKET_SCAN_STATES.ANALYZING);

    return `
        var BinaryBotPrivateMarketScan = Bot.marketScanBegin({ order: '${order}', max_switches: +(${limit}) });
        while (BinaryBotPrivateMarketScan && BinaryBotPrivateMarketScan.state === ${analyzing}) {
            if (${condition}) {
                Bot.marketScanLock();
                break;
            }
            BinaryBotPrivateMarketScan = Bot.marketScanNext();
        }
        if (BinaryBotPrivateMarketScan && BinaryBotPrivateMarketScan.state !== ${analyzing}) {
            Bot.marketScanReport(BinaryBotPrivateMarketScan);
        }
        `;
};
