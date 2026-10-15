// @ts-nocheck — the observer catalogue is plain JS data (see AGENTS.md); types are inferred loosely.
import { GROUPS, blocksInGroup } from '@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog';

export type TGuideEntry = { name: string; note?: string };
export type TGuideGroup = {
    id: string;
    title: string;
    what: string;
    steps: string[];
    /** Categories of the Blocks menu, each with the blocks it holds (observer groups). */
    categories?: { name: string; blocks: TGuideEntry[] }[];
    /** Flat block list for a group that has no categories (Digits). */
    blocks?: TGuideEntry[];
};

/** The everyday digit blocks, grouped under "Digits" in the Blocks menu. */
const DIGIT_BLOCKS: TGuideEntry[] = [
    {
        name: 'Digit over/under',
        note: 'True when the last digit of the newest tick is above or below the digit you pick. “Over 2” is true for 3 to 9, “Under 7” for 0 to 6.',
    },
    { name: 'Digit even/odd', note: 'True for 0, 2, 4, 6, 8 (even) or 1, 3, 5, 7, 9 (odd).' },
    { name: 'Digit matches/differs', note: 'True when the newest digit is, or is not, the digit you choose.' },
    { name: 'Digit frequency', note: 'The share of the recent ticks, in percent, that ended in the digit you choose.' },
    { name: 'Digit frequency count', note: 'How many of the recent ticks ended in that digit, as a whole number.' },
    { name: 'Hottest / coldest digit', note: 'The digit that appeared most, or least, often in the recent ticks.' },
    { name: 'Digit streak', note: 'How many ticks in a row ended with the same last digit as the newest tick.' },
];

/** The observer catalogue ships a generic sentence on every block; only custom help is worth showing. */
const genericHelp = (label: string) => `${label}. Evaluated only on a real market event; missing data is Inconclusive.`;
const noteOf = (spec: any): string | undefined =>
    spec.help && spec.help !== genericHelp(spec.label) ? spec.help : undefined;

const observerCategories = (groupId: string) => {
    const group = GROUPS.find(item => item.id === groupId);
    if (!group) return [];
    const specs = blocksInGroup(group);
    return group.categories
        .map(category => ({
            name: category as string,
            blocks: specs
                .filter(spec => spec.category === category)
                .map(spec => ({ name: spec.label as string, note: noteOf(spec) })),
        }))
        .filter(category => category.blocks.length > 0);
};

const GROUP_TEXT: Record<string, { what: string; steps: string[] }> = {
    observer_digit_frequency: {
        what: 'The detailed digit analysis blocks: counts, percentages, streaks, matches, over/under and stability. Each one reads the live ticks of your selected market and reports Inconclusive when there is not enough genuine data.',
        steps: [
            'Set the market in 1. Trade parameters — every block in this group analyses that market.',
            'Expand the group in the Blocks menu and drag the reader you need, for example Get Digit Frequency Percentage or Get Digit Occurrence Count.',
            'Compare what it returns with the Logic & Comparison blocks (Greater Than, Is Between …), then feed that condition into an if block.',
            'Guard the reading with Check Minimum Sample Size, or Require Minimum Sample Size for entry, before you trust it — a handful of ticks says very little.',
        ],
    },
    observer_pattern_parity: {
        what: 'Blocks that watch a pattern build up and confirm, instead of judging one tick: runs of even or odd digits, parity switches and streaks coming to an end.',
        steps: [
            'Start from a waiting block — Wait For Even Confirmation, Wait For Configured Parity — so the bot waits for the pattern instead of assuming it.',
            'Describe the pattern with the detection blocks: Detect N Consecutive Even Digits, Parity Pattern (initial run, confirmation, target) or Digit Sequence Matches Pattern.',
            'Emit the setup with Emit Even/Odd Setup, then judge the next tick with Evaluate Next Tick Parity.',
            'Read how the pattern ended in Entry & monitoring → Learning & Observation.',
        ],
    },
    observer_control: {
        what: 'The housekeeping of an observational bot: when each group of blocks runs, which market is read, how conditions are combined and where values are remembered.',
        steps: [
            'Drag an event block first — When Bot Starts, When New Tick Arrives, When Analysis Window Updates — and nest everything that should happen at that moment inside it.',
            'Combine conditions with IF / IF-ELSE, AND, OR and NOT.',
            'Keep a value for a later tick in a variable; Reset Analysis State clears the stored values.',
            'Leave the market to 1. Trade parameters, or read it with Use Currently Selected Market and react with When Market Changes.',
        ],
    },
    observer_entry_monitoring: {
        what: 'What happens when your conditions pass: the entry point, the cooldown after a setup, the limits that stop the bot and the blocks that record what happened.',
        steps: [
            'Put your entry logic inside When All Entry Conditions Pass, or use When Any Entry Condition Passes with OR for alternatives.',
            'Add the guards you want: Require Minimum Sample Size, Require Fresh Market Data, Require No Duplicate Setup, Require Cooldown Complete.',
            'Control how often a setup can fire with Restart After N New Ticks or Restart After Cooldown, and bound the session with Stop After N Setups, Stop After N Evaluations or Stop When Data Becomes Stale.',
            'Review the run with Learning & Observation blocks such as Read Historical Sample Size, Calculate Historical Outcome Frequency and Report Statistic.',
        ],
    },
};

/** Digits first, then the four observer groups in the order the Blocks menu lists them. */
export const BLOCK_GUIDE_GROUPS: TGuideGroup[] = [
    {
        id: 'digits',
        title: 'Digits',
        what: 'The plain digit blocks: they read the last digit of every tick of the market you set in 1. Trade parameters, so a condition can be tested on the very latest tick.',
        steps: [
            'Open Bot Builder, expand the Blocks menu and pick Digits.',
            'Drag a block onto the canvas and set its digit, or its digit and sample — for example digit 3 in the last 100 ticks.',
            'Boolean blocks (over/under, even/odd, matches/differs) go into an if block inside 2. Purchase conditions; number blocks (frequency, count, hottest/coldest, streak) go into a comparison such as greater than or less than.',
            'Press Run and watch the tick-by-tick log to see the block being evaluated.',
        ],
        blocks: DIGIT_BLOCKS,
    },
    ...GROUPS.map(group => ({
        id: group.id,
        title: group.name,
        what: GROUP_TEXT[group.id]?.what ?? '',
        steps: GROUP_TEXT[group.id]?.steps ?? [],
        categories: observerCategories(group.id),
    })),
];
