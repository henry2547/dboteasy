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
        name: localize('Pair entry: Over 1 / Under 8, Even/Odd recovery'),
        summary: localize(
            'The whole observed setup in one block: the losing pair is confirmed, then a loss reverses on Even/Odd.'
        ),
        steps: [
            localize('Drag “Trade Over 1 when its losing pair is confirmed by a later digit …” from Blocks menu → Digits onto the canvas.'),
            localize('Pick the leg — Over 1 waits on digits 0 and 1, Under 8 on 8 and 9: a pair (0,0 · 0,1 · 1,1 · 1,0 or 8,8 · 8,9 · 9,9 · 9,8) must appear and a later tick then confirms it by ending in the same pair.'),
            localize('Other digits may pass between the pair and its confirmation — up to 3 of them, digits from the pair included: 0, 1 then 0 is confirmed, and so are 0, 1 then 3, 5, 7 then 1 and 8, 9 then 9, 9, 8 then 6, 7, 5 then 8. A pair further back than that is stale and the block waits for the next one.'),
            localize('Set the cold share to 10.2% and the window to 1000 ticks: both losing digits must sit at or below it, and the ceiling tightens itself from the live window. The red (coldest) bar plays no part — the digits may carry it or not.'),
            localize('After a settled loss it buys the opposite parity of the last 2 digits — both even → ODD, both odd → EVEN — and buys nothing on a mixed pair.'),
        ],
    },
    {
        name: localize('Pair, then a confirmation digit'),
        summary: localize('A 0/1 (or 8/9) pair appears and a later tick confirms it by ending in the same pair.'),
        steps: [
            localize('Drag “A 0 or 1 pair, then a confirmation digit” from Blocks menu → Digits onto the canvas.'),
            localize('Pick the pair: 0 or 1 for Over 1, 8 or 9 for Under 8.'),
            localize('Up to 3 digits may pass before the confirmation, digits from the pair included: 0, 1 then 0, 0, 1 then 3, 5, 7 then 1, 8, 9 then 9 and 9, 8 then 6, 7, 5 then 8 all count.'),
            localize('It buys nothing on its own; join it to the share and no-red-bar reads inside a Purchase condition.'),
        ],
    },
    {
        name: localize('Cold pair setup ready'),
        summary: localize('The whole Over 1 / Under 8 entry — pair confirmed (0,1,0 · 0,1,3,5,7,1 · 8,9,9 · 9,8,6,7,5,8) and both digits at or below the share — in one Boolean.'),
        steps: [
            localize('Drag “Over 1 setup: pair confirmed, both digits at or below … %” from Blocks menu → Digits onto the canvas.'),
            localize('Pick the leg and the cold share — 10.2% keeps the losing digits at or below the fair 10% share — and set the window to 100 ticks.'),
            localize('Both losing digits — 0 and 1 for Over 1, 8 and 9 for Under 8 — must sit at or below that share. The red (coldest) bar plays no part: the digits may carry it or not.'),
            localize('Drop it inside a Purchase condition to buy the matching Over 1 / Under 8 contract when the whole setup is ready.'),
        ],
    },
    {
        name: localize('Low / high digits in a row'),
        summary: localize('Several ticks in a row that all ended in the low pair (0 or 1) or the high pair (8 or 9).'),
        steps: [
            localize('Drag “Last … digits all 0 or 1” from Blocks menu → Digits onto the canvas.'),
            localize('Set 3 ticks for the pair-plus-confirmation rule, and pick the pair: 0 or 1 for Over 1, 8 or 9 for Under 8.'),
            localize('Every one of those ticks must qualify: 0, 0, 1 passes while 1, 5, 0 fails because the 5 breaks the run.'),
            localize('Use “A 0 or 1 pair, then a confirmation digit” instead when other digits may pass before the confirmation.'),
        ],
    },
    {
        name: localize('Digit has no red bar'),
        summary: localize('A digit that is not the coldest one in the window, so it carries no red bar.'),
        steps: [
            localize('Drag “Digit … has no red bar, last … ticks” onto the canvas.'),
            localize('Pick the digit and the window — 0 and 1 with 100 ticks for Over 1, 8 and 9 for Under 8 — and join the two reads with AND.'),
            localize('It reads the same red (coldest) bar the Digits page draws. The digit may still carry the green (hottest) bar, and with no ticks loaded it answers false.'),
        ],
    },
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
        name: localize('Two digits at or below a share'),
        summary: localize('Two digits that are both at or below a percentage of the window.'),
        steps: [
            localize('Drag “Digits … + … both at or below … %, last … ticks” onto the canvas.'),
            localize('Pick the two digits — 0 and 1 for the Over 1 setup — the share, 10.2%, and the window, 1000 ticks.'),
            localize('Both digits must be at or below that percentage; a digit sitting exactly on it passes.'),
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
    localize('Open Digits — the newest blocks sit at the top, followed by the frequency readings they are built on.'),
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
