/**
 * Declarative catalogue of the observational digit blocks.
 *
 * This is the single source of truth for the observer block library that used to live in the
 * Bots tab (`src/pages/bots/block-catalog.ts`). It stays free of any `window.Blockly` access so
 * the Bot Builder toolbox can read it while rendering, and `./index.js` turns each spec into a
 * real Blockly block.
 *
 * `op` keeps the observational meaning of the block (see the pattern engine in git history);
 * `output`, `inputs` and `body` describe its sockets.
 */
export const CATEGORIES = [
    'Bot Control',
    'Market Selection',
    'Digits',
    'Digit Conditions',
    'Frequency & Stability',
    'Logic & Comparison',
    'Matches & Differs',
    'Over & Under',
    'Even & Odd',
    'Entry Conditions',
    'Restart & Cooldown',
    'Stop & Safety',
    'Learning & Observation',
    'Notifications',
    'Variables',
];

/**
 * One practical instruction per category, used as a block's default help text so every block says
 * how it behaves and what it needs, not only what it is called. A block can override it with `help`.
 */
const CATEGORY_GUIDE = {
    'Bot Control':
        'A control block for the observer program: it decides when the blocks nested inside it run, and never reads the market itself.',
    'Market Selection':
        'Reads the market the run is on — symbol, newest price, feed state. The market you trade is still chosen in Trade parameters.',
    Digits: 'Reads the newest genuine tick only; feed it into a comparison or an entry condition rather than judging it on its own.',
    'Digit Conditions': 'A yes/no test on the newest genuine tick, made to be wired into IF, AND/OR or an entry condition.',
    'Frequency & Stability':
        'A statistic over the analysis window, not the newest tick; guard it with a minimum sample so a few ticks cannot look meaningful.',
    'Logic & Comparison':
        'Combines or compares other blocks and holds no market data itself, so it stays Inconclusive until both sockets are connected.',
    'Matches & Differs':
        'Selects the digit the Matches/Differs strategy is observed on; the choice is snapshotted when an entry passes.',
    'Over & Under':
        'Sets or reads the barrier: Over is strictly greater than the barrier, Under strictly less, and the barrier digit qualifies for neither.',
    'Even & Odd': 'Works on digit parity — 0, 2, 4, 6, 8 against 1, 3, 5, 7, 9 — instead of a single digit.',
    'Entry Conditions':
        'A guard or the entry point itself: these blocks decide whether the observer may start a trade with the trade parameters already on the canvas.',
    'Restart & Cooldown':
        'Decides when the next setup may be recorded; after one setup the observer waits for an explicit restart or cooldown.',
    'Stop & Safety': 'A session limit: it stops the observer when the bound is reached and never touches a trade already running.',
    'Learning & Observation': 'Records and reports what this session genuinely observed — descriptive history, never a prediction.',
    Notifications: 'Writes a line into the run journal so a run can be followed block by block.',
    Variables: 'Remembers a value between ticks for this session only; nothing is carried into the next run.',
    'Pattern Detector': 'Arms the pattern detector on the newest ticks; a detected pattern must still be confirmed before a setup can be emitted.',
    'Pattern State': 'Reads or resets where the pattern detector currently stands.',
    'Digit Statistics': 'A fuller look at the analysis window — windows, rankings and transitions. Set the window with Analyse Last N Ticks first.',
    'Even/Odd Patterns': 'Detects and confirms parity patterns — runs of even or odd digits — rather than a single digit.',
    'Streaks & Transitions': 'Looks at adjacent ticks: a repeat, a streak ending and A→B moves, instead of counting one digit over the window.',
    'Strategy Comparison':
        'Compares the observed outcomes of the armed strategies from this session’s completed observations; descriptive frequency only, never a probability or a signal.',
    'Observational Controls': 'Runs the observation cycle: start, pause, resume, stop, record an outcome and explain a decision.',
};

/** The plain sentence a block falls back to when its category has no advice of its own. */
export const categoryGuide = category => CATEGORY_GUIDE[category] ?? 'Evaluated only on a real market event; missing data is Inconclusive.';

/** The help a block uses when it brings no wording of its own: its name plus its category's advice. */
export const helpFor = (label, category) => `${label}. ${categoryGuide(category)}`;

