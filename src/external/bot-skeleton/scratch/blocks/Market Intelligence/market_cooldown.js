import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Cool down market" — temporarily excludes a market from this bot's scanning after an event the
 * program chose (a loss, a switch, a session limit).
 *
 * A cooldown is refused when its reason describes a data-quality or account problem: those must be
 * reported, not hidden. The journal names the market, the reason and how long it is out.
 */
window.Blockly.Blocks.market_cooldown = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Cool down market %1 for %2 scan cycle(s)', {
                symbol: '%1',
                cycles: '%2',
            }),
            args0: [
                {
                    type: 'field_input',
                    name: 'SYMBOL',
                    text: '',
                },
                {
                    type: 'field_number',
                    name: 'CYCLES',
                    value: 1,
                    min: 0,
                    max: 1000,
                    precision: 0,
                },
            ],
            message1: localize('and %1 minute(s), reason %2', {
                minutes: '%1',
                reason: '%2',
            }),
            args1: [
                {
                    type: 'field_number',
                    name: 'MINUTES',
                    value: 0,
                    min: 0,
                    max: 1440,
                    precision: 0,
                },
                {
                    type: 'field_input',
                    name: 'REASON',
                    text: 'Cooling down after the configured event',
                },
            ],
            previousStatement: null,
            nextStatement: null,
            inputsInline: false,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Temporarily excludes a market from the market scan, for a number of scan cycles or a number of minutes (either can be 0, both may be set). The market keeps being reported in “Report excluded markets”, and a cooldown whose reason describes a data or account problem is refused so the problem stays visible. Leave the field empty for the market the bot is on.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Cool down market'),
            description: localize(
                'Keeps a market out of the scan for a while after a configured event, while it stays visible — with its reason — in the excluded-markets report.'
            ),
            key_words: localize('market cooldown exclude pause skip cycles minutes rest'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_cooldown = block => {
    const symbol = String(block.getFieldValue('SYMBOL') ?? '');
    const cycles = Number(block.getFieldValue('CYCLES')) || 0;
    const minutes = Number(block.getFieldValue('MINUTES')) || 0;
    const reason = String(block.getFieldValue('REASON') ?? '');

    if (!cycles && !minutes) {
        throw new Error(
            localize('A market cooldown needs a number of scan cycles or minutes greater than 0')
        );
    }

    return `Bot.marketIntelligenceCooldown({ symbol: ${JSON.stringify(symbol)}, cycles: ${cycles}, minutes: ${minutes}, reason: ${JSON.stringify(
        reason
    )} });\n`;
};
