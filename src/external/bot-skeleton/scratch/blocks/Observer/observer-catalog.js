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
        help: `${label}. Evaluated only on a real market event; missing data is Inconclusive.`,
        ...options,
    });
}
['start', 'market', 'tick', 'window', 'setup', 'complete', 'lost', 'restored', 'resume'].forEach((event, i) =>
    add(
        `on_${event}`,
        [
            'When Bot Starts',
            'When Market Changes',
            'When New Tick Arrives',
            'When Analysis Window Updates',
            'When Setup Is Detected',
            'When Setup Evaluation Completes',
            'When Data Connection Is Lost',
            'When Data Connection Is Restored',
            'When Bot Is Resumed',
        ][i],
        0,
        'event',
        { event, body: true }
    )
);
add('if', 'IF condition', 0, 'if', { inputs: { CONDITION: 'Condition' }, body: true });
add('if_else', 'IF / ELSE', 0, 'if_else', { inputs: { CONDITION: 'Condition' }, body: true });
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
add('continue', 'Continue Monitoring', 0, 'continue');
add('end', 'End Current Evaluation', 0, 'end');
add('reset', 'Reset Analysis State', 0, 'reset');
add('market_ready', 'Require Market Data Ready', 1, 'ready', { output: 'Condition' });
add('fresh', 'Check Market Data Freshness', 1, 'fresh', { output: 'Condition' });
add('connected', 'Check Market Connection', 1, 'connected', { output: 'Condition' });
[
    ['market_name', 'Read Market Name', 'market_name', 'String'],
    ['symbol', 'Read Market Symbol', 'symbol', 'String'],
    ['price', 'Read Current Price', 'price', 'Number'],
    ['timestamp', 'Read Last Tick Timestamp', 'timestamp', 'Number'],
].forEach(([id, label, op, output]) => add(id, label, 1, op, { output }));
add('use_market', 'Use Currently Selected Market', 1, 'use_market');
add('latest', 'Read Latest Final Digit', 2, 'latest', { output: 'Number' });
add('previous', 'Read Previous Final Digit', 2, 'ago', { output: 'Number', fields: [num('N', 'ticks ago', 1, 1, 999)] });
add('ago', 'Read Digit N Ticks Ago', 2, 'ago', { output: 'Number', fields: [num('N', 'ticks ago', 2, 0, 999)] });
add('last_digits', 'Read Last N Digits', 2, 'last_digits', { output: 'Digits', fields: [num('N', 'ticks', 25, 1)] });
add('count', 'Read Tick Count', 2, 'count', { output: 'Number' });
add('window', 'Read Current Analysis Window', 2, 'window', { output: 'Number' });
add('occurrences', 'Get Digit Occurrence Count', 2, 'occurrences', { output: 'Number', fields: [digit()] });
add('frequency', 'Get Digit Frequency Percentage', 2, 'frequency', { output: 'Number', fields: [digit()] });
add('combined', 'Get Combined Digit Frequency', 2, 'combined', { output: 'Number', fields: [text('DIGITS', 'digits', '0,1,2')] });
add('change', 'Get Digit Frequency Change', 2, 'change', { output: 'Number', fields: [digit()] });
add('streak', 'Get Current Digit Streak', 2, 'streak', { output: 'Number' });
add('longest', 'Get Longest Digit Streak', 2, 'longest', { output: 'Number' });
[
    ['even_frequency', 'Get Even Frequency', 'even_frequency'],
    ['odd_frequency', 'Get Odd Frequency', 'odd_frequency'],
    ['low_frequency', 'Get Low Digit Frequency', 'low_frequency'],
    ['high_frequency', 'Get High Digit Frequency', 'high_frequency'],
].forEach(([id, label, op]) => add(id, label, 2, op, { output: 'Number' }));
add('transition', 'Get Digit Transition Frequency', 2, 'transition', {
    output: 'Number',
    fields: [digit(), num('TO', 'followed by', 3, 0, 9)],
});
[
    ['equals', 'Latest Digit Equals', 'eq'],
    ['differs', 'Latest Digit Differs From', 'ne'],
    ['greater', 'Latest Digit Greater Than', 'gt'],
    ['less', 'Latest Digit Less Than', 'lt'],
    ['previous_equals', 'Previous Digit Equals', 'previous_eq'],
].forEach(([id, label, op]) => add(id, label, 3, op, { output: 'Condition', fields: [digit()] }));
add('even', 'Latest Digit Is Even', 3, 'even', { output: 'Condition' });
add('odd', 'Latest Digit Is Odd', 3, 'odd', { output: 'Condition' });
add('sequence', 'Digit Sequence Matches Pattern', 3, 'sequence', {
    output: 'Condition',
    fields: [text('DIGITS', 'oldest → newest', '2,7,4')],
    help: '2,7,4 means the most recent three digits in chronological order. Insufficient ticks is Inconclusive.',
});
[
    ['contains', 'Last N Digits Contain Selected Digit', 'contains'],
    ['not_contains', 'Last N Digits Do Not Contain Selected Digit', 'not_contains'],
    ['consecutive', 'Digit Appeared Consecutively N Times', 'consecutive'],
].forEach(([id, label, op]) => add(id, label, 3, op, { output: 'Condition', fields: [digit(), num('N', 'ticks', 3, 1)] }));
add('streak_at_least', 'Current Digit Streak At Least N', 3, 'streak_at_least', {
    output: 'Condition',
    fields: [num('N', 'ticks', 3, 1)],
});
['below', 'at_or_below', 'above', 'at_or_above'].forEach((op, i) =>
    add(`freq_${op}`, `Digit Frequency ${['Below', 'At Or Below', 'Above', 'At Or Above'][i]}`, 4, `freq_${op}`, {
        output: 'Condition',
        fields: [digit(), num('PERCENT', '%', 15, 0, 100)],
    })
);
['below', 'at_or_below'].forEach(op =>
    add(`combined_${op}`, `Combined Digit Frequency ${op === 'below' ? 'Below' : 'At Or Below'}`, 4, `combined_${op}`, {
        output: 'Condition',
        fields: [text('DIGITS', 'digits', '0,1,2'), num('PERCENT', '%', 35, 0, 100)],
    })
);
add('stable', 'Digit Is Stable Across N Windows', 4, 'stable', {
    output: 'Condition',
    fields: [digit(), num('N', 'non-overlapping windows', 2, 2, 10), num('TOLERANCE', 'percentage-point tolerance', 5, 0, 100)],
    help: 'Compare full non-overlapping windows; max frequency minus min frequency must be within tolerance. Low frequency alone is not stability.',
});
add('min_sample', 'Check Minimum Sample Size', 4, 'sample', { output: 'Condition', fields: [num('N', 'ticks', 100, 1)] });
add('frequency_change', 'Frequency Change Within Tolerance', 4, 'frequency_change', {
    output: 'Condition',
    fields: [digit(), num('TOLERANCE', 'percentage points', 5, 0, 100)],
});
['and', 'or'].forEach(op => add(op, op.toUpperCase(), 5, op, { output: 'Condition', inputs: { A: 'Condition', B: 'Condition' } }));
add('not', 'NOT', 5, 'not', { output: 'Condition', inputs: { A: 'Condition' } });
[
    ['equal', 'Equals', 'eq'],
    ['not_equal', 'Does Not Equal', 'ne'],
    ['gt', 'Greater Than', 'gt'],
    ['lt', 'Less Than', 'lt'],
    ['gte', 'Greater Than Or Equal To', 'gte'],
    ['lte', 'Less Than Or Equal To', 'lte'],
].forEach(([id, label, op]) =>
    add(`compare_${id}`, label, 5, `compare_${op}`, { output: 'Condition', inputs: { A: 'Number', B: 'Number' } })
);
add('number', 'Number', 5, 'number', { output: 'Number', fields: [num('VALUE', 'value', 10, -1000000, 1000000)] });
add('between', 'Is Between', 5, 'between', {
    output: 'Condition',
    inputs: { A: 'Number' },
    fields: [num('LOW', 'inclusive low', 0, -1000000, 1000000), num('HIGH', 'inclusive high', 9, -1000000, 1000000)],
});
['matches', 'differs', 'over', 'under', 'even', 'odd'].forEach((strategy, i) => {
    const category = i < 2 ? 6 : i < 4 ? 7 : 8;
    add(`configure_${strategy}`, `Configure ${strategy[0].toUpperCase() + strategy.slice(1)} Strategy`, category, `configure_${strategy}`);
    add(`evaluate_${strategy}`, `Evaluate Next Tick For ${strategy[0].toUpperCase() + strategy.slice(1)}`, category, `observe_${strategy}`, {
        help: 'Observe subsequent genuine ticks only, with strategy and digit/barrier fixed in the original setup snapshot.',
    });
});
add('set_digit', 'Set Match / Excluded Digit', 6, 'set_digit', { fields: [digit()] });
add('suggest_digit', 'Use Suggested Match / Differs Digit', 6, 'suggest_digit', {
    fields: [pick('RANK', 'ranking', ['lowest-frequency', 'highest-frequency'])],
    help: 'Choose the lowest/highest frequency digit from the current window; ties choose the lower digit. This does not predict the next tick.',
});
add('selected_digit', 'Read Selected Digit', 6, 'selected_digit', { output: 'Number' });
add('set_barrier', 'Set Barrier', 7, 'set_barrier', {
    fields: [num('BARRIER', 'barrier', 2, 0, 9)],
    help: 'Over is strictly greater; Under strictly less. The barrier digit qualifies for neither. Over 0–8; Under 1–9.',
});
add('barrier', 'Read Barrier', 7, 'barrier', { output: 'Number' });
add('parity_stable', 'Check Parity Stability', 8, 'parity_stable', {
    output: 'Condition',
    fields: [num('N', 'non-overlapping windows', 2, 2, 10), num('TOLERANCE', 'percentage points', 5, 0, 100)],
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
    ['require_sample', 'Require Minimum Sample Size', 'sample'],
    ['require_fresh', 'Require Fresh Market Data', 'fresh'],
    ['no_pending', 'Require No Pending Evaluation', 'no_pending'],
    ['cooldown_complete', 'Require Cooldown Complete', 'cooldown_complete'],
    ['no_duplicate', 'Require No Duplicate Setup', 'no_duplicate'],
    ['selected', 'Require Selected Digit', 'selected'],
    ['setup_limit', 'Check Maximum Setups Per Session', 'setup_limit'],
].forEach(([id, label, op]) => add(id, label, 9, op, { output: 'Condition', fields: op === 'sample' ? [num('N', 'ticks', 100, 1)] : [] }));
add('restart', 'Restart Monitoring', 10, 'restart', {
    help: 'Allow a new setup on a subsequent tick after the existing evaluation and cooldown. Never clears the journal.',
});
add('cooldown_ticks', 'Restart After N New Ticks', 10, 'cooldown_ticks', { fields: [num('N', 'ticks', 5, 0)] });
add('cooldown_seconds', 'Restart After Cooldown', 10, 'cooldown_seconds', { fields: [num('N', 'seconds', 5, 0, 86400)] });
add('consecutive_pass', 'Require Conditions To Pass N Consecutive Times', 10, 'consecutive_pass', {
    output: 'Condition',
    inputs: { CONDITION: 'Condition' },
    fields: [num('N', 'evaluations', 2, 1)],
});
add('consecutive_fail', 'Require Conditions To Fail N Consecutive Times', 10, 'consecutive_fail', {
    output: 'Condition',
    inputs: { CONDITION: 'Condition' },
    fields: [num('N', 'evaluations', 2, 1)],
});
add('reset_counters', 'Reset Consecutive Counters', 10, 'reset_counters');
add('reset_streak', 'Reset Streak Counter', 10, 'reset_streak');
[
    ['pause', 'Pause Bot', 'pause'],
    ['stop', 'Stop Bot', 'stop'],
    ['reset_session', 'Reset Session State', 'reset'],
    ['stale_stop', 'Stop When Data Becomes Stale', 'stale_stop'],
    ['connection_stop', 'Stop When Market Connection Fails', 'connection_stop'],
].forEach(([id, label, op]) => add(id, label, 11, op));
add('stop_setups', 'Stop After N Setups', 11, 'stop_setups', { fields: [num('N', 'setups', 10, 1, 500)] });
add('stop_evaluations', 'Stop After N Evaluations', 11, 'stop_evaluations', { fields: [num('N', 'evaluations', 10, 1, 500)] });
add('stop_duration', 'Stop After Session Duration', 11, 'stop_duration', { fields: [num('N', 'seconds', 600, 1, 86400)] });
add('observe', 'Observe Next N Genuine Ticks', 12, 'observe', { fields: [num('N', 'ticks', 1, 1, 100)] });
add('inconclusive', 'Mark Evaluation Inconclusive', 12, 'inconclusive');
add('historical_sample', 'Read Historical Sample Size', 12, 'historical_sample', { output: 'Number' });
add('historical_frequency', 'Calculate Historical Outcome Frequency', 12, 'historical_frequency', {
    output: 'Number',
    help: 'Completed observations for this market and strategy only. Descriptive frequency, not a probability guarantee.',
});
add('note', 'Add Journal Note', 13, 'note', { fields: [text('TEXT', 'note', 'Condition checked')] });
add('notification', 'Show In-App Notification', 13, 'note', {
    fields: [text('TEXT', 'message', 'Setup detected')],
    help: 'Timestamped trace message, deduplicated until the message changes.',
});
add('set_variable', 'Set Number Variable', 14, 'set_variable', { fields: [text('NAME', 'name', 'counter')], inputs: { VALUE: 'Number' } });
add('variable', 'Read Number Variable', 14, 'variable', { fields: [text('NAME', 'name', 'counter')], output: 'Number' });
add('increase', 'Increase Counter', 14, 'increase', { fields: [text('NAME', 'name', 'counter'), num('N', 'by', 1, -1000, 1000)] });
add('reset_counter', 'Reset Counter', 14, 'reset_counter', { fields: [text('NAME', 'name', 'counter')] });
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
add('genuine_tick', 'When New Genuine Tick Arrives', 15, 'event', { event: 'tick', body: true });
add('pair', 'Detect Consecutive Digit Pair', 15, 'pattern_detect_pair', {
    fields: [pick('PAIRS', 'adjacent pairs', ['00 / 11', '88 / 99', '00', '11', '88', '99'])],
});
add('identical', 'Detect N Consecutive Identical Digits', 15, 'pattern_detect_identical', { fields: [num('N', 'run length', 2, 2, 1000)] });
add('confirmation', 'Wait For Confirmation Digit', 15, 'pattern_confirm_digit', { fields: [num('DIGIT', 'digit', 0, 0, 9)] });
add('intervening', 'Allow Intervening Digits', 15, 'pattern_intervening', { fields: [pick('ALLOW', 'allowed', ['Yes', 'No'])] });
add('confirmation_wait', 'Set Maximum Confirmation Wait', 15, 'pattern_timeout', { fields: [num('N', 'ticks (0 = unlimited)', 0, 0, 100000)] });
add('confirmation_after', 'Check Confirmation Occurred After Pair', 15, 'adv_confirmation_after', { output: 'Condition' });
add('emit_setup', 'Emit Setup Detected', 15, 'pattern_emit');
add('reset_pattern', 'Reset Pattern Detector', 15, 'pattern_reset');
add('prevent_duplicate', 'Prevent Duplicate Setup', 15, 'pattern_deduplicate', {
    help: 'One instance per adjacent run and one outcome per confirmation, including across restarts. Always enforced by the engine.',
});
add('barrier_outcome', 'Evaluate Next Tick Against Barrier', 15, 'pattern_barrier', {
    fields: [pick('RULE', 'strict condition', ['Over 1', 'Under 8'])],
});
add('pattern_stage', 'Read Pattern Stage', 16, 'adv_stage', { output: 'String' });
[
    ['waiting_pair', 'Is Waiting For Pair', 'Waiting for pair'],
    ['waiting_confirmation', 'Is Waiting For Confirmation', 'Waiting for confirmation'],
    ['setup_detected', 'Is Setup Detected', 'Setup detected'],
    ['evaluation_pending', 'Is Evaluation Pending', 'Evaluation pending'],
    ['in_cooldown', 'Is In Cooldown', 'Cooldown'],
].forEach(([id, label, stage]) =>
    add(id, label, 16, 'adv_state', { output: 'Condition', fields: [{ ...pick('STAGE', 'stage', [stage]), value: stage }] })
);
add('reset_to_pair', 'Reset To Waiting For Pair', 16, 'pattern_reset');
add('new_cycle', 'Start New Pattern Cycle', 16, 'pattern_reset');
add('analyse_window', 'Analyse Last N Ticks', 17, 'adv_window', { fields: [num('N', 'window (25–1000)', 100, 25, 1000)] });
[
    ['digit_frequency', 'Get Frequency Of Digit', 'frequency'],
    ['digit_count', 'Get Count Of Digit', 'count'],
].forEach(([id, label, op]) => add(id, label, 17, `adv_${op}`, { output: 'Number', fields: [digit()] }));
add('most_frequent', 'Find Most Frequent Digit', 17, 'adv_most', { output: 'Number' });
add('least_frequent', 'Find Least Frequent Digit', 17, 'adv_least', { output: 'Number' });
add('combined_frequency', 'Get Combined Frequency', 17, 'adv_combined', { output: 'Number', fields: [text('DIGITS', 'digits', '0,1')] });
add('compare_frequency_windows', 'Compare Frequencies Between Windows', 17, 'adv_frequency_windows', {
    output: 'Number',
    fields: [digit(), num('N', 'ticks per disjoint window', 50, 25, 500)],
});
add('frequency_stability', 'Check Frequency Stability', 17, 'adv_stability', {
    output: 'Condition',
    fields: [digit(), num('N', 'ticks per window', 50, 25, 500), num('TOLERANCE', 'percentage points', 5, 0, 100)],
});
add('read_digit_streak', 'Read Current Digit Streak', 17, 'adv_streak', { output: 'Number' });
add('find_digit_streak', 'Find Longest Digit Streak', 17, 'adv_longest', { output: 'Number' });
add('transition_frequency', 'Get Digit Transition Frequency', 17, 'adv_transition_frequency', {
    output: 'Number',
    fields: [digit(), num('TO', 'followed by', 3, 0, 9), num('MINIMUM', 'observations', 20, 1, 1000)],
});
add('stat_minimum', 'Check Minimum Sample Size', 17, 'sample', { output: 'Condition', fields: [num('N', 'genuine ticks', 100, 1, 1000)] });
add('pattern_parity_stability', 'Check Parity Stability', 18, 'parity_stable', {
    output: 'Condition',
    fields: [num('N', 'non-overlapping windows', 2, 2, 10), num('TOLERANCE', 'percentage points', 5, 0, 100)],
});
add('latest_parity', 'Read Latest Digit Parity', 18, 'adv_parity', { output: 'String' });
add('even_run', 'Detect N Consecutive Even Digits', 18, 'pattern_detect_even', { fields: [num('N', 'run length', 3, 1, 1000)] });
add('odd_run', 'Detect N Consecutive Odd Digits', 18, 'pattern_detect_odd', { fields: [num('N', 'run length', 3, 1, 1000)] });
add('even_confirmation', 'Wait For Even Confirmation', 18, 'pattern_confirm_even');
add('odd_confirmation', 'Wait For Odd Confirmation', 18, 'pattern_confirm_odd');
add('parity_confirmation', 'Wait For Configured Parity', 18, 'pattern_confirm_parity', {
    fields: [pick('PARITY', 'confirmation', ['Even', 'Odd', 'Either'])],
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
});
add('parity_sequence', 'Detect Configured Parity Transitions', 18, 'pattern_detect_transitions', {
    fields: [text('PARITIES', 'oldest → newest', 'Even,Odd,Even')],
});
add('check_parity_transition', 'Check Parity Transition', 18, 'adv_parity_transition', {
    output: 'Condition',
    fields: [pick('FROM', 'from', ['Even', 'Odd']), pick('TO_PARITY', 'followed by', ['Odd', 'Even'])],
});
['Even', 'Odd'].forEach(parity =>
    add(`check_${parity.toLowerCase()}_frequency`, `Check ${parity} Frequency`, 18, 'adv_parity_frequency', {
        output: 'Condition',
        fields: [pick('PARITY', 'parity', [parity]), num('PERCENT', 'at least %', 50, 0, 100)],
    })
);
add('emit_parity', 'Emit Even/Odd Setup', 18, 'pattern_emit');
add('parity_outcome', 'Evaluate Next Tick Parity', 18, 'pattern_parity_outcome', { fields: [pick('PARITY', 'target', ['Odd', 'Even'])] });
add('current_streak_length', 'Current Streak Length', 19, 'adv_streak', { output: 'Number' });
add('longest_historical_streak', 'Longest Historical Streak', 19, 'adv_longest', { output: 'Number' });
add('streak_minimum', 'Streak Is At Least N', 19, 'adv_streak_minimum', { output: 'Condition', fields: [num('N', 'length', 3, 1, 1000)] });
add('streak_ended', 'Streak Just Ended', 19, 'adv_streak_ended', { output: 'Condition' });
add('parity_switched', 'Parity Switched', 19, 'adv_parity_switched', { output: 'Condition' });
add('digit_repeated', 'Digit Repeated', 19, 'adv_repeated', { output: 'Condition' });
add('digit_transition', 'Digit Transition From A To B', 19, 'adv_transition_now', {
    output: 'Condition',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9)],
});
add('count_transition', 'Count A Followed By B', 19, 'adv_transition_count', {
    output: 'Number',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9)],
});
add('frequency_transition', 'Frequency Of B After A', 19, 'adv_transition_frequency', {
    output: 'Number',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9), num('MINIMUM', 'observations', 20, 1, 1000)],
});
add('compare_transition_windows', 'Compare Transition Windows', 19, 'adv_transition_windows', {
    output: 'Number',
    fields: [digit(), num('TO', 'B after A', 3, 0, 9), num('N', 'ticks per window', 50, 25, 500), num('MINIMUM', 'observations per window', 20, 1, 1000)],
});
add('transition_sample', 'Require Transition Sample Minimum', 19, 'adv_transition_sample', {
    output: 'Condition',
    fields: [digit(), num('N', 'observed A → next tick', 20, 1, 1000)],
});
[
    ['over', 'Compare Over 1 Pattern'],
    ['under', 'Compare Under 8 Pattern'],
    ['matches', 'Compare Matches Candidate'],
    ['differs', 'Compare Differs Candidate'],
    ['even', 'Compare Even Strategy'],
    ['odd', 'Compare Odd Strategy'],
].forEach(([strategy, label]) =>
    add(`research_${strategy}`, label, 20, 'research_candidate', {
        output: 'Number',
        fields: [pick('STRATEGY', 'candidate', [strategy]), digit(), num('MINIMUM', 'completed setups per half-window', 10, 1, 500)],
    })
);
add('research_windows', 'Compare Strategy Across Windows', 20, 'research_windows', {
    fields: [num('N', 'ticks per window', 250, 25, 500), num('MINIMUM', 'completed setups per half-window', 10, 1, 500)],
});
add('research_rank', 'Rank Strategies By Observed Results', 20, 'research_rank', {
    fields: [num('MINIMUM', 'completed setups per half-window', 10, 1, 500)],
});
add('research_explain', 'Explain Strategy Comparison', 20, 'research_explain');
[
    ['monitor_start', 'Start Monitoring', 'monitor_start'],
    ['monitor_pause', 'Pause Monitoring', 'pause'],
    ['monitor_resume', 'Resume Monitoring', 'monitor_resume'],
    ['monitor_stop', 'Stop Monitoring', 'stop'],
    ['next_genuine', 'Wait For Next Genuine Tick', 'next_genuine'],
    ['subsequent', 'Evaluate Subsequent Tick', 'pattern_subsequent'],
    ['record_setup', 'Record Setup', 'pattern_record_setup'],
    ['record_outcome', 'Record Observed Outcome', 'pattern_record'],
    ['allow_next', 'Allow Next Setup', 'pattern_allow_next'],
    ['explain_rejection', 'Explain Why Setup Was Rejected', 'pattern_explain'],
].forEach(([id, label, op]) => add(id, label, 21, op));
add('pattern_cooldown', 'Start Cooldown', 21, 'pattern_cooldown', { fields: [num('N', 'ticks after outcome', 0, 0, 1000)] });
add('pattern_minimum', 'Require Pattern Historical Sample', 21, 'pattern_minimum', { fields: [num('N', 'ticks before detection', 25, 1, 1000)] });
add('report_text', 'Explain Text Value', 21, 'report_value', { inputs: { VALUE: 'String' } });
add('report_statistic', 'Report Statistic', 21, 'report_value', { inputs: { VALUE: 'Number' } });
add('report_digits', 'Explain Digit Window', 21, 'report_value', { inputs: { VALUE: 'Digits' } });

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
export const blocksInGroup = group => BLOCKS.filter(spec => group.categories.includes(spec.category));
export const SPEC = new Map(BLOCKS.map(block => [block.type, block]));
export const defaults = type => Object.fromEntries((SPEC.get(type)?.fields ?? []).map(field => [field.name, field.value]));
