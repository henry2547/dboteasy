import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator, sampleCode } from './digit-block';

/** The threshold socket, kept a whole percent so the default matches the Configure block. */
const thresholdArgs = () => [
    {
        type: 'input_value',
        name: 'PERCENT',
        check: 'Number',
    },
];

const readThreshold = block => {
    const generator = window.Blockly.JavaScript.javascriptGenerator;
    const threshold_block = block.getInputTargetBlock('PERCENT');

    if (threshold_block && threshold_block.type === 'math_number') {
        const value = Number(threshold_block.getFieldValue('NUM'));
        if (!Number.isFinite(value) || value <= 0 || value > 100) {
            throw new Error(localize('The percentage threshold must be greater than 0 and no more than 100'));
        }
    }

    return sampleCode(block, 'PERCENT', '65');
};

/**
 * "Even percentage ≥ threshold" — true only for a complete window whose measured even share reached
 * the threshold. An incomplete, stale or disconnected window is not ready, so the condition is false
 * and the connected body never runs.
 */
window.Blockly.Blocks.eo_even_meets = digitBlock({
    message: localize('Even percentage ≥ {{ percent }} %', { percent: '%1' }),
    args: thresholdArgs(),
    output: 'Boolean',
    tooltip: localize(
        'True when the monitored window is complete and its even percentage is at or above the threshold. False when it is below, and false while the window is incomplete, stale or disconnected.'
    ),
    displayName: localize('Even percentage meets threshold'),
    description: localize(
        'Compares the even share of the monitored ticks with the threshold you attach. Not ready means false — never a purchase.'
    ),
    keyWords: localize('even percentage threshold meets condition evenodd'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_even_meets = digitGenerator(block =>
    `Bot.eoEvenMeets(${readThreshold(block)})`
);

export { thresholdArgs, readThreshold };
