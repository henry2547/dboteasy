// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import Dialog from '@/components/shared_ui/dialog';
import { localize } from '@deriv-com/translations';
import './digit-blocks-help.scss';

type TDigitBlocksHelp = {
    is_visible: boolean;
    onClose: () => void;
};

const NEW_BLOCKS = [
    {
        name: localize('Digit frequency count'),
        summary: localize('How many times a digit showed up in the recent ticks.'),
        steps: [
            localize('Drag “Times digit … appeared in last … ticks” from Blocks menu → Digits onto the canvas.'),
            localize('Pick the digit (0–9) and set the sample, for example 100 ticks.'),
            localize('It returns a whole number: how many of those ticks ended in that digit. About 10 is normal for 100 ticks.'),
            localize('Compare it in a condition, for example: Digit frequency count of 3 < 7 means that digit is running cold.'),
        ],
    },
    {
        name: localize('Hottest / coldest digit'),
        summary: localize('The digit that appeared most, or least, often in the recent ticks.'),
        steps: [
            localize('Drag “Hottest / coldest digit in last … ticks” onto the canvas.'),
            localize('Choose Hottest or Coldest, then set the sample, for example 100 ticks.'),
            localize('It returns that digit from 0 to 9. Hottest is the one that showed up most, coldest the one that showed up least.'),
            localize('Feed it into another digit block or store it in a variable to trade the current leader or laggard.'),
        ],
    },
    {
        name: localize('Digit gap'),
        summary: localize('How many ticks have passed since a digit last showed up.'),
        steps: [
            localize('Drag “Ticks since digit … last appeared” onto the canvas and pick the digit.'),
            localize('It returns a count: 0 means the newest tick ended in that digit, 2 means it was two ticks ago.'),
            localize('A value of -1 means the digit has not appeared in the ticks loaded so far — it is not the same as a gap of 0.'),
            localize('Use it in a condition, for example: Digit gap of 5 > 30 → the digit has been away for a while.'),
        ],
    },
    {
        name: localize('Longest digit run'),
        summary: localize('The longest run a digit ever managed inside the sample.'),
        steps: [
            localize('Drag “Longest run of digit … in last … ticks” onto the canvas.'),
            localize('Pick the digit and set the sample, for example 100 ticks.'),
            localize('It returns the biggest number of ticks in a row that ended in that digit. 0 means it never repeated.'),
        ],
    },
    {
        name: localize('Digit parity share'),
        summary: localize('How lopsided the sample is between even and odd digits.'),
        steps: [
            localize('Drag “Share (%) of … digits in last … ticks” and choose even or odd.'),
            localize('It returns a percentage of the sample. 50% is balanced; far above or below is lopsided.'),
            localize('Compare it, for example: Share of even digits > 55 → trade Even only while the sample leans that way.'),
        ],
    },
    {
        name: localize('Digit transition count'),
        summary: localize('How often one digit followed another on the next tick.'),
        steps: [
            localize('Drag “Times digit … was followed by … in last … ticks” onto the canvas.'),
            localize('Pick both digits and set the sample.'),
            localize('It counts only pairs that sit next to each other in the tick history, so 0 means the pair never happened in the sample.'),
        ],
    },
    {
        name: localize('Digit repeat share'),
        summary: localize('How often a tick repeated the previous tick’s digit.'),
        steps: [
            localize('Drag “Share (%) of ticks that repeated the previous digit” and set the sample.'),
            localize('It returns a percentage of the sample; about 10% is the chance level for a fair digit.'),
            localize('Compare it, for example: Repeat share > 15 → the market is repeating more than usual.'),
        ],
    },
    {
        name: localize('Digit streak'),
        summary: localize('How many ticks in a row ended with the same last digit.'),
        steps: [
            localize('Drag “Ticks in a row with the same last digit” onto the canvas — it has no settings.'),
            localize('It always follows the newest tick and returns a count: 1 means the latest tick started a fresh run.'),
            localize('Compare it, for example: Digit streak > 4 → wait for the run to break before you buy.'),
        ],
    },
];

const HOW_TO_ADD = [
    localize('Open Bot Builder and expand the Blocks menu.'),
    localize('Open Digits — the new blocks sit below the existing digit blocks.'),
    localize('Drag a block onto the canvas, or press the + on its card.'),
    localize('Connect it inside a condition, for example Purchase conditions → before purchase, then set its values and run your bot.'),
];

const OTHER_BLOCKS = [
    localize('Last digit is over / under — true when the newest digit is above or below the one you pick.'),
    localize('Last digit is even / odd — true for 0, 2, 4, 6, 8 or for 1, 3, 5, 7, 9.'),
    localize('Last digit matches / differs — true when the newest digit is, or is not, the digit you pick.'),
    localize('Frequency (%) of digit — the same idea as the count block, shown as a percentage instead of a count.'),
];

const DigitBlocksHelp = ({ is_visible, onClose }: TDigitBlocksHelp) => (
    <Dialog
        portal_element_id='modal_root'
        title={localize('Digit blocks guide')}
        is_visible={is_visible}
        confirm_button_text={localize('Got it')}
        onConfirm={onClose}
        has_close_icon
        onClose={onClose}
        is_mobile_full_width
        className='digit-blocks-help'
    >
        <div className='digit-blocks-help__content'>
            <p className='digit-blocks-help__intro'>
                {localize(
                    'Every Digit block reads the last digit of the live ticks of the market you set in Trade parameters. Here is how to use the blocks added to the Digits menu.'
                )}
            </p>

            {NEW_BLOCKS.map(block => (
                <div className='digit-blocks-help__block' key={block.name}>
                    <p className='digit-blocks-help__block-name'>{block.name}</p>
                    <p className='digit-blocks-help__block-summary'>{block.summary}</p>
                    <ol className='digit-blocks-help__steps'>
                        {block.steps.map(step => (
                            <li key={step}>{step}</li>
                        ))}
                    </ol>
                </div>
            ))}

            <p className='digit-blocks-help__heading'>{localize('Adding any Digit block')}</p>
            <ol className='digit-blocks-help__steps'>
                {HOW_TO_ADD.map(step => (
                    <li key={step}>{step}</li>
                ))}
            </ol>

            <p className='digit-blocks-help__heading'>{localize('Also in the Digits menu')}</p>
            <ul className='digit-blocks-help__list'>
                {OTHER_BLOCKS.map(item => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </div>
    </Dialog>
);

export default DigitBlocksHelp;
