import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

/**
 * "Odd percentage" — (odd last digits / valid digits) × 100 over the monitored window.
 *
 * It reads exactly the same window as the "Even percentage" block, so the two always describe one
 * set of ticks.
 */
window.Blockly.Blocks.eo_odd_percentage = digitBlock({
    message: localize('Odd percentage'),
    output: 'Number',
    tooltip: localize(
        'Percentage of the monitored window whose last digit is odd: (odd last digits / valid digits) × 100.'
    ),
    displayName: localize('Odd percentage'),
    description: localize(
        'Odd share of the monitored ticks: 1, 3, 5, 7 and 9 count as odd. 0 while the window has no valid digits.'
    ),
    keyWords: localize('odd percentage share parity window evenodd'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_odd_percentage = digitGenerator(
    () => 'Bot.eoOddPercent()'
);