export const BLOCKS = [];
const num = (name, label, value = 1, min = 0, max = 1000) => ({ name, label, kind: 'number', value, min, max });
const digit = () => num('DIGIT', 'digit', 2, 0, 9);
const text = (name, label, value = '') => ({ name, label, kind: 'text', value });
const pick = (name, label, choices) => ({ name, label, kind: 'select', choices, value: choices[0] });
function add(id, label, category, op, options = {}) {
    BLOCKS.push({
        type: `obs_${id}`,
        label,
        category: CATEGORIES[category],
        op,
        fields: [],
        inputs: {},
        help: helpFor(label, CATEGORIES[category]),
        ...options,
    });
}
[
    ['start', 'When Bot Starts', 'Runs once, after the trade parameters are set and genuine history has loaded, before the first tick is judged.'],
    ['market', 'When Market Changes', 'Runs when the market the run is on changes, before any block reads the new market.'],
    ['tick', 'When New Tick Arrives', 'Runs on every genuine tick — the usual place for the whole observation.'],
    ['window', 'When Analysis Window Updates', 'Runs once every analysis window of genuine ticks, for the slower statistics.'],
    ['setup', 'When Setup Is Detected', 'Runs right after a setup is recorded, before the entry trade starts.'],
    ['complete', 'When Setup Evaluation Completes', 'Runs when a pending observation resolves; the outcome it observed is already stored.'],
    ['lost', 'When Data Connection Is Lost', 'Runs when public market data stops; pending observations become Inconclusive, never filled in.'],
    ['restored', 'When Data Connection Is Restored', 'Runs when genuine ticks return after an interruption, before the next tick is judged.'],
    ['resume', 'When Bot Is Resumed', 'Runs once after Resume, before the next tick is judged.'],
].forEach(([event, label, help]) => add(`on_${event}`, label, 0, 'event', { event, body: true, help }));
add('if', 'IF condition', 0, 'if', {
    inputs: { CONDITION: 'Condition' },
    body: true,
    help: 'Run the blocks inside only on ticks where the connected condition passes. An Inconclusive condition never runs them — it is not treated as false.',
});
add('if_else', 'IF / ELSE', 0, 'if_else', {
    inputs: { CONDITION: 'Condition' },
    body: true,
    help: 'Run one branch when the condition passes and the other when it fails. Inconclusive runs neither.',
});
add('repeat', 'Repeat Evaluation', 0, 'repeat', {
    fields: [num('N', 'times (bounded)', 2, 1, 20)],
    body: true,
    help: 'Run the sequence N times for this event, at most 20. A 500-operation budget prevents blocking.',
});
add('wait', 'Wait Until Condition', 0, 'wait', {
    inputs: { CONDITION: 'Condition' },
    body: true,
    help: 'Recheck on subsequent genuine ticks. Stop, pause, or a data interruption cancels the waiter.',
});
add('once', 'Run Once', 0, 'once', { body: true, help: 'Run once per event dispatch, not per render or repeat iteration.' });
add('continue', 'Continue Monitoring', 0, 'continue', {
    help: 'A no-op marker: nothing happens here, and the sequence carries on to the next block.',
});
add('end', 'End Current Evaluation', 0, 'end', {
    help: 'Stops this sequence immediately. The bot keeps running and judges the next genuine tick as usual.',
});
add('reset', 'Reset Analysis State', 0, 'reset', {
    help: 'Clears the session counters, variables and completed observations so far; the journal is kept.',
});
add('market_ready', 'Require Market Data Ready', 1, 'ready', {
    output: 'Condition',
    help: 'True once genuine history has loaded for the run’s market, so the statistics have something to read.',
});
add('fresh', 'Check Market Data Freshness', 1, 'fresh', {
    output: 'Condition',
    help: 'True when the newest tick is within the freshness limit (15 seconds). Stale market data fails this check instead of reporting no data.',
});
add('connected', 'Check Market Connection', 1, 'connected', {
    output: 'Condition',
    help: 'True while the public market feed is connected; a dropped connection fails it and makes pending observations Inconclusive.',
});
[
    ['market_name', 'Read Market Name', 'market_name', 'String', 'The display name of the market the run is on, for a journal line or a notification.'],
    ['symbol', 'Read Market Symbol', 'symbol', 'String', 'The market’s symbol code, for example R_100 — useful when one program is reused across markets.'],
    ['price', 'Read Current Price', 'price', 'Number', 'The quoted price of the newest genuine tick, before the final digit is taken.'],
    ['timestamp', 'Read Last Tick Timestamp', 'timestamp', 'Number', 'The epoch of the newest genuine tick, in seconds; subtract it from the current time to measure tick age.'],
].forEach(([id, label, op, output, help]) => add(id, label, 1, op, { output, help }));
add('use_market', 'Use Currently Selected Market', 1, 'use_market', {
    help: 'Marks the market set in Trade parameters as the market every block reads; there is nothing else to set here.',
});
add('latest', 'Read Latest Final Digit', 2, 'latest', {
    output: 'Number',
    help: 'The final digit of the newest genuine tick, 0–9. The most direct read in the palette; Inconclusive until the first tick arrives.',
});
add('previous', 'Read Previous Final Digit', 2, 'ago', {
    output: 'Number',
    fields: [num('N', 'ticks ago', 1, 1, 999)],
    help: 'The final digit of the tick before the newest one — the usual way to judge a repeat or a transition.',
});
add('ago', 'Read Digit N Ticks Ago', 2, 'ago', {
    output: 'Number',
    fields: [num('N', 'ticks ago', 2, 0, 999)],
    help: 'Counts back through the observed ticks: 0 is the newest digit, 1 the one before it. Inconclusive when that many ticks have not been seen.',
});
add('last_digits', 'Read Last N Digits', 2, 'last_digits', {
    output: 'Digits',
    fields: [num('N', 'ticks', 25, 1)],
    help: 'The newest N final digits in chronological order, oldest first. Feed it to Explain Digit Window to print the run.',
});
add('count', 'Read Tick Count', 2, 'count', { output: 'Number', help: 'How many genuine ticks this session has observed so far.' });
add('window', 'Read Current Analysis Window', 2, 'window', {
    output: 'Number',
    help: 'The size of the analysis window every frequency and stability block reads — 100 by default, changed by Analyse Last N Ticks.',
});
add('occurrences', 'Get Digit Occurrence Count', 2, 'occurrences', {
    output: 'Number',
    fields: [digit()],
    help: 'How many ticks inside the analysis window ended in that digit, as a whole number; with a 100-tick window about 10 is a fair share.',
});
add('frequency', 'Get Digit Frequency Percentage', 2, 'frequency', {
    output: 'Number',
    fields: [digit()],
    help: 'The share of the analysis window that ended in that digit, in percent. Compare it with a threshold rather than reading it alone.',
});
add('combined', 'Get Combined Digit Frequency', 2, 'combined', {
    output: 'Number',
    fields: [text('DIGITS', 'digits', '0,1,2')],
    help: 'The combined share of several digits, for example 0,1,2 — useful for an over/under or even/odd basket instead of one digit.',
});
add('change', 'Get Digit Frequency Change', 2, 'change', {
    output: 'Number',
    fields: [digit()],
    help: 'The newest full window’s frequency minus the window before it, in percentage points. Inconclusive until two full windows exist.',
});
add('streak', 'Get Current Digit Streak', 2, 'streak', {
    output: 'Number',
    help: 'How many of the newest ticks in a row ended in the same digit, counting back from the latest one.',
});
add('longest', 'Get Longest Digit Streak', 2, 'longest', {
    output: 'Number',
    help: 'The longest repeating run of one digit anywhere in the observed window, not just at its end.',
});
[
    ['even_frequency', 'Get Even Frequency', 'even_frequency', 'The share of the analysis window that ended in an even digit (0, 2, 4, 6, 8), in percent.'],
    ['odd_frequency', 'Get Odd Frequency', 'odd_frequency', 'The share of the analysis window that ended in an odd digit (1, 3, 5, 7, 9), in percent.'],
    ['low_frequency', 'Get Low Digit Frequency', 'low_frequency', 'The frequency percentage of the digit that appeared least often in the window; ties choose the lower digit.'],
    ['high_frequency', 'Get High Digit Frequency', 'high_frequency', 'The frequency percentage of the digit that appeared most often in the window; ties choose the lower digit.'],
].forEach(([id, label, op, help]) => add(id, label, 2, op, { output: 'Number', help }));
add('transition', 'Get Digit Transition Frequency', 2, 'transition', {
    output: 'Number',
    fields: [digit(), num('TO', 'followed by', 3, 0, 9)],
    help: 'Of the ticks that ended in the first digit, the percentage whose next genuine tick ended in the second. Inconclusive until that pair has actually been observed.',
});
[
    ['equals', 'Latest Digit Equals', 'eq', 'True when the newest final digit is exactly the digit you set, for example equals 2.'],
    ['differs', 'Latest Digit Differs From', 'ne', 'True when the newest final digit is anything other than the digit you set — 9 out of 10 digits satisfy it.'],
    ['greater', 'Latest Digit Greater Than', 'gt', 'True when the newest final digit is strictly above the digit you set, for example greater than 6 means 7, 8 or 9.'],
    ['less', 'Latest Digit Less Than', 'lt', 'True when the newest final digit is strictly below the digit you set, for example less than 3 means 0, 1 or 2.'],
    ['previous_equals', 'Previous Digit Equals', 'previous_eq', 'Judges the tick before the newest one, so you can check a repeat or a move between two consecutive ticks.'],
].forEach(([id, label, op, help]) => add(id, label, 3, op, { output: 'Condition', fields: [digit()], help }));
add('even', 'Latest Digit Is Even', 3, 'even', { output: 'Condition', help: 'True when the newest final digit is 0, 2, 4, 6 or 8.' });
add('odd', 'Latest Digit Is Odd', 3, 'odd', { output: 'Condition', help: 'True when the newest final digit is 1, 3, 5, 7 or 9.' });
add('sequence', 'Digit Sequence Matches Pattern', 3, 'sequence', {
    output: 'Condition',
    fields: [text('DIGITS', 'oldest → newest', '2,7,4')],
    help: '2,7,4 means the most recent three digits in chronological order. Insufficient ticks is Inconclusive.',
});
[
    ['contains', 'Last N Digits Contain Selected Digit', 'contains', 'True when the digit appears at least once inside the newest N ticks, wherever it sits in them.'],
    ['not_contains', 'Last N Digits Do Not Contain Selected Digit', 'not_contains', 'True when the digit appears nowhere in the newest N ticks — a “has not shown up lately” test.'],
    ['consecutive', 'Digit Appeared Consecutively N Times', 'consecutive', 'True when that digit ran N ticks in a row inside the newest N ticks, so it needs them all to be that digit.'],
].forEach(([id, label, op, help]) => add(id, label, 3, op, { output: 'Condition', fields: [digit(), num('N', 'ticks', 3, 1)], help }));
add('streak_at_least', 'Current Digit Streak At Least N', 3, 'streak_at_least', {
    output: 'Condition',
    fields: [num('N', 'ticks', 3, 1)],
    help: 'True when the run of identical digits ending at the newest tick is at least N ticks long.',
});
[
    ['below', 'Below', 'below', 'True when that digit’s share of the analysis window is below the threshold you set.'],
    ['at_or_below', 'At Or Below', 'at_or_below', 'True when that digit’s share is at or below the threshold, so an exact hit counts as passing.'],
    ['above', 'Above', 'above', 'True when that digit’s share is above the threshold — the starting point for a “running hot” condition.'],
    ['at_or_above', 'At Or Above', 'at_or_above', 'True when that digit’s share reaches or passes the threshold.'],
].forEach(([id, name, op, help]) =>
    add(`freq_${id}`, `Digit Frequency ${name}`, 4, `freq_${op}`, {
        output: 'Condition',
        fields: [digit(), num('PERCENT', '%', 15, 0, 100)],
        help,
    })
);
[
    ['below', 'Below', 'below', 'below'],
    ['at_or_below', 'At Or Below', 'at_or_below', 'at or below'],
].forEach(([id, name, op, wording]) =>
    add(`combined_${id}`, `Combined Digit Frequency ${name}`, 4, `combined_${op}`, {
        output: 'Condition',
        fields: [text('DIGITS', 'digits', '0,1,2'), num('PERCENT', '%', 35, 0, 100)],
        help: `True when the digits you list take a combined share of the analysis window that is ${wording} the threshold you set.`,
    })
);
add('stable', 'Digit Is Stable Across N Windows', 4, 'stable', {
    output: 'Condition',
    fields: [digit(), num('N', 'non-overlapping windows', 2, 2, 10), num('TOLERANCE', 'percentage-point tolerance', 5, 0, 100)],
    help: 'Compare full non-overlapping windows; max frequency minus min frequency must be within tolerance. Low frequency alone is not stability.',
});
add('min_sample', 'Check Minimum Sample Size', 4, 'sample', {
    output: 'Condition',
    fields: [num('N', 'ticks', 100, 1)],
    help: 'Gate for every statistic: false until the session has observed N genuine ticks, so no condition is judged on a handful of prices.',
});
add('frequency_change', 'Frequency Change Within Tolerance', 4, 'frequency_change', {
    output: 'Condition',
    fields: [digit(), num('TOLERANCE', 'percentage points', 5, 0, 100)],
    help: 'True when that digit’s frequency moved by no more than the tolerance between the two newest full windows. Inconclusive until both windows are complete.',
});
['and', 'or'].forEach(op =>
    add(op, op.toUpperCase(), 5, op, {
        output: 'Condition',
        inputs: { A: 'Condition', B: 'Condition' },
        help:
            op === 'and'
                ? 'True only when both connected conditions pass; if either is Inconclusive the whole block is Inconclusive.'
                : 'True when at least one connected condition passes, which is how you offer alternative entry triggers; Inconclusive only when both are.',
    })
);
add('not', 'NOT', 5, 'not', {
    output: 'Condition',
    inputs: { A: 'Condition' },
    help: 'Inverts a condition: it passes exactly when the connected condition fails. An Inconclusive condition stays Inconclusive through NOT.',
});
[
    ['equal', 'Equals', 'eq', 'True when the two connected numbers are identical.'],
    ['not_equal', 'Does Not Equal', 'ne', 'True when the two connected numbers differ.'],
    ['gt', 'Greater Than', 'gt', 'True when the first connected number is strictly larger than the second.'],
    ['lt', 'Less Than', 'lt', 'True when the first connected number is strictly smaller than the second.'],
    ['gte', 'Greater Than Or Equal To', 'gte', 'True when the first connected number is larger than or exactly equal to the second.'],
    ['lte', 'Less Than Or Equal To', 'lte', 'True when the first connected number is smaller than or exactly equal to the second.'],
].forEach(([id, label, op, help]) =>
    add(`compare_${id}`, label, 5, `compare_${op}`, { output: 'Condition', inputs: { A: 'Number', B: 'Number' }, help })
);
add('number', 'Number', 5, 'number', {
    output: 'Number',
    fields: [num('VALUE', 'value', 10, -1000000, 1000000)],
    help: 'A fixed number to compare a reading against, for example frequency above 12.5.',
});
add('between', 'Is Between', 5, 'between', {
    output: 'Condition',
    inputs: { A: 'Number' },
    fields: [num('LOW', 'inclusive low', 0, -1000000, 1000000), num('HIGH', 'inclusive high', 9, -1000000, 1000000)],
    help: 'True when the connected number sits inside the range. Both ends count as inside, so between 10 and 15 passes on 10 and on 15.',
});
[
    ['matches', 'Matches', 'the next digit equals the digit you select'],
    ['differs', 'Differs', 'the next digit is anything other than the one you select'],
    ['over', 'Over', 'the next digit is strictly above the barrier'],
    ['under', 'Under', 'the next digit is strictly below the barrier'],
    ['even', 'Even', 'the next digit is 0, 2, 4, 6 or 8'],
    ['odd', 'Odd', 'the next digit is 1, 3, 5, 7 or 9'],
].forEach(([strategy, name, meaning], i) => {
    const category = i < 2 ? 6 : i < 4 ? 7 : 8;
    add(`configure_${strategy}`, `Configure ${name} Strategy`, category, `configure_${strategy}`, {
        help: `Tells the observer which strategy the next observation is about: it pays when ${meaning}. Set the digit or the barrier before you use it.`,
    });
    add(`evaluate_${strategy}`, `Evaluate Next Tick For ${name}`, category, `observe_${strategy}`, {
        help: `Observes the next genuine tick for ${name} and records the outcome in the journal. Observation only — it never places a trade.`,
    });
});
add('set_digit', 'Set Match / Excluded Digit', 6, 'set_digit', {
    fields: [digit()],
    help: 'Fixes the digit the Matches/Differs strategy is observed on. The digit is snapshotted into the setup when an entry passes.',
});
add('suggest_digit', 'Use Suggested Match / Differs Digit', 6, 'suggest_digit', {
    fields: [pick('RANK', 'ranking', ['lowest-frequency', 'highest-frequency'])],
    help: 'Choose the lowest/highest frequency digit from the current window; ties choose the lower digit. This does not predict the next tick.',
});
add('selected_digit', 'Read Selected Digit', 6, 'selected_digit', {
    output: 'Number',
    help: 'The digit the Matches/Differs strategy is currently set to — 2 until Set Match / Excluded Digit changes it.',
});
add('set_barrier', 'Set Barrier', 7, 'set_barrier', {
    fields: [num('BARRIER', 'barrier', 2, 0, 9)],
    help: 'Over is strictly greater; Under strictly less. The barrier digit qualifies for neither. Over 0–8; Under 1–9.',
});
add('barrier', 'Read Barrier', 7, 'barrier', {
    output: 'Number',
    help: 'The barrier the Over/Under observations are currently using, as last set by Set Barrier.',
});
add('parity_stable', 'Check Parity Stability', 8, 'parity_stable', {
    output: 'Condition',
    fields: [num('N', 'non-overlapping windows', 2, 2, 10), num('TOLERANCE', 'percentage points', 5, 0, 100)],
    help: 'True when the even share holds steady across consecutive windows — max minus min within the tolerance. A high share is not the same as a stable one.',
});
add('entry', 'When All Entry Conditions Pass', 9, 'entry', {
    inputs: { CONDITION: 'Condition' },
    body: true,
    help: 'Create a deduplicated hypothetical setup, snapshot its configuration, and run its connected observation sequence. All data-quality and cooldown guards take priority.',
});
add('entry_any', 'When Any Entry Condition Passes', 9, 'entry', {
    inputs: { CONDITION: 'Condition' },
    body: true,
    help: 'Connect OR to combine alternatives. The connected expression must Pass; Inconclusive never signals.',
});
[
    ['require_sample', 'Require Minimum Sample Size', 'sample', 'Gate the entry until the session has observed N genuine ticks, so a setup cannot fire on a handful of prices.'],
    ['require_fresh', 'Require Fresh Market Data', 'fresh', 'Gate the entry on the newest tick being recent — useful on quiet markets where a stale price could look like a signal.'],
    ['no_pending', 'Require No Pending Evaluation', 'no_pending', 'Gate the entry while an earlier observation is still waiting for its tick, so setups cannot pile up on each other.'],
    ['cooldown_complete', 'Require Cooldown Complete', 'cooldown_complete', 'Gate the entry until the cooldown set after the previous setup has run out.'],
    ['no_duplicate', 'Require No Duplicate Setup', 'no_duplicate', 'Gate the entry when the current tick has already produced a setup, so one tick cannot signal twice.'],
    ['selected', 'Require Selected Digit', 'selected', 'Gate the entry until a digit has actually been chosen for Matches/Differs, so an unset digit cannot trade.'],
    ['setup_limit', 'Check Maximum Setups Per Session', 'setup_limit', 'True while this session is still inside the 100-setup session cap the observer enforces.'],
].forEach(([id, label, op, help]) =>
    add(id, label, 9, op, { output: 'Condition', fields: op === 'sample' ? [num('N', 'ticks', 100, 1)] : [], help })
);
add('restart', 'Restart Monitoring', 10, 'restart', {
    help: 'Allow a new setup on a subsequent tick after the existing evaluation and cooldown. Never clears the journal.',
});
add('cooldown_ticks', 'Restart After N New Ticks', 10, 'cooldown_ticks', {
    fields: [num('N', 'ticks', 5, 0)],
    help: 'Waits N genuine ticks after a setup before another may be recorded; 0 allows the very next tick.',
});
add('cooldown_seconds', 'Restart After Cooldown', 10, 'cooldown_seconds', {
    fields: [num('N', 'seconds', 5, 0, 86400)],
    help: 'Waits N seconds of real time after a setup before another may be recorded, whichever comes with the ticks that follow.',
});
add('consecutive_pass', 'Require Conditions To Pass N Consecutive Times', 10, 'consecutive_pass', {
    output: 'Condition',
    inputs: { CONDITION: 'Condition' },
    fields: [num('N', 'evaluations', 2, 1)],
    help: 'True only after the connected condition has passed on N ticks in a row. Any failure resets the count; an Inconclusive tick neither passes nor resets it.',
});
add('consecutive_fail', 'Require Conditions To Fail N Consecutive Times', 10, 'consecutive_fail', {
    output: 'Condition',
    inputs: { CONDITION: 'Condition' },
    fields: [num('N', 'evaluations', 2, 1)],
    help: 'True only after the connected condition has failed on N ticks in a row — a “this pattern has gone quiet” test.',
});
add('reset_counters', 'Reset Consecutive Counters', 10, 'reset_counters', {
    help: 'Clears the running counts behind Require Conditions To Pass/Fail N Consecutive Times, without touching the observed ticks.',
});
add('reset_streak', 'Reset Streak Counter', 10, 'reset_streak', {
    help: 'Clears the consecutive counts kept for this session. The digit window itself is preserved.',
});
[
    ['pause', 'Pause Bot', 'pause', 'Pauses the observer program; monitoring resumes only when Resume Monitoring runs.'],
    ['stop', 'Stop Bot', 'stop', 'Ends the observer session and stops the bot. Pending observations are closed as Inconclusive rather than guessed.'],
    ['reset_session', 'Reset Session State', 'reset', 'Clears counters, variables, completed observations and the setup count; the journal stays.'],
    ['stale_stop', 'Stop When Data Becomes Stale', 'stale_stop', 'Stops the bot if genuine ticks stop arriving for longer than the freshness limit, instead of judging an old price.'],
    ['connection_stop', 'Stop When Market Connection Fails', 'connection_stop', 'Stops the bot when the public market feed drops, rather than carrying on with no data.'],
].forEach(([id, label, op, help]) => add(id, label, 11, op, { help }));
add('stop_setups', 'Stop After N Setups', 11, 'stop_setups', {
    fields: [num('N', 'setups', 10, 1, 500)],
    help: 'Bounds the session by the number of setups recorded; the bot stops when the count is reached.',
});
add('stop_evaluations', 'Stop After N Evaluations', 11, 'stop_evaluations', {
    fields: [num('N', 'evaluations', 10, 1, 500)],
    help: 'Bounds the session by the number of observations armed, whether or not each one qualified.',
});
add('stop_duration', 'Stop After Session Duration', 11, 'stop_duration', {
    fields: [num('N', 'seconds', 600, 1, 86400)],
    help: 'Bounds the session by real elapsed time, checked on each genuine tick.',
});
add('observe', 'Observe Next N Genuine Ticks', 12, 'observe', {
    fields: [num('N', 'ticks', 1, 1, 100)],
    help: 'Arms an observation over the next N genuine ticks and records whether the setup qualified. Pause, stop or a data interruption closes it as Inconclusive.',
});
add('inconclusive', 'Mark Evaluation Inconclusive', 12, 'inconclusive', {
    help: 'Forces this tick to stay Inconclusive: no entry can be signalled on it, which is how you say “do not trade on this one”.',
});
add('historical_sample', 'Read Historical Sample Size', 12, 'historical_sample', {
    output: 'Number',
    help: 'How many observations this session has completed, for a journal line or a minimum-sample guard.',
});
add('historical_frequency', 'Calculate Historical Outcome Frequency', 12, 'historical_frequency', {
    output: 'Number',
    help: 'Completed observations for this market and strategy only. Descriptive frequency, not a probability guarantee.',
});
add('note', 'Add Journal Note', 13, 'note', {
    fields: [text('TEXT', 'note', 'Condition checked')],
    help: 'Writes your text into the run journal at the moment the block runs, so a run can be followed step by step.',
});
add('notification', 'Show In-App Notification', 13, 'note', {
    fields: [text('TEXT', 'message', 'Setup detected')],
    help: 'Timestamped trace message, deduplicated until the message changes.',
});
add('set_variable', 'Set Number Variable', 14, 'set_variable', {
    fields: [text('NAME', 'name', 'counter')],
    inputs: { VALUE: 'Number' },
    help: 'Stores a number under a name so a later tick can read it back with Read Number Variable. Inconclusive input stores nothing.',
});
add('variable', 'Read Number Variable', 14, 'variable', {
    fields: [text('NAME', 'name', 'counter')],
    output: 'Number',
    help: 'The value last stored under that name in this session; 0 if the name has not been set yet.',
});
add('increase', 'Increase Counter', 14, 'increase', {
    fields: [text('NAME', 'name', 'counter'), num('N', 'by', 1, -1000, 1000)],
    help: 'Adds N to the stored number, counting from 0 the first time — the simplest way to count setups.',
});
add('reset_counter', 'Reset Counter', 14, 'reset_counter', {
    fields: [text('NAME', 'name', 'counter')],
    help: 'Sets that one stored number back to 0 and leaves every other variable alone.',
});
// Advanced declarations.
CATEGORIES.push(
    'Pattern Detector',
    'Pattern State',
    'Digit Statistics',
    'Even/Odd Patterns',
    'Streaks & Transitions',
    'Strategy Comparison',
    'Observational Controls'
);
add('genuine_tick', 'When New Genuine Tick Arrives', 15, 'event', {
    event: 'tick',
    body: true,
    help: 'Runs on every genuine tick; identical to When New Tick Arrives, so use one of the two, not both.',
});
add('pair', 'Detect Consecutive Digit Pair', 15, 'pattern_detect_pair', {
    fields: [pick('PAIRS', 'adjacent pairs', ['00 / 11', '88 / 99', '00', '11', '88', '99'])],
    help: 'Starts watching when the two newest digits are equal and part of the pair set you pick, for example 00 or 11. Confirmation is separate.',
});
add('identical', 'Detect N Consecutive Identical Digits', 15, 'pattern_detect_identical', {
    fields: [num('N', 'run length', 2, 2, 1000)],
    help: 'Starts watching when the newest N ticks all ended in the same digit. Detection only — it does not trade by itself.',
});
add('confirmation', 'Wait For Confirmation Digit', 15, 'pattern_confirm_digit', {
    fields: [num('DIGIT', 'digit', 0, 0, 9)],
    help: 'Sets which digit must appear next for the detected pattern to count as confirmed. Without this, the next tick confirms automatically.',
});
add('intervening', 'Allow Intervening Digits', 15, 'pattern_intervening', {
    fields: [pick('ALLOW', 'allowed', ['Yes', 'No'])],
    help: 'With Yes, other digits may pass between the detected pattern and its confirmation; with No, any other digit cancels the wait.',
});
add('confirmation_wait', 'Set Maximum Confirmation Wait', 15, 'pattern_timeout', {
    fields: [num('N', 'ticks (0 = unlimited)', 0, 0, 100000)],
    help: 'Gives the confirmation window a deadline in genuine ticks; when it expires the pattern resets. 0 waits indefinitely.',
});
add('confirmation_after', 'Check Confirmation Occurred After Pair', 15, 'adv_confirmation_after', {
    output: 'Condition',
    help: 'True when a confirmed pattern is waiting right now — the pair was detected and the confirmation tick has since arrived.',
});
add('emit_setup', 'Emit Setup Detected', 15, 'pattern_emit', {
    help: 'Turns the detected pattern into a setup: it records the setup, notes it and starts the entry trade if the guards allow.',
});
add('reset_pattern', 'Reset Pattern Detector', 15, 'pattern_reset', {
    help: 'Drops any watched pattern and returns the detector to Waiting for pair, so it starts looking from the current tick.',
});
add('prevent_duplicate', 'Prevent Duplicate Setup', 15, 'pattern_deduplicate', {
    help: 'One instance per adjacent run and one outcome per confirmation, including across restarts. Always enforced by the engine.',
});
add('barrier_outcome', 'Evaluate Next Tick Against Barrier', 15, 'pattern_barrier', {
    fields: [pick('RULE', 'strict condition', ['Over 1', 'Under 8'])],
    help: 'Arms an observation of the next tick against that barrier rule and journals whether it qualified. Observation only, no trade.',
});
add('pattern_stage', 'Read Pattern Stage', 16, 'adv_stage', {
    output: 'String',
    help: 'The stage the detector is in right now: Waiting for pair, Waiting for confirmation, Setup detected, Evaluation pending or Cooldown.',
});
[
    ['waiting_pair', 'Is Waiting For Pair', 'Waiting for pair', 'True while the detector is idle and looking for its next pattern.'],
    ['waiting_confirmation', 'Is Waiting For Confirmation', 'Waiting for confirmation', 'True while a pattern has been detected and its confirmation tick has not arrived yet.'],
    ['setup_detected', 'Is Setup Detected', 'Setup detected', 'True on the tick a setup was recorded, for the blocks that should run at that moment.'],
    ['evaluation_pending', 'Is Evaluation Pending', 'Evaluation pending', 'True while an armed observation is still waiting for its subsequent tick.'],
    ['in_cooldown', 'Is In Cooldown', 'Cooldown', 'True while the cooldown after a setup is still running, so no new setup may be recorded.'],
].forEach(([id, label, stage, help]) =>
    add(id, label, 16, 'adv_state', { output: 'Condition', fields: [{ ...pick('STAGE', 'stage', [stage]), value: stage }], help })
);
add('reset_to_pair', 'Reset To Waiting For Pair', 16, 'pattern_reset', {
    help: 'Returns the detector to Waiting for pair and stops any confirmation wait, ready for the next pattern.',
});
add('new_cycle', 'Start New Pattern Cycle', 16, 'pattern_reset', {
    help: 'Ends the current pattern cycle and begins a fresh one from the newest tick.',
});
add('analyse_window', 'Analyse Last N Ticks', 17, 'adv_window', {
    fields: [num('N', 'window (25–1000)', 100, 25, 1000)],
    help: 'Sets the analysis window that every frequency, stability and ranking block reads from now on. Put it at the start of a program so the whole run uses one window.',
});
[
    ['digit_frequency', 'Get Frequency Of Digit', 'frequency', 'That digit’s share of the analysis window in percent — the same reading as Get Digit Frequency Percentage, over a window you set yourself.'],
    ['digit_count', 'Get Count Of Digit', 'count', 'How many ticks in the analysis window ended in that digit, as a whole number.'],
].forEach(([id, label, op, help]) => add(id, label, 17, `adv_${op}`, { output: 'Number', fields: [digit()], help }));
add('most_frequent', 'Find Most Frequent Digit', 17, 'adv_most', {
    output: 'Number',
    help: 'The digit that appeared most often in the analysis window; ties choose the lower digit. It describes the window — it does not predict the next tick.',
});
add('least_frequent', 'Find Least Frequent Digit', 17, 'adv_least', {
    output: 'Number',
    help: 'The digit that appeared least often in the analysis window; ties choose the lower digit. Descriptive, not a prediction.',
});
add('combined_frequency', 'Get Combined Frequency', 17, 'adv_combined', {
    output: 'Number',
    fields: [text('DIGITS', 'digits', '0,1')],
    help: 'The combined share of the digits you list across the analysis window, in percent — for baskets such as 0,1 or 8,9.',
});
add('compare_frequency_windows', 'Compare Frequencies Between Windows', 17, 'adv_frequency_windows', {
    output: 'Number',
    fields: [digit(), num('N', 'ticks per disjoint window', 50, 25, 500)],
    help: 'Newest full window minus the one before it, in percentage points. Inconclusive until both windows are complete, so a partial window cannot bias it.',
});
add('frequency_stability', 'Check Frequency Stability', 17, 'adv_stability', {
    output: 'Condition',
    fields: [digit(), num('N', 'ticks per window', 50, 25, 500), num('TOLERANCE', 'percentage points', 5, 0, 100)],
    help: 'True when that digit’s frequency moved by no more than the tolerance between two full windows — steady, as opposed to merely high.',
});
add('read_digit_streak', 'Read Current Digit Streak', 17, 'adv_streak', {
    output: 'Number',
    help: 'The run of identical digits ending at the newest tick; 1 means the latest tick started a fresh run.',
});
add('find_digit_streak', 'Find Longest Digit Streak', 17, 'adv_longest', {
    output: 'Number',
    help: 'The longest repeating run of a single digit anywhere in the observed window, not only at its end.',
});
add('transition_frequency', 'Get Digit Transition Frequency', 17, 'adv_transition_frequency', {
    output: 'Number',
    fields: [digit(), num('TO', 'followed by', 3, 0, 9), num('MINIMUM', 'observations', 20, 1, 1000)],
    help: 'The share of A ticks whose next tick was B. Stays Inconclusive until A has been observed at least MINIMUM times, so a thin sample cannot read as a pattern.',
});
add('stat_minimum', 'Check Minimum Sample Size', 17, 'sample', {
    output: 'Condition',
    fields: [num('N', 'genuine ticks', 100, 1, 1000)],
    help: 'True once the session has observed N genuine ticks — the guard to put in front of every window statistic.',
});
add('pattern_parity_stability', 'Check Parity Stability', 18, 'parity_stable', {
    output: 'Condition',
    fields: [num('N', 'non-overlapping windows', 2, 2, 10), num('TOLERANCE', 'percentage points', 5, 0, 100)],
    help: 'True when the even share held steady across N consecutive windows; a high share is not the same as a stable one.',
});
add('latest_parity', 'Read Latest Digit Parity', 18, 'adv_parity', {
    output: 'String',
    help: 'Returns the word Even or Odd for the newest final digit — handy for a journal line or for comparing two ticks.',
});
add('even_run', 'Detect N Consecutive Even Digits', 18, 'pattern_detect_even', {
    fields: [num('N', 'run length', 3, 1, 1000)],
    help: 'Starts watching when the newest N ticks were all even digits; the wait for confirmation is set separately.',
});
add('odd_run', 'Detect N Consecutive Odd Digits', 18, 'pattern_detect_odd', {
    fields: [num('N', 'run length', 3, 1, 1000)],
    help: 'Starts watching when the newest N ticks were all odd digits; the wait for confirmation is set separately.',
});
add('even_confirmation', 'Wait For Even Confirmation', 18, 'pattern_confirm_even', {
    help: 'Requires the next confirming tick to be even before the detected pattern counts as confirmed.',
});
add('odd_confirmation', 'Wait For Odd Confirmation', 18, 'pattern_confirm_odd', {
    help: 'Requires the next confirming tick to be odd before the detected pattern counts as confirmed.',
});
add('parity_confirmation', 'Wait For Configured Parity', 18, 'pattern_confirm_parity', {
    fields: [pick('PARITY', 'confirmation', ['Even', 'Odd', 'Either'])],
    help: 'Sets which parity must arrive to confirm the pattern; Either accepts the very next tick, whatever it is.',
});
add('parity_pattern', 'Parity Pattern', 18, 'pattern_detect_parity', {
    fields: [
        pick('INITIAL', 'initial', ['Even', 'Odd']),
        num('N', 'run length', 3, 1, 1000),
        pick('CONFIRM', 'confirmation', ['Odd', 'Even', 'Either']),
        pick('TARGET', 'next tick target', ['Odd', 'Even']),
        num('TIMEOUT', 'timeout ticks (0 unlimited)', 0, 0, 100000),
        num('COOLDOWN', 'cooldown ticks', 0, 0, 1000),
        num('MINIMUM', 'minimum sample', 25, 1, 1000),
    ],
    help: 'The whole parity pattern in one block: it waits for N ticks of the initial parity, requires the confirmation parity, and only starts looking after the minimum sample is observed.',
});
add('parity_sequence', 'Detect Configured Parity Transitions', 18, 'pattern_detect_transitions', {
    fields: [text('PARITIES', 'oldest → newest', 'Even,Odd,Even')],
    help: 'Watches for a run of parities in the order you list, oldest first, for example Even,Odd,Even across three consecutive ticks.',
});
add('check_parity_transition', 'Check Parity Transition', 18, 'adv_parity_transition', {
    output: 'Condition',
    fields: [pick('FROM', 'from', ['Even', 'Odd']), pick('TO_PARITY', 'followed by', ['Odd', 'Even'])],
    help: 'True when the two newest ticks moved from the first parity to the second, for example Even → Odd.',
});
['Even', 'Odd'].forEach(parity =>
    add(`check_${parity.toLowerCase()}_frequency`, `Check ${parity} Frequency`, 18, 'adv_parity_frequency', {
        output: 'Condition',
        fields: [pick('PARITY', 'parity', [parity]), num('PERCENT', 'at least %', 50, 0, 100)],
        help: `True when that parity’s share of the analysis window reaches the threshold you set — the parity equivalent of Digit Frequency Above.`,
    })
);
add('emit_parity', 'Emit Even/Odd Setup', 18, 'pattern_emit', {
    help: 'Records the confirmed even/odd pattern as a setup and lets the entry trade start when the guards allow.',
});
add('parity_outcome', 'Evaluate Next Tick Parity', 18, 'pattern_parity_outcome', {
    fields: [pick('PARITY', 'target', ['Odd', 'Even'])],
    help: 'Observes the next genuine tick and journals whether it matched the target parity. Observation only, no trade.',
});
add('current_streak_length', 'Current Streak Length', 19, 'adv_streak', {
    output: 'Number',
    help: 'How many of the newest ticks in a row ended in the same digit as the latest one.',
});
add('longest_historical_streak', 'Longest Historical Streak', 19, 'adv_longest', {
    output: 'Number',
    help: 'The longest repeating run of one digit anywhere in the observed window — history, not the current run.',
});
add('streak_minimum', 'Streak Is At Least N', 19, 'adv_streak_minimum', {
    output: 'Condition',
    fields: [num('N', 'length', 3, 1, 1000)],
    help: 'True when the run of identical digits ending at the newest tick is at least N ticks long.',
});
add('streak_ended', 'Streak Just Ended', 19, 'adv_streak_ended', {
    output: 'Condition',
    help: 'True on the tick that broke a run of three or more identical digits — the “run is over” trigger.',
});
add('parity_switched', 'Parity Switched', 19, 'adv_parity_switched', {
    output: 'Condition',
    help: 'True when the newest tick has a different parity from the tick before it, even after odd or odd after even.',
});
add('digit_repeated', 'Digit Repeated', 19, 'adv_repeated', {
    output: 'Condition',
    help: 'True when the newest two ticks ended in exactly the same digit.',
});
add('digit_transition', 'Digit Transition From A To B', 19, 'adv_transition_now', {
    output: 'Condition',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9)],
    help: 'True when the two newest ticks moved exactly from A to B, for example 2 → 3 on the latest tick.',
});
add('count_transition', 'Count A Followed By B', 19, 'adv_transition_count', {
    output: 'Number',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9)],
    help: 'How many times A was followed by B anywhere in the observed window, as a whole number.',
});
add('frequency_transition', 'Frequency Of B After A', 19, 'adv_transition_frequency', {
    output: 'Number',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9), num('MINIMUM', 'observations', 20, 1, 1000)],
    help: 'The share of A ticks whose next tick was B. Inconclusive until A has been observed at least MINIMUM times, so a thin sample cannot read as a pattern.',
});
add('compare_transition_windows', 'Compare Transition Windows', 19, 'adv_transition_windows', {
    output: 'Number',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9), num('N', 'ticks per window', 50, 25, 500), num('MINIMUM', 'observations per window', 20, 1, 1000)],
    help: 'The A → B rate in the newer window minus the older one, in percentage points. Inconclusive when either window holds too few transitions to judge.',
});
add('transition_sample', 'Require Transition Sample Minimum', 19, 'adv_transition_sample', {
    output: 'Condition',
    fields: [digit(), num('N', 'observed A → next tick', 20, 1, 1000)],
    help: 'True only once that digit has been followed by a next tick at least N times, so the transition maths has a real base.',
});
[
    ['over', 'Compare Over 1 Pattern', 'The observed outcome frequency of the Over 1 observations this session completed. Passes once each half of those observations holds MINIMUM completed setups.'],
    ['under', 'Compare Under 8 Pattern', 'The observed outcome frequency of the Under 8 observations this session completed. Passes once each half of those observations holds MINIMUM completed setups.'],
    ['matches', 'Compare Matches Candidate', 'The observed outcome frequency of the Matches observations for the digit you set. Passes once each half of those observations holds MINIMUM completed setups.'],
    ['differs', 'Compare Differs Candidate', 'The observed outcome frequency of the Differs observations for the digit you set. Passes once each half of those observations holds MINIMUM completed setups.'],
    ['even', 'Compare Even Strategy', 'The observed outcome frequency of the Even observations this session completed. Passes once each half of those observations holds MINIMUM completed setups.'],
    ['odd', 'Compare Odd Strategy', 'The observed outcome frequency of the Odd observations this session completed. Passes once each half of those observations holds MINIMUM completed setups.'],
].forEach(([strategy, label, help]) =>
    add(`research_${strategy}`, label, 20, 'research_candidate', {
        output: 'Number',
        fields: [pick('STRATEGY', 'candidate', [strategy]), digit(), num('MINIMUM', 'completed setups per half-window', 10, 1, 500)],
        help: `${help} Descriptive frequency only — it never signals a trade on its own.`,
    })
);
add('research_windows', 'Compare Strategy Across Windows', 20, 'research_windows', {
    fields: [num('N', 'ticks per window', 250, 25, 500), num('MINIMUM', 'completed setups per half-window', 10, 1, 500)],
    help: 'Journals every strategy’s observed outcome rate in the older and newer window of N ticks each, so you can see which observation held up. It describes results; it never trades.',
});
add('research_rank', 'Rank Strategies By Observed Results', 20, 'research_rank', {
    fields: [num('MINIMUM', 'completed setups per half-window', 10, 1, 500)],
    help: 'Journals the armed strategies ordered by their observed outcome frequency this session, once each half-window holds MINIMUM completed setups. A description of what happened, not a recommendation.',
});
add('research_explain', 'Explain Strategy Comparison', 20, 'research_explain', {
    help: 'Writes one journal line summarising what each strategy has genuinely observed so far in this session.',
});
[
    ['monitor_start', 'Start Monitoring', 'monitor_start', 'Starts the observer program again from the next genuine tick; monitoring is on by default at run start.'],
    ['monitor_pause', 'Pause Monitoring', 'pause', 'Pauses the observer program: events are skipped until Resume Monitoring runs.'],
    ['monitor_resume', 'Resume Monitoring', 'monitor_resume', 'Clears the pause so the observer program runs again on the next genuine tick.'],
    ['monitor_stop', 'Stop Monitoring', 'stop', 'Stops the observer program and the bot; pending observations close as Inconclusive.'],
    ['next_genuine', 'Wait For Next Genuine Tick', 'next_genuine', 'Ends this sequence here and lets the next genuine tick start a fresh one.'],
    ['subsequent', 'Evaluate Subsequent Tick', 'pattern_subsequent', 'Arms an observation of the next genuine tick for the current strategy, so the outcome is recorded instead of guessed.'],
    ['record_setup', 'Record Setup', 'pattern_record_setup', 'Writes the detected setup — market, strategy, digit and barrier — into the journal, if one is waiting to be recorded.'],
    ['record_outcome', 'Record Observed Outcome', 'pattern_record', 'Resolves the oldest pending observation on the spot instead of waiting for its tick, and records the outcome.'],
    ['allow_next', 'Allow Next Setup', 'pattern_allow_next', 'Clears the one-setup-per-pass guard so the next detected setup may be recorded without a full restart.'],
    ['explain_rejection', 'Explain Why Setup Was Rejected', 'pattern_explain', 'Journals the current stage, how many evaluations are pending and the reason the last setup was turned down.'],
].forEach(([id, label, op, help]) => add(id, label, 21, op, { help }));
add('pattern_cooldown', 'Start Cooldown', 21, 'pattern_cooldown', {
    fields: [num('N', 'ticks after outcome', 0, 0, 1000)],
    help: 'Starts a cooldown of N genuine ticks after an observation completes; no new setup is recorded while it runs.',
});
add('pattern_minimum', 'Require Pattern Historical Sample', 21, 'pattern_minimum', {
    fields: [num('N', 'ticks before detection', 25, 1, 1000)],
    help: 'Sets how many genuine ticks must be observed before the pattern detector may act, so it never judges a pattern on a fresh session.',
});
add('report_text', 'Explain Text Value', 21, 'report_value', {
    inputs: { VALUE: 'String' },
    help: 'Writes the connected text into the journal with its label, so a run’s decisions can be read back.',
});
add('report_statistic', 'Report Statistic', 21, 'report_value', {
    inputs: { VALUE: 'Number' },
    help: 'Writes the connected number into the journal with its label — the quickest way to watch a reading live.',
});
add('report_digits', 'Explain Digit Window', 21, 'report_value', {
    inputs: { VALUE: 'Digits' },
    help: 'Prints the connected digit list into the journal in chronological order, oldest first.',
});

