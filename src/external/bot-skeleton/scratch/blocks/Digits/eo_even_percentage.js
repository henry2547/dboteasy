import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

/**
 * "Even percentage" — (even last digits / valid digits) × 100 over the monitored window.
 *
 * The window is the one "Monitor last N valid ticks" armed, so it is always the same evidence the
 * "Odd percentage" block reads. An empty window reports 0 and never signals.
 */
window.Blockly.Blocks.eo_even_percentage = digitBlock({
    message: localize('Even percentage'),
    output: 'Number',
    tooltip: localize(
        'Percentage of the monitored window whose last digit is even: (even last digits / valid digits) × 100.'
    ),
    displayName: localize('Even percentage'),
    description: localize(
        'Even share of the monitored ticks: 0, 2, 4, 6 and 8 count as even. 0 while the window has no valid digits.'
    ),
    keyWords: localize('even percentage share parity window evenodd'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_even_percentage = digitGenerator(
    () => 'Bot.eoEvenPercent()'
);
