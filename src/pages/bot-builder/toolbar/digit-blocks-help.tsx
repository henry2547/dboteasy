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
        name: localize('High digits in a row'),
        summary: localize('Several ticks in a row that all ended at or above the digit you pick.'),
        steps: [
            localize('Drag “Last … digits all at or above …” from Blocks menu → Digits onto the canvas.'),
            localize('Set how many ticks must qualify — 3 for the Over 1 / Under 6 setup — and the digit, 6 with “above” so only 7, 8 and 9 count.'),
            localize('Every one of those ticks must qualify: 7, 8, 9 passes, while 7, 5, 9 fails because the 5 breaks the run.'),
            localize('Use it as the recovery trigger that starts the Under 6 leg.'),
        ],
    },
    {
        name: localize('Two digits below a share'),
        summary: localize('Two digits that are both running colder than a percentage of the window.'),
        steps: [
            localize('Drag “Digits … + … both under … %, last … ticks” onto the canvas.'),
            localize('Pick the two digits — 0 and 1 for the Over 1 setup — the share, 10.5%, and the window, 1000 ticks.'),
            localize('Both digits must be strictly below that percentage; a digit sitting exactly on it fails.'),
            localize('Use it so the bot only buys Over 1 while the two lowest digits are genuinely cold.'),
        ],
    },
    {
        name: localize('Neutral digit bar'),
        summary: localize('A digit that carries neither the green (hottest) nor the red (coldest) bar.'),
        steps: [
            localize('Drag “Digit … has no hot / cold bar, last … ticks” onto the canvas.'),
            localize('Pick the digits — 5 and 6 for the Under 6 recovery leg, joined with AND — and how many ticks to read.'),
            localize('It reads the same green and red bars the Digits page draws, so it turns false once that digit becomes the hottest or the coldest.'),
            localize('With no ticks loaded yet it answers false, never neutral.'),
        ],
    },
];

const HOW_TO_ADD = [
    localize('Open Bot Builder and expand the Blocks menu.'),
    localize('Open Digits — the three newest blocks sit at the top, followed by the frequency readings they are built on.'),
    localize('Drag a block onto the canvas, or press the + on its card.'),
    localize('Connect it inside a condition, for example Purchase conditions → before purchase, then set its values and run your bot.'),
];

const OTHER_BLOCKS = [
    localize('Last digit is over / under — the contract gate: “Over 1” wins on digits 2–9, “Under 6” wins on digits 0–5.'),
    localize('Last digit is even / odd — true for 0, 2, 4, 6, 8 or for 1, 3, 5, 7, 9.'),
    localize('Last digit matches / differs — the newest digit is, or is not, the digit you pick.'),
    localize('Digit frequency (%) — how much of the window the digit took; a fair digit sits near 10%.'),
    localize('Hot / cold digit — the digit that appeared most, or least, often in the window.'),
    localize('Digit streak — how many ticks in a row share the newest digit.'),
    localize('Switch active market — move the bot to another market between trades.'),
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
                    'Every Digit block reads the last digit of the live ticks of the market you set in Trade parameters. The menu keeps only the blocks a digit bot actually needs.'
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