/* -------------------------------------------------------------------------------------------
 * Consolidated blocks.
 *
 * The palette had grown a family of near-copies: five single-choice "Is Waiting For …" stage
 * checks, three near-identical "Detect N Consecutive …" starters, two one-choice parity
 * confirmations, two one-choice parity frequency checks and six "Compare … Pattern" candidates
 * that differed only in a dropdown value. Each family is now one block whose field says which
 * case it is, which is both shorter to browse and easier to read on the canvas.
 * ----------------------------------------------------------------------------------------- */
const PATTERN_STAGES = ['Waiting for pair', 'Waiting for confirmation', 'Setup detected', 'Evaluation pending', 'Cooldown'];

add('pattern_stage_is', 'Pattern Stage Is', 16, 'adv_state', {
    output: 'Condition',
    fields: [pick('STAGE', 'stage', PATTERN_STAGES)],
    help: 'True when the pattern detector is in the stage you pick — Waiting for pair, Waiting for confirmation, Setup detected, Evaluation pending or Cooldown — so one block decides what to do at each point of the cycle.',
});
add('detect_run', 'Detect Consecutive Run', 15, 'pattern_detect_run', {
    fields: [
        pick('KIND', 'run of', ['Identical digits', 'Even digits', 'Odd digits']),
        num('N', 'run length', 3, 1, 1000),
    ],
    help: 'Starts watching the detector when the newest N ticks all ended the same way — the same digit, all even, or all odd. The confirmation rule is set separately with Wait For Confirmation Digit or Wait For Configured Parity.',
});
add('check_parity_frequency', 'Check Parity Frequency', 18, 'adv_parity_frequency', {
    output: 'Condition',
    fields: [pick('PARITY', 'parity', ['Even', 'Odd']), num('PERCENT', 'at least %', 50, 0, 100)],
    help: 'True when the parity you pick took at least the share you set of the analysis window — the parity counterpart of Digit Frequency At Or Above, in one block instead of one per parity.',
});
add('research_candidate', 'Compare Strategy Candidate', 20, 'research_candidate', {
    output: 'Number',
    fields: [
        pick('STRATEGY', 'candidate', ['over', 'under', 'matches', 'differs', 'even', 'odd']),
        digit(),
        num('MINIMUM', 'completed setups per half-window', 10, 1, 500),
    ],
    help: 'The observed outcome frequency of the candidate you pick, older half-window against newer half, from observations this session really completed. Inconclusive until each half holds the minimum; descriptive frequency only, never a probability.',
});

