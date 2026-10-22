import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/** "Current streak" — how many wins or losses in a row the strategy is on. */
window.Blockly.Blocks.learn_streak = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Current %1 streak of strategy %2', {
                kind: '%1',
                name: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'KIND',
                    options: [
                        [localize('winning'), 'wins'],
                        [localize('losing'), 'losses'],
                    ],
                },
                {
                    type: 'field_input',
                    name: 'NAME',
                    text: '',
                },
            ],
            inputsInline: true,
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize(
                'Length of the strategy’s current run of wins (or losses). It reports 0 for a kind that is not currently running, so a losing bot never reads a win streak. Leave the name empty to read the strategy currently being learned.'
            ),
            category: window.Blockly.Categories.Strategy_Learning,
        };
    },
    meta() {
        return {
            display_name: localize('Strategy streak'),
            description: localize('Reports how many wins or losses in a row a named strategy is currently on.'),
            key_words: localize('learning streak consecutive wins losses run'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.learn_streak = block => {
    const kind = block.getFieldValue('KIND');
    const name = String(block.getFieldValue('NAME') ?? '');
    return [
        `Bot.learnStreak(${JSON.stringify(name)}, ${JSON.stringify(kind)})`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
    ];
};
