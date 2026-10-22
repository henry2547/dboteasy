import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

/**
 * "Rank eligible markets" — orders the discovered pool by one measurable criterion and journals
 * the basis of every position. A market without a measurement is reported as not ranked instead of
 * being given a score.
 */
window.Blockly.Blocks.market_rank = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Rank eligible markets by %1', {
                rank_criterion: '%1',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'CRITERION',
                    options: [
                        [localize('readiness checks passed'), 'readiness'],
                        [localize('genuine ticks available'), 'tick_sample'],
                        [localize('entry condition met'), 'entry'],
                        [localize('digit-share steadiness'), 'frequency_stability'],
                        [localize('observed outcomes (history, needs a large sample)'), 'observed_outcomes'],
                    ],
                },
            ],
            message1: localize('requiring at least %1 completed observations', {
                min_sample: '%1',
            }),
            args1: [
                {
                    type: 'input_value',
                    name: 'MIN_SAMPLE',
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
                'Ranks the discovered markets by a measurement this session really recorded — readiness checks, ticks observed, entry condition result, digit-share spread, or the outcome rate of completed virtual observations. Every position is journalled with its basis. The observed-outcomes criterion is refused below the minimum sample you set, and a ranking never predicts the next tick.'
            ),
            category: window.Blockly.Categories.Market_Intelligence,
        };
    },
    meta() {
        return {
            display_name: localize('Rank eligible markets'),
            description: localize(
                'Puts the discovered markets in order on one stated measurement and writes the reason for each position, so a ranking can always be checked against its evidence.'
            ),
            key_words: localize('market rank ranking order best market score compare reasons evidence'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.market_rank = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const criterion = block.getFieldValue('CRITERION');
    const min_sample = generator.valueToCode(block, 'MIN_SAMPLE', generator.ORDER_ATOMIC) || '30';

    const sample_block = block.getInputTargetBlock('MIN_SAMPLE');
    if (sample_block && sample_block.type === 'math_number') {
        const sample = Number(sample_block.getFieldValue('NUM'));
        if (!Number.isFinite(sample) || sample < 1) {
            throw new Error(localize('The minimum sample for a ranking must be a whole number of at least 1'));
        }
    }

    return `Bot.marketIntelligenceRank({ criterion: '${criterion}', min_sample: +(${min_sample}) });\n`;
};