/* -------------------------------------------------------------------------------------------
 * Advanced reads.
 *
 * These add what the palette had no block for: how long a digit has been missing (gap), how the
 * parity of the newest ticks is running, how repetitive the window is, where a digit sits in the
 * window's ranking, and how clustered the window is (Shannon entropy). Every one is a
 * deterministic measure of observed ticks and says Inconclusive rather than guessing.
 * ----------------------------------------------------------------------------------------- */
add('digit_gap', 'Read Ticks Since Digit Last Appeared', 17, 'adv_gap', {
    output: 'Number',
    fields: [digit()],
    help: 'How many genuine ticks have passed since that digit was last the final digit; 0 means the newest tick ended in it. Inconclusive until that digit has appeared once this session, so it never reads as a fake zero.',
});
add('frequency_rank', 'Check Digit Frequency Rank', 17, 'adv_frequency_rank', {
    output: 'Condition',
    fields: [digit(), pick('RANK', 'rank', ['top', 'bottom']), num('N', 'digits', 3, 1, 10)],
    help: 'True when that digit sits among the most (top) or least (bottom) frequent digits of the analysis window. Ties choose the lower digit, so one window always gives the same ranking.',
});
add('entropy', 'Get Window Entropy', 17, 'adv_entropy', {
    output: 'Number',
    help: 'Shannon entropy of the analysis window in bits: 0 means one digit took every tick, and 3.32 is a perfectly even spread. It describes how clustered the window is — never a prediction of the next tick.',
});
add('entropy_state', 'Check Window Randomness', 17, 'adv_entropy_state', {
    output: 'Condition',
    fields: [pick('STATE', 'state', ['Clustered', 'Random'])],
    help: 'True when the window’s entropy says the digits are clustered (below the structural threshold, some digits dominating) or random (at or above it, an even spread). It reads the same 2.95-bit boundary the Digits page uses and guards itself with Inconclusive on an empty window.',
});
add('parity_run', 'Read Current Parity Run', 19, 'adv_parity_run', {
    output: 'Number',
    help: 'How many of the newest ticks in a row share the same parity — the length of the even run or the odd run the newest tick belongs to. 1 means the parity just changed.',
});
add('parity_switches', 'Count Parity Switches', 19, 'adv_parity_switches', {
    output: 'Number',
    fields: [num('N', 'ticks (0 = whole window)', 50, 0, 1000)],
    help: 'How many times parity changed between consecutive ticks inside the newest N ticks; 0 reads the whole observed window. A high count is choppy parity, a low one is long even or odd runs.',
});
add('repeat_rate', 'Get Digit Repeat Rate', 19, 'adv_repeat_rate', {
    output: 'Number',
    fields: [num('N', 'ticks (0 = whole window)', 50, 0, 1000)],
    help: 'The share of adjacent tick pairs in the window that ended in the same digit, in percent; 0 reads the whole observed window. A fair window sits near 10%, so a very high or very low reading describes how repetitive the window is.',
});

