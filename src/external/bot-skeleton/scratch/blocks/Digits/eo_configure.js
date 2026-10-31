import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Configure Even/Odd strategy" — the one place the Even/Odd blocks read their settings from.
 *
 * It carries the signal rule, the analysis window, the percentage threshold, the parity run and the
 * signal direction. Market, stake and duration stay where they already live (the trade definition
 * block), so this never becomes a second trade-settings system: the block only describes the
 * strategy. The values are stored in the Even/Odd runtime, which every other Even/Odd block reads,
 * and they travel with a saved workspace like any other block field.
 *
 * Two rules exist. `threshold` reads the parity share of the whole window and buys the parity that
 * reached the percentage. `reversal` reads a run of same-parity digits and buys the opposite
 * parity — the last N digits all even → ODD, all odd → EVEN, a mixed run is no entry — which is why
 * the window and the percentage only apply to the first rule.
 */
window.Blockly.Blocks.eo_configure = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Configure Even/Odd · rule {{ rule }} · signal {{ direction }}', {
                rule: '%1',
                direction: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'RULE',
                    options: [
                        [localize('Threshold'), 'threshold'],
                        [localize('Reversal of the last N digits'), 'reversal'],
                    ],
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
            message1: localize('window {{ ticks }} ticks · threshold {{ percent }} % · last {{ run }} digits', {
                ticks: '%1',
                percent: '%2',
                run: '%3',
            }),
            args1: [
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
                    type: 'field_number',
                    name: 'RUN',
                    value: 2,
                    min: 2,
                    max: 100,
                    precision: 0,
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Sets the Even/Odd strategy the other Even/Odd blocks read: Threshold buys the parity that reached the percentage over the window, Reversal buys the opposite of a run of the last N digits (all even → ODD, all odd → EVEN, a mixed run is no entry). Also sets which direction may buy. Market, stake and duration stay in the trade definition block.'
            ),
            category: window.Blockly.Categories.Digits,
        };
    },
    meta() {
        return {
            display_name: localize('Configure Even/Odd strategy'),
            description: localize(
                'Signal rule (threshold or last-N-digits reversal), window size, percentage threshold, parity run and signal direction for the Even/Odd blocks. Stored in the strategy and kept with the saved workspace.'
            ),
            key_words: localize('even odd configure settings window threshold ticks direction strategy rule reversal run digits'),
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
    const rule = block.getFieldValue('RULE');
    const run = Number(block.getFieldValue('RUN'));

    return `Bot.eoConfigure({ ticks: ${Number.isFinite(ticks) ? ticks : 0}, percent: ${
        Number.isFinite(percent) ? percent : 0
    }, direction: ${JSON.stringify(direction)}, rule: ${JSON.stringify(rule)}, run: ${
        Number.isInteger(run) ? run : 2
    } });\n`;
};
