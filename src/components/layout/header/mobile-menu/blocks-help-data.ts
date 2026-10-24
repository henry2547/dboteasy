// @ts-nocheck — the observer catalogue is plain JS data (see AGENTS.md); types are inferred loosely.
import {
    GROUPS,
    blocksInGroup,
    categoryGuide,
    helpFor,
} from '@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog';

export type TGuideEntry = { name: string; note?: string };
export type TGuideGroup = {
    id: string;
    title: string;
    what: string;
    steps: string[];
    /** Categories of the Blocks menu, each with its advice and the blocks it holds (observer groups). */
    categories?: { name: string; note?: string; blocks: TGuideEntry[] }[];
    /** Flat block list for a group that has no categories (Digits). */
    blocks?: TGuideEntry[];
};

/** The digit blocks, grouped under "Digits" in the Blocks menu, in the order the menu lists them. */
const DIGIT_BLOCKS: TGuideEntry[] = [
    {
        name: 'Digit over/under',
        note: 'True when the last digit of the newest tick is above or below the digit you pick. “Over 1” is true for 2 to 9, “Under 6” for 0 to 5.',
    },
    { name: 'Digit even/odd', note: 'True for 0, 2, 4, 6, 8 (even) or 1, 3, 5, 7, 9 (odd).' },
    { name: 'Digit matches/differs', note: 'True when the newest digit is, or is not, the digit you choose.' },
    {
        name: 'High digits in a row',
        note: 'True when the last few ticks all ended at or above (or above) the digit you pick — the Under 6 recovery trigger.',
    },
    {
        name: 'Two digits below a share',
        note: 'True when both digits took less than the percentage you set of the recent window — the Over 1 entry gate.',
    },
    { name: 'Digit frequency', note: 'The share of the recent ticks, in percent, that ended in the digit you choose.' },
    { name: 'Hot / cold digit', note: 'The digit that appeared most, or least, often in the recent ticks.' },
    {
        name: 'Neutral digit bar',
        note: 'True when the digit carries neither the green (hottest) nor the red (coldest) bar of the Digits page.',
    },
    { name: 'Digit streak', note: 'How many ticks in a row ended with the same last digit as the newest tick.' },
    { name: 'Switch active market', note: 'Moves the bot to the next eligible market between trades.' },
];

/** The catalogue gives every block its category's advice; only wording of its own is worth repeating here. */
const noteOf = (spec: any): string | undefined =>
    spec.help && spec.help !== helpFor(spec.label, spec.category) ? spec.help : undefined;

const observerCategories = (groupId: string) => {
    const group = GROUPS.find(item => item.id === groupId);
    if (!group) return [];
    const specs = blocksInGroup(group);
    return group.categories
        .map(category => ({
            name: category as string,
            // The advice the catalogue gives every block in this category.
            note: categoryGuide(category),
            blocks: specs
                .filter(spec => spec.category === category)
                .map(spec => ({ name: spec.label as string, note: noteOf(spec) })),
        }))
        .filter(category => category.blocks.length > 0);
};

const GROUP_TEXT: Record<string, { what: string; steps: string[] }> = {
    observer_digit_frequency: {
        what: 'The detailed digit analysis blocks: counts, percentages, streaks, matches, over/under and stability. Each one reads the live ticks of your selected market and reports Inconclusive when there is not enough genuine data. The group opens into its own sub-categories, so you pick the kind of reading first and the block second.',
        steps: [
            'Set the market in 1. Trade parameters — every block in this group analyses that market.',
            'Expand the group, then a sub-category inside it, and drag the reader you need — for example Get Digit Frequency Percentage or Get Digit Occurrence Count.',
            'Compare what it returns with the Logic & Comparison blocks (Greater Than, Is Between …), then feed that condition into an if block.',
            'Guard the reading with Check Minimum Sample Size, or Require Minimum Sample Size for entry, before you trust it — a handful of ticks says very little.',
            'For a deeper look use Window statistics: set the window with Analyse Last N Ticks, then read gaps (Read Ticks Since Digit Last Appeared), repetition (Get Digit Repeat Rate) or how clustered the window is (Get Window Entropy, Check Window Randomness).',
        ],
    },
    observer_pattern_parity: {
        what: 'Blocks that watch a pattern build up and confirm, instead of judging one tick: runs of even or odd digits, parity switches and streaks coming to an end. The group opens into its own sub-categories.',
        steps: [
            'Start from a confirmation rule — Wait For Configured Parity or Wait For Confirmation Digit — so the bot waits for the pattern instead of assuming it.',
            'Describe the pattern with the detection blocks: Detect Consecutive Run (identical, even or odd digits), Detect Consecutive Digit Pair, Parity Pattern (initial run, confirmation, target) or Digit Sequence Matches Pattern.',
            'Emit the setup with Emit Setup Detected, then judge the next tick with Evaluate Next Tick Parity or Evaluate Next Tick Against Barrier.',
            'Follow the cycle with Pattern Stage Is (Waiting for pair, Waiting for confirmation, Setup detected, Evaluation pending, Cooldown), and read the run lengths it sees with Read Current Parity Run, Count Parity Switches or Read Ticks Since Digit Last Appeared.',
        ],
    },
    observer_control: {
        what: 'The housekeeping of an observational bot: when each group of blocks runs, which market is read, how conditions are combined and where values are remembered. The group opens into its own sub-categories.',
        steps: [
            'Drag an event block first — When Bot Starts, When New Tick Arrives, When Analysis Window Updates — and nest everything that should happen at that moment inside it.',
            'Combine conditions with IF / IF-ELSE, AND, OR and NOT.',
            'Keep a value for a later tick in a variable; Reset Analysis State clears the stored values.',
            'Leave the market to 1. Trade parameters — the market is set once there — and react to a switch with When Market Changes or read it with Read Market Symbol.',
        ],
    },
    observer_entry_monitoring: {
        what: 'What happens when your conditions pass: the entry point, the cooldown after a setup, the limits that stop the bot and the blocks that record what happened.',
        steps: [
            'Put your entry logic inside When All Entry Conditions Pass, or use When Any Entry Condition Passes with OR for alternatives.',
            'Add the guards you want: Require Minimum Sample Size, Require Fresh Market Data, Require No Duplicate Setup, Require Cooldown Complete.',
            'Control how often a setup can fire with Restart After N New Ticks or Restart After Cooldown, and bound the session with Stop After N Setups, Stop After N Evaluations or Stop When Data Becomes Stale.',
            'Review the run with Learning & Observation blocks such as Read Historical Sample Size, Calculate Historical Outcome Frequency and Report Statistic.',
            'A passing entry trades with the trade parameters you already set in 1. Trade parameters — stake, contract type and duration stay yours; the observer only decides when to start.',
            'After a setup, another trade needs Restart Monitoring, Restart After N New Ticks or Restart After Cooldown first, so a condition that keeps passing cannot trade on every tick.',
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
            'Boolean blocks (over/under, even/odd, matches/differs, high digits in a row, two digits below a share, neutral digit bar) go into an if block inside 2. Purchase conditions; number blocks (frequency, hot/cold digit, streak) go into a comparison such as greater than or less than.',
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
