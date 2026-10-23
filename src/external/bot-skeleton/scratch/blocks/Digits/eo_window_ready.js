import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

/**
 * "Even/Odd window ready" — true only when the monitored window holds its full count of genuine
 * ticks on a live connection. It is the "wait until the analysis window is ready" condition of an
 * Even/Odd strategy.
 */
window.Blockly.Blocks.eo_window_ready = digitBlock({
    message: localize('Even/Odd window ready'),
    output: 'Boolean',
    tooltip: localize(
        'True only when the monitored window holds its full count of genuine ticks and the feed is connected. While it is false the parity conditions cannot signal, so nothing is bought.'
    ),
    displayName: localize('Even/Odd window ready'),
    description: localize('True when the monitored tick window is complete and the feed is live.'),
    keyWords: localize('even odd window ready complete ticks analysis evenodd'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_window_ready = digitGenerator(() =>
    'Bot.eoWindowReady()'
);
