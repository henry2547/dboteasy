import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

/**
 * "Selected signal direction" — the direction the configured Even/Odd strategy really selects from
 * the observed percentages: EVEN, ODD or NO SIGNAL.
 *
 * With the direction set to BOTH and both parities at or above the threshold, one direction is
 * chosen (the higher share, an exact tie resolves to EVEN) and the conflict is journalled — the
 * block never reports two directions for one signal.
 */
window.Blockly.Blocks.eo_signal_direction = digitBlock({
    message: localize('Selected signal direction'),
    output: 'String',
    tooltip: localize(
        'EVEN or ODD when that parity reached the configured threshold, NO SIGNAL when neither did. With BOTH, the higher parity wins and a tie resolves to EVEN.'
    ),
    displayName: localize('Selected signal direction'),
    description: localize('The parity the configured Even/Odd strategy currently selects.'),
    keyWords: localize('even odd signal direction selected evenodd parity'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.eo_signal_direction = digitGenerator(() =>
    'Bot.eoSignalDirection()'
);
