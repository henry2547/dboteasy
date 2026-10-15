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