/* -------------------------------------------------------------------------------------------
 * Palette pruning.
 *
 * These blocks stay REGISTERED — the flag only keeps them out of the Blocks menu and the Blocks
 * help, so a saved workspace that still carries one validates and runs exactly as before. Their
 * ops stay in `services/observer/` for the same reason the renamed ops do (see the
 * "older saved configurations" tests). Each entry notes the block that replaces it.
 * ----------------------------------------------------------------------------------------- */
const SUPERSEDED = [
    // Kept registered; the listed block already does the same thing.
    'obs_previous', // Read Digit N Ticks Ago (N = 1)
    'obs_digit_frequency', // Get Digit Frequency Percentage
    'obs_digit_count', // Get Digit Occurrence Count
    'obs_combined_frequency', // Get Combined Digit Frequency
    'obs_transition', // Get Digit Transition Frequency (the sampled block below)
    'obs_frequency_transition', // Get Digit Transition Frequency
    'obs_frequency_stability', // Digit Is Stable Across N Windows
    'obs_compare_frequency_windows', // Get Digit Frequency Change
    'obs_read_digit_streak', // Get Current Digit Streak
    'obs_current_streak_length', // Get Current Digit Streak
    'obs_find_digit_streak', // Get Longest Digit Streak
    'obs_longest_historical_streak', // Get Longest Digit Streak
    'obs_stat_minimum', // Check Minimum Sample Size
    'obs_pattern_parity_stability', // Check Parity Stability
    'obs_genuine_tick', // When New Tick Arrives
    'obs_emit_parity', // Emit Setup Detected
    'obs_reset_session', // Reset Analysis State
    'obs_reset_to_pair', // Reset Pattern Detector
    'obs_new_cycle', // Reset Pattern Detector
    'obs_continue', // no-op marker: the sequence already carries on to the next block
    'obs_use_market', // no-op marker: the market is set once, in Trade parameters
    'obs_next_genuine', // End Current Evaluation
    'obs_monitor_start', // Resume Monitoring
    'obs_monitor_pause', // Pause Bot
    'obs_monitor_stop', // Stop Bot
    // Replaced by one parameterised block.
    'obs_waiting_pair', // Pattern Stage Is
    'obs_waiting_confirmation', // Pattern Stage Is
    'obs_setup_detected', // Pattern Stage Is
    'obs_evaluation_pending', // Pattern Stage Is
    'obs_in_cooldown', // Pattern Stage Is
    'obs_even_run', // Detect Consecutive Run
    'obs_odd_run', // Detect Consecutive Run
    'obs_identical', // Detect Consecutive Run
    'obs_even_confirmation', // Wait For Configured Parity
    'obs_odd_confirmation', // Wait For Configured Parity
    'obs_check_even_frequency', // Check Parity Frequency
    'obs_check_odd_frequency', // Check Parity Frequency
    'obs_research_over', // Compare Strategy Candidate
    'obs_research_under', // Compare Strategy Candidate
    'obs_research_matches', // Compare Strategy Candidate
    'obs_research_differs', // Compare Strategy Candidate
    'obs_research_even', // Compare Strategy Candidate
    'obs_research_odd', // Compare Strategy Candidate
];
const SUPERSEDED_TYPES = new Set(SUPERSEDED);
BLOCKS.forEach(spec => {
    if (SUPERSEDED_TYPES.has(spec.type)) spec.hidden = true;
});

