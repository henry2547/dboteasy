import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';
import { readThreshold, thresholdArgs } from './eo_even_meets';

/**
 * "Odd percentage ≥ threshold" — the odd counterpart of the Even condition, read from the same
 * window and validated the same way.
 */
window.Blockly.Blocks.eo_odd_meets = digitBlock({
    message: localize('Odd percentage ≥ {{ percent }} %', { percent: '%1' }),
    args: thresholdArgs(),
    output: 'Boolean',
    tooltip: localize(
        'True when the monitored window is complete and its odd percentage is at or above the threshold. False when it is below, and false while the window is incomplete, stale or disconnected.'
    ),
    displayName: localize('Odd percentage meets threshold'),
    description: localize(
        'Compares the odd share of the monitored ticks with the threshold you attach. Not ready means false — never a purchase.'
    ),
    keyWords: localize('odd percentage threshold meets condition evenodd'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_odd_meets = digitGenerator(block =>
    `Bot.eoOddMeets(${readThreshold(block)})`
);
