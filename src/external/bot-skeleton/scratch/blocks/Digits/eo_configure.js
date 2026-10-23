import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Configure Even/Odd strategy" — the one place the Even/Odd blocks read their settings from.
 *
 * It carries the analysis window, the percentage threshold and the signal direction. Market, stake
 * and duration stay where they already live (the trade definition block), so this never becomes a
 * second trade-settings system: the block only describes the strategy. The values are stored in the
 * Even/Odd runtime, which every other Even/Odd block reads, and they travel with a saved workspace
 * like any other block field.
 */
window.Blockly.Blocks.eo_configure = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Configure Even/Odd · window {{ ticks }} ticks · threshold {{ percent }} % · signal {{ direction }}', {
                ticks: '%1',
                percent: '%2',
                direction: '%3',
            }),
            args0: [
                {
                    type: 'field_number',
                    name: 'TICKS',
                    value: 20,
                    min: 1,
                    max: 1000,
                    precision: 0,
                },
                {
                    type: 'field_number',
                    name: 'PERCENT',
                    value: 65,
                    min: 1,
                    max: 100,
                    precision: 0,
                },
                {
                    type: 'field_dropdown',
                    name: 'DIRECTION',
                    options: [
                        [localize('EVEN'), 'even'],
                        [localize('ODD'), 'odd'],
                        [localize('BOTH'), 'both'],
                    ],
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Sets the Even/Odd strategy the other Even/Odd blocks read: how many genuine ticks the window holds, the percentage a parity must reach, and which direction may buy. Market, stake and duration stay in the trade definition block.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Configure Even/Odd strategy'),
            description: localize(
                'Window size, percentage threshold and signal direction for the Even/Odd blocks. Stored in the strategy and kept with the saved workspace.'
            ),
            key_words: localize('even odd configure settings window threshold ticks direction strategy'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_configure = block => {
    const ticks = Number(block.getFieldValue('TICKS'));
    const percent = Number(block.getFieldValue('PERCENT'));
    const direction = block.getFieldValue('DIRECTION');

    return `Bot.eoConfigure({ ticks: ${Number.isFinite(ticks) ? ticks : 0}, percent: ${
        Number.isFinite(percent) ? percent : 0
    }, direction: ${JSON.stringify(direction)} });\n`;
};