/**
 * The four Blocks-menu groups the observer palette is presented under. Every catalogue category
 * belongs to exactly one group.
 */
export const GROUPS = [
    {
        id: 'observer_digit_frequency',
        name: 'Digit & frequency',
        colour: '#1d7c8c',
        colourSecondary: '#16606d',
        colourTertiary: '#124c56',
        categories: [
            'Digits',
            'Digit Conditions',
            'Frequency & Stability',
            'Matches & Differs',
            'Over & Under',
            'Even & Odd',
            'Digit Statistics',
        ],
    },
    {
        id: 'observer_pattern_parity',
        name: 'Pattern detection & parity',
        colour: '#6d4bb5',
        colourSecondary: '#563b90',
        colourTertiary: '#442f73',
        categories: ['Pattern Detector', 'Pattern State', 'Even/Odd Patterns', 'Streaks & Transitions'],
    },
    {
        id: 'observer_control',
        name: 'Observer control',
        colour: '#2f6fbb',
        colourSecondary: '#255794',
        colourTertiary: '#1d4576',
        categories: ['Bot Control', 'Market Selection', 'Logic & Comparison', 'Variables'],
    },
    {
        id: 'observer_entry_monitoring',
        name: 'Entry & monitoring',
        colour: '#b06a1f',
        colourSecondary: '#8c5418',
        colourTertiary: '#704312',
        categories: [
            'Entry Conditions',
            'Restart & Cooldown',
            'Stop & Safety',
            'Learning & Observation',
            'Notifications',
            'Observational Controls',
            'Strategy Comparison',
        ],
    },
];

export const GROUP_OF_CATEGORY = new Map(GROUPS.flatMap(group => group.categories.map(category => [category, group])));
export const groupFor = spec => GROUP_OF_CATEGORY.get(spec.category);

/**
 * The blocks a group offers in the palette: superseded duplicates are left out, since they are
 * only kept registered so an older saved workspace still validates. The Blocks help reads the same
 * list, so the guide and the palette can never disagree about what a group holds.
 */
export const blocksInGroup = group => BLOCKS.filter(spec => !spec.hidden && group.categories.includes(spec.category));

/** A group's blocks split under one heading per catalogue category, in the order the group lists them. */
export const subcategoriesInGroup = group =>
    group.categories
        .map(category => ({ category, blocks: blocksInGroup(group).filter(spec => spec.category === category) }))
        .filter(entry => entry.blocks.length > 0);

export const SPEC = new Map(BLOCKS.map(block => [block.type, block]));
export const defaults = type => Object.fromEntries((SPEC.get(type)?.fields ?? []).map(field => [field.name, field.value]));
