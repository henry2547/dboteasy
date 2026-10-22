import { localize } from '@deriv-com/translations';
import { digitBlock, digitGenerator } from './digit-block';

window.Blockly.Blocks.digits_streak = digitBlock({
    message: localize('Ticks in a row with the same last digit'),
    output: 'Number',
    tooltip: localize('How many ticks in a row ended with the same last digit as the newest tick'),
    displayName: localize('Digit streak'),
    description: localize(
        'Counts the ticks in a row that ended with the same digit as the newest tick. 1 means the newest tick started a fresh run.'
    ),
    keyWords: localize('digit streak run repeat consecutive same last'),
});

window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_streak = digitGenerator(() => 'Bot.getDigitStreak()');
