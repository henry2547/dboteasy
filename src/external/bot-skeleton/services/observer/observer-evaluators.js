/**
 * Value and condition blocks of the observer language, evaluated against a live market snapshot.
 *
 * Every entry takes `(ctx, block, args)` and returns an outcome:
 *   { status: 'Pass' | 'Fail' | 'Inconclusive', value, reason }
 *
 * Rules that keep the language honest about missing data:
 * - a read that has no genuine data behind it is Inconclusive, never 0;
 * - a condition is Pass only when it genuinely holds on observed ticks;
 * - an op with no evaluator here is Inconclusive, and Inconclusive never signals a trade.
 */

/** A digit list can never be longer than the runtime keeps — see the engine's history bound. */
import * as values from './observer-values';

export const MAX_SETUPS_PER_SESSION = 100;
export const DEFAULT_FRESHNESS_SECONDS = 15;

export const pass = (value = true, reason = 'Passed') => ({ status: 'Pass', value, reason });
export const fail = (reason = 'Did not pass') => ({ status: 'Fail', value: false, reason });
export const unknown = (reason = 'Inconclusive: not enough genuine market data yet.') => ({
    status: 'Inconclusive',
    value: null,
    reason,
});
export const read = (value, reason) => ({ status: 'Pass', value, reason });

const NO_TICK = 'Inconclusive: no genuine tick has been observed yet.';
const EMPTY_WINDOW = 'Inconclusive: the analysis window holds no genuine ticks yet.';

/** Reads a number from a socket; null when nothing usable is connected. */
const numericArg = (args, name) => {
    const outcome = args[name];
    if (!outcome || outcome.status !== 'Pass' || !Number.isFinite(Number(outcome.value))) return null;
    return Number(outcome.value);
};

const finite = (value, reason) => (Number.isFinite(value) ? read(value, reason) : unknown(EMPTY_WINDOW));

const windowDigits = ctx => values.windowOf(ctx.digits, ctx.analysis_window);

const conditions = {
    ready: ctx =>
        ctx.market_ready && ctx.connected
            ? pass(true, 'Market data is ready and connected.')
            : fail(`Market data is not ready (${ctx.connected ? 'still loading history' : 'not connected'}).`),
    fresh: ctx => {
        if (!ctx.last_tick) return fail('No genuine tick has arrived yet.');
        const age = (ctx.now - ctx.last_tick.epoch * 1000) / 1000;
        return age <= ctx.freshness_seconds
            ? pass(true, `Latest tick is ${age.toFixed(1)}s old.`)
            : fail(`Latest tick is ${age.toFixed(1)}s old, beyond ${ctx.freshness_seconds}s.`);
    },
    connected: ctx => (ctx.connected ? pass(true, 'Market connection is up.') : fail('Market connection is down.')),
    sample: (ctx, block) =>
        ctx.digits.length >= Number(block.fields.N)
            ? pass(true, `${ctx.digits.length} genuine ticks observed.`)
            : fail(`Only ${ctx.digits.length} genuine ticks observed, ${block.fields.N} required.`),
    no_pending: ctx => (ctx.pending.length ? fail('An evaluation is already pending.') : pass(true, 'No pending evaluation.')),
    cooldown_complete: ctx => (ctx.cooldown_active ? fail('Still in cooldown.') : pass(true, 'Cooldown complete.')),
    no_duplicate: ctx =>
        ctx.duplicate_setup ? fail('This setup was already recorded for the current tick.') : pass(true, 'No duplicate setup.'),
    selected: ctx => (ctx.digit_selected ? pass(true, `Digit ${ctx.digit} is selected.`) : fail('No digit is selected yet.')),
    setup_limit: ctx =>
        ctx.setups < MAX_SETUPS_PER_SESSION
            ? pass(true, `${ctx.setups} of ${MAX_SETUPS_PER_SESSION} setups used.`)
            : fail(`${MAX_SETUPS_PER_SESSION} setups already recorded for this session.`),
    consecutive_pass: (ctx, block, args) => {
        const outcome = conditions.consecutive(ctx, block, args, true);
        return outcome;
    },
    consecutive_fail: (ctx, block, args) => conditions.consecutive(ctx, block, args, false),
};

/** Shared counter behind both "pass N consecutive times" blocks. */
conditions.consecutive = (ctx, block, args, expect_pass) => {
    const inner = args.CONDITION;
    if (!inner) return unknown('Inconclusive: nothing is connected to this condition.');
    const counter = ctx.consecutive.get(block.id) ?? { pass: 0, fail: 0 };
    const matches = expect_pass ? inner.status === 'Pass' : inner.status === 'Fail';
    if (inner.status === 'Inconclusive') return unknown(inner.reason);
    counter[expect_pass ? 'pass' : 'fail'] = matches ? counter[expect_pass ? 'pass' : 'fail'] + 1 : 0;
    ctx.consecutive.set(block.id, counter);
    const required = Math.max(1, Number(block.fields.N));
    const seen = counter[expect_pass ? 'pass' : 'fail'];
    return seen >= required
        ? pass(true, `${seen} consecutive ${expect_pass ? 'passes' : 'failures'}.`)
        : fail(`${seen} of ${required} consecutive ${expect_pass ? 'passes' : 'failures'}.`);
};

const digitComparison = (compare, yes, no) => (ctx, block) => {
    const digit = values.lastDigit(ctx.digits);
    if (digit === null) return unknown(NO_TICK);
    const target = Number(block.fields.DIGIT);
    return compare(digit, target) ? pass(true, `Latest digit ${digit} ${yes} ${target}.`) : fail(`Latest digit ${digit} ${no} ${target}.`);
};

const frequencyComparison = (compare, wording) => (ctx, block) => {
    const percent = values.frequencyOf(windowDigits(ctx), Number(block.fields.DIGIT));
    if (!Number.isFinite(percent)) return unknown(EMPTY_WINDOW);
    const target = Number(block.fields.PERCENT);
    const shown = percent.toFixed(2);
    return compare(percent, target)
        ? pass(true, `Digit ${block.fields.DIGIT} frequency ${shown}% ${wording} ${target}%.`)
        : fail(`Digit ${block.fields.DIGIT} frequency ${shown}% is not ${wording} ${target}%.`);
};

const combinedComparison = (compare, wording) => (ctx, block) => {
    const digits = values.parseDigits(block.fields.DIGITS);
    const percent = values.combinedFrequency(windowDigits(ctx), digits);
    if (!Number.isFinite(percent)) return unknown(EMPTY_WINDOW);
    const target = Number(block.fields.PERCENT);
    return compare(percent, target)
        ? pass(true, `Combined frequency ${percent.toFixed(2)}% ${wording} ${target}%.`)
        : fail(`Combined frequency ${percent.toFixed(2)}% is not ${wording} ${target}%.`);
};

const numberComparison = (compare, wording) => (ctx, block, args) => {
    const a = numericArg(args, 'A');
    const b = numericArg(args, 'B');
    if (a === null || b === null) return unknown('Inconclusive: connect both numbers to this comparison.');
    return compare(a, b) ? pass(true, `${a} ${wording} ${b}.`) : fail(`${a} is not ${wording} ${b}.`);
};

const stableWindows = (frequencies, windows, tolerance) => {
    const usable = frequencies.slice(-Math.max(2, Math.trunc(windows)));
    if (usable.length < Math.max(2, Math.trunc(windows))) return null;
    const spread = values.frequencySpread(usable);
    return Number.isFinite(spread) ? spread <= tolerance : null;
};

export const EVALUATORS = {
    // Market selection and data quality.
    market_name: ctx => read(ctx.symbol || '', 'Market name taken from the running feed.'),
    symbol: ctx => read(ctx.symbol || '', 'Symbol taken from the running feed.'),
    price: ctx => (ctx.last_tick ? read(ctx.last_tick.price, 'Current price of the latest tick.') : unknown(NO_TICK)),
    timestamp: ctx => (ctx.last_tick ? read(ctx.last_tick.epoch, 'Epoch of the latest tick.') : unknown(NO_TICK)),
    ready: conditions.ready,
    fresh: conditions.fresh,
    connected: conditions.connected,

    // Digits.
    latest: ctx => {
        const digit = values.lastDigit(ctx.digits);
        return digit === null ? unknown(NO_TICK) : read(digit, `Latest final digit is ${digit}.`);
    },
    ago: (ctx, block) => {
        const digit = values.digitAgo(ctx.digits, Number(block.fields.N));
        return digit === null ? unknown(`Inconclusive: fewer than ${block.fields.N} genuine ticks observed.`) : read(digit, `Digit ${block.fields.N} tick(s) ago is ${digit}.`);
    },
    last_digits: (ctx, block) => {
        const digits = values.windowOf(ctx.digits, Number(block.fields.N));
        return digits.length ? read(digits, `Last ${digits.length} final digits.`) : unknown(NO_TICK);
    },
    count: ctx => read(ctx.digits.length, `${ctx.digits.length} genuine ticks observed.`),
    window: ctx => read(ctx.analysis_window, `Analysis window is ${ctx.analysis_window} ticks.`),

    // Frequency and statistics.
    occurrences: (ctx, block) => read(values.countOf(windowDigits(ctx), Number(block.fields.DIGIT)), 'Occurrences inside the analysis window.'),
    frequency: (ctx, block) => finite(values.frequencyOf(windowDigits(ctx), Number(block.fields.DIGIT)), 'Frequency percentage inside the analysis window.'),
    combined: (ctx, block) => finite(values.combinedFrequency(windowDigits(ctx), values.parseDigits(block.fields.DIGITS)), 'Combined frequency percentage.'),
    change: (ctx, block) =>
        finite(values.frequencyChange(values.digitWindowFrequencies(ctx.digits, Number(block.fields.DIGIT), ctx.analysis_window)), 'Change against the previous full window.'),
    streak: ctx => {
        const streak = values.currentStreak(ctx.digits);
        return streak.digit === null ? unknown(NO_TICK) : read(streak.length, `Digit ${streak.digit} repeated ${streak.length} time(s).`);
    },
    longest: ctx => (ctx.digits.length ? read(values.longestDigitStreak(ctx.digits), 'Longest repeating digit run in the window.') : unknown(NO_TICK)),
    even_frequency: ctx => finite(values.parityFrequency(windowDigits(ctx), 'Even'), 'Even frequency percentage.'),
    odd_frequency: ctx => finite(values.parityFrequency(windowDigits(ctx), 'Odd'), 'Odd frequency percentage.'),
    low_frequency: ctx => {
        const digit = values.leastFrequentDigit(windowDigits(ctx));
        return digit === null ? unknown(EMPTY_WINDOW) : finite(values.frequencyOf(windowDigits(ctx), digit), `Lowest digit frequency (digit ${digit}).`);
    },
    high_frequency: ctx => {
        const digit = values.mostFrequentDigit(windowDigits(ctx));
        return digit === null ? unknown(EMPTY_WINDOW) : finite(values.frequencyOf(windowDigits(ctx), digit), `Highest digit frequency (digit ${digit}).`);
    },
    transition: (ctx, block) => {
        const { observations } = values.transitionStats(windowDigits(ctx), Number(block.fields.DIGIT), Number(block.fields.TO));
        if (!observations) return unknown(`Inconclusive: digit ${block.fields.DIGIT} was not observed before another tick yet.`);
        const percent = values.transitionFrequency(windowDigits(ctx), Number(block.fields.DIGIT), Number(block.fields.TO));
        return finite(percent, `${block.fields.DIGIT} → ${block.fields.TO} in ${observations} observation(s).`);
    },
    selected_digit: ctx => read(ctx.digit, `Selected digit is ${ctx.digit}.`),
    barrier: ctx => read(ctx.barrier, `Barrier is ${ctx.barrier}.`),
    variable: (ctx, block) =>
        ctx.variables.has(String(block.fields.NAME))
            ? read(ctx.variables.get(String(block.fields.NAME)), `Variable ${block.fields.NAME}.`)
            : read(0, `Variable ${block.fields.NAME} has not been set in this session.`),
    historical_sample: ctx => read(ctx.completed.length, `${ctx.completed.length} completed observation(s) this session.`),
    historical_frequency: (ctx, block) => {
        const relevant = ctx.completed.filter(record => record.strategy === ctx.strategy && record.digit === Number(block.fields.DIGIT));
        if (!relevant.length) return unknown('Inconclusive: no completed observation for this digit and strategy yet.');
        return finite(values.percentage(relevant.filter(record => record.qualified).length, relevant.length), 'Observed outcome frequency (descriptive, not a probability).');
    },
    number: (ctx, block) => read(Number(block.fields.VALUE), 'Fixed number.'),

    // Strategy comparison: the observed outcomes of one armed strategy, never a prediction.
    research_candidate: (ctx, block) => {
        const comparison = values.observedComparison(ctx.completed, {
            strategy: String(block.fields.STRATEGY),
            digit: Number(block.fields.DIGIT),
            minimum: Number(block.fields.MINIMUM),
        });
        if (!comparison.completed) return unknown('Inconclusive: this candidate has no completed observation in this session yet.');
        if (!comparison.sufficient) {
            return unknown(
                `Inconclusive: ${comparison.older.completed} / ${comparison.newer.completed} completed setups in the two half-windows, ${block.fields.MINIMUM} required in each.`
            );
        }
        return finite(
            comparison.frequency,
            `${block.fields.STRATEGY}: ${comparison.passes}/${comparison.completed} observed outcomes; older half ${comparison.older.frequency.toFixed(2)}% against newer half ${comparison.newer.frequency.toFixed(2)}%. Descriptive frequency, not a probability.`
        );
    },

    // Digit conditions.
    eq: digitComparison((a, b) => a === b, 'equals', 'does not equal'),
    ne: digitComparison((a, b) => a !== b, 'differs from', 'matches'),
    gt: digitComparison((a, b) => a > b, 'is greater than', 'is not greater than'),
    lt: digitComparison((a, b) => a < b, 'is less than', 'is not less than'),
    previous_eq: (ctx, block) => {
        const previous = values.digitAgo(ctx.digits, 1);
        if (previous === null) return unknown('Inconclusive: no previous tick observed yet.');
        const target = Number(block.fields.DIGIT);
        return previous === target
            ? pass(true, `Previous digit ${previous} equals ${target}.`)
            : fail(`Previous digit ${previous} does not equal ${target}.`);
    },
    even: ctx => {
        const digit = values.lastDigit(ctx.digits);
        return digit === null ? unknown(NO_TICK) : values.isEven(digit) ? pass(true, `Latest digit ${digit} is even.`) : fail(`Latest digit ${digit} is odd.`);
    },
    odd: ctx => {
        const digit = values.lastDigit(ctx.digits);
        return digit === null ? unknown(NO_TICK) : !values.isEven(digit) ? pass(true, `Latest digit ${digit} is odd.`) : fail(`Latest digit ${digit} is even.`);
    },
    sequence: (ctx, block) => {
        const sequence = values.parseDigits(block.fields.DIGITS);
        const matched = values.matchesSequence(ctx.digits, sequence);
        if (matched === null) return unknown(`Inconclusive: ${sequence.length} ticks are needed for this sequence.`);
        return matched ? pass(true, `Recent digits match ${sequence.join(',')}.`) : fail(`Recent digits do not match ${sequence.join(',')}.`);
    },
    contains: (ctx, block) => {
        const recent = values.windowOf(ctx.digits, Number(block.fields.N));
        if (recent.length < Number(block.fields.N)) return unknown(`Inconclusive: fewer than ${block.fields.N} ticks observed.`);
        return recent.includes(Number(block.fields.DIGIT))
            ? pass(true, `Digit ${block.fields.DIGIT} appears in the last ${block.fields.N} ticks.`)
            : fail(`Digit ${block.fields.DIGIT} does not appear in the last ${block.fields.N} ticks.`);
    },
    not_contains: (ctx, block) => {
        const recent = values.windowOf(ctx.digits, Number(block.fields.N));
        if (recent.length < Number(block.fields.N)) return unknown(`Inconclusive: fewer than ${block.fields.N} ticks observed.`);
        return !recent.includes(Number(block.fields.DIGIT))
            ? pass(true, `Digit ${block.fields.DIGIT} is absent from the last ${block.fields.N} ticks.`)
            : fail(`Digit ${block.fields.DIGIT} appears in the last ${block.fields.N} ticks.`);
    },
    consecutive: (ctx, block) => {
        const target = Number(block.fields.DIGIT);
        const required = Math.max(1, Number(block.fields.N));
        const run = values.longestRunOfDigit(values.windowOf(ctx.digits, required), target);
        return run >= required
            ? pass(true, `Digit ${target} appeared ${run} times consecutively.`)
            : fail(`Digit ${target} appeared ${run} times consecutively, ${required} required.`);
    },
    streak_at_least: (ctx, block) => {
        const streak = values.currentStreak(ctx.digits);
        const required = Math.max(1, Number(block.fields.N));
        return streak.length >= required
            ? pass(true, `Current streak is ${streak.length} tick(s).`)
            : fail(`Current streak is ${streak.length} tick(s), ${required} required.`);
    },

    // Frequency conditions.
    freq_below: frequencyComparison((a, b) => a < b, 'below'),
    freq_at_or_below: frequencyComparison((a, b) => a <= b, 'at or below'),
    freq_above: frequencyComparison((a, b) => a > b, 'above'),
    freq_at_or_above: frequencyComparison((a, b) => a >= b, 'at or above'),
    combined_below: combinedComparison((a, b) => a < b, 'below'),
    combined_at_or_below: combinedComparison((a, b) => a <= b, 'at or below'),
    stable: (ctx, block) => {
        const frequencies = values.digitWindowFrequencies(ctx.digits, Number(block.fields.DIGIT), ctx.analysis_window);
        const spread = stableWindows(frequencies, Number(block.fields.N), Number(block.fields.TOLERANCE));
        if (spread === null) return unknown(`Inconclusive: ${block.fields.N} full non-overlapping windows are needed.`);
        return spread
            ? pass(true, `Digit ${block.fields.DIGIT} stayed within ${block.fields.TOLERANCE} percentage points across windows.`)
            : fail(`Digit ${block.fields.DIGIT} moved more than ${block.fields.TOLERANCE} percentage points between windows.`);
    },
    frequency_change: (ctx, block) => {
        const frequencies = values.digitWindowFrequencies(ctx.digits, Number(block.fields.DIGIT), ctx.analysis_window);
        const change = values.frequencyChange(frequencies);
        if (!Number.isFinite(change)) return unknown('Inconclusive: two full windows are needed for a change.');
        const tolerance = Number(block.fields.TOLERANCE);
        return Math.abs(change) <= tolerance
            ? pass(true, `Frequency moved ${change.toFixed(2)} percentage points, within ${tolerance}.`)
            : fail(`Frequency moved ${change.toFixed(2)} percentage points, beyond ${tolerance}.`);
    },
    sample: conditions.sample,
    min_sample: conditions.sample,
    stat_minimum: conditions.sample,
    require_sample: conditions.sample,
    no_pending: conditions.no_pending,
    cooldown_complete: conditions.cooldown_complete,
    no_duplicate: conditions.no_duplicate,
    selected: conditions.selected,
    setup_limit: conditions.setup_limit,
    consecutive_pass: conditions.consecutive_pass,
    consecutive_fail: conditions.consecutive_fail,

    // Logic.
    and: (ctx, block, args) => {
        const a = args.A;
        const b = args.B;
        if (!a || !b) return unknown('Inconclusive: connect both conditions.');
        if (a.status === 'Fail' || b.status === 'Fail') return fail(`AND: ${a.status}, ${b.status}.`);
        if (a.status === 'Inconclusive' || b.status === 'Inconclusive') return unknown(`AND: ${a.reason}`);
        return pass(true, 'AND: both conditions passed.');
    },
    or: (ctx, block, args) => {
        const a = args.A;
        const b = args.B;
        if (!a || !b) return unknown('Inconclusive: connect both conditions.');
        if (a.status === 'Pass' || b.status === 'Pass') return pass(true, 'OR: at least one condition passed.');
        if (a.status === 'Inconclusive' || b.status === 'Inconclusive') return unknown(`OR: ${a.reason}`);
        return fail('OR: neither condition passed.');
    },
    not: (ctx, block, args) => {
        const a = args.A;
        if (!a) return unknown('Inconclusive: connect a condition.');
        if (a.status === 'Inconclusive') return unknown(a.reason);
        return a.status === 'Pass' ? fail('NOT: the condition passed.') : pass(true, 'NOT: the condition did not pass.');
    },
    compare_eq: numberComparison((a, b) => a === b, 'equals'),
    compare_ne: numberComparison((a, b) => a !== b, 'does not equal'),
    compare_gt: numberComparison((a, b) => a > b, 'is greater than'),
    compare_lt: numberComparison((a, b) => a < b, 'is less than'),
    compare_gte: numberComparison((a, b) => a >= b, 'is greater than or equal to'),
    compare_lte: numberComparison((a, b) => a <= b, 'is less than or equal to'),
    between: (ctx, block, args) => {
        const value = numericArg(args, 'A');
        if (value === null) return unknown('Inconclusive: connect a number to this range check.');
        const low = Number(block.fields.LOW);
        const high = Number(block.fields.HIGH);
        return value >= low && value <= high ? pass(true, `${value} is between ${low} and ${high}.`) : fail(`${value} is outside ${low}–${high}.`);
    },

    // Parity, streaks and transitions.
    parity_stable: (ctx, block) => {
        const frequencies = values.parityWindowFrequencies(ctx.digits, block.fields.PARITY ?? 'Even', ctx.analysis_window);
        const stable = stableWindows(frequencies, Number(block.fields.N), Number(block.fields.TOLERANCE));
        if (stable === null) return unknown('Inconclusive: two full non-overlapping windows are needed.');
        return stable ? pass(true, 'Parity stayed inside the tolerance across windows.') : fail('Parity moved beyond the tolerance between windows.');
    },
    adv_parity: ctx => {
        const digit = values.lastDigit(ctx.digits);
        return digit === null ? unknown(NO_TICK) : read(values.parityOf(digit), `Latest digit ${digit} is ${values.parityOf(digit)}.`);
    },
    adv_parity_transition: (ctx, block) => {
        const previous = values.digitAgo(ctx.digits, 1);
        const latest = values.lastDigit(ctx.digits);
        if (previous === null || latest === null) return unknown('Inconclusive: two ticks are needed for a parity transition.');
        const matches =
            values.parityOf(previous).toLowerCase() === String(block.fields.FROM).toLowerCase() &&
            values.parityOf(latest).toLowerCase() === String(block.fields.TO_PARITY).toLowerCase();
        return matches
            ? pass(true, `Parity moved ${block.fields.FROM} → ${block.fields.TO_PARITY}.`)
            : fail(`Parity did not move ${block.fields.FROM} → ${block.fields.TO_PARITY}.`);
    },
    adv_parity_frequency: (ctx, block) => {
        const percent = values.parityFrequency(windowDigits(ctx), block.fields.PARITY);
        if (!Number.isFinite(percent)) return unknown(EMPTY_WINDOW);
        return percent >= Number(block.fields.PERCENT)
            ? pass(true, `${block.fields.PARITY} frequency ${percent.toFixed(2)}% meets ${block.fields.PERCENT}%.`)
            : fail(`${block.fields.PARITY} frequency ${percent.toFixed(2)}% is below ${block.fields.PERCENT}%.`);
    },
    adv_parity_switched: ctx => {
        const previous = values.digitAgo(ctx.digits, 1);
        const latest = values.lastDigit(ctx.digits);
        if (previous === null || latest === null) return unknown('Inconclusive: two ticks are needed.');
        return values.parityOf(previous) !== values.parityOf(latest) ? pass(true, 'Parity switched on the latest tick.') : fail('Parity did not switch.');
    },
    adv_streak_minimum: (ctx, block) => {
        const streak = values.currentStreak(ctx.digits);
        const required = Math.max(1, Number(block.fields.N));
        return streak.length >= required
            ? pass(true, `Current streak ${streak.length} is at least ${required}.`)
            : fail(`Current streak ${streak.length} is below ${required}.`);
    },
    adv_streak_ended: ctx => {
        const previous = values.digitAgo(ctx.digits, 1);
        const latest = values.lastDigit(ctx.digits);
        if (previous === null || latest === null) return unknown('Inconclusive: two ticks are needed.');
        return previous !== latest ? pass(true, `Streak of ${previous} ended on the latest tick.`) : fail('The current streak is still running.');
    },
    adv_repeated: ctx => {
        const previous = values.digitAgo(ctx.digits, 1);
        const latest = values.lastDigit(ctx.digits);
        if (previous === null || latest === null) return unknown('Inconclusive: two ticks are needed.');
        return previous === latest ? pass(true, `Digit ${latest} repeated.`) : fail('The digit did not repeat.');
    },
    adv_transition_now: (ctx, block) => {
        const previous = values.digitAgo(ctx.digits, 1);
        const latest = values.lastDigit(ctx.digits);
        if (previous === null || latest === null) return unknown('Inconclusive: two ticks are needed.');
        const matches = previous === Number(block.fields.DIGIT) && latest === Number(block.fields.TO);
        return matches
            ? pass(true, `Transition ${block.fields.DIGIT} → ${block.fields.TO} on the latest tick.`)
            : fail(`Latest transition is ${previous} → ${latest}.`);
    },
    adv_transition_sample: (ctx, block) => {
        const { observations } = values.transitionStats(ctx.digits, Number(block.fields.DIGIT), Number(block.fields.TO));
        const required = Math.max(1, Number(block.fields.N));
        return observations >= required
            ? pass(true, `${observations} observation(s) of ${block.fields.DIGIT} before a next tick.`)
            : fail(`Only ${observations} observation(s), ${required} required.`);
    },
    adv_confirmation_after: ctx =>
        ctx.pattern.confirmed
            ? pass(true, 'The confirmation digit arrived after the detected pair.')
            : fail('No confirmation after the detected pair yet.'),
    pattern_minimum: (ctx, block) =>
        ctx.digits.length >= Number(block.fields.N)
            ? pass(true, `${ctx.digits.length} ticks observed before detection.`)
            : fail(`Only ${ctx.digits.length} ticks observed, ${block.fields.N} required before detection.`),
    adv_stability: (ctx, block) => {
        const frequencies = values.digitWindowFrequencies(ctx.digits, Number(block.fields.DIGIT), Number(block.fields.N));
        const stable = stableWindows(frequencies, 2, Number(block.fields.TOLERANCE));
        if (stable === null) return unknown('Inconclusive: two full non-overlapping windows are needed.');
        return stable ? pass(true, 'Frequency stayed inside the tolerance.') : fail('Frequency moved beyond the tolerance.');
    },
    adv_state: (ctx, block) => {
        const expected = String(block.fields.STAGE);
        return ctx.stage === expected ? pass(true, `Stage is ${expected}.`) : fail(`Stage is ${ctx.stage}, not ${expected}.`);
    },

    // Advanced reads.
    adv_frequency: (ctx, block) => finite(values.frequencyOf(values.windowOf(ctx.digits, ctx.analysis_window), Number(block.fields.DIGIT)), 'Frequency inside the analysis window.'),
    adv_count: (ctx, block) => read(values.countOf(values.windowOf(ctx.digits, ctx.analysis_window), Number(block.fields.DIGIT)), 'Count inside the analysis window.'),
    adv_most: ctx => {
        const digit = values.mostFrequentDigit(windowDigits(ctx));
        return digit === null ? unknown(EMPTY_WINDOW) : read(digit, `Most frequent digit is ${digit}.`);
    },
    adv_least: ctx => {
        const digit = values.leastFrequentDigit(windowDigits(ctx));
        return digit === null ? unknown(EMPTY_WINDOW) : read(digit, `Least frequent digit is ${digit}.`);
    },
    adv_combined: (ctx, block) => finite(values.combinedFrequency(windowDigits(ctx), values.parseDigits(block.fields.DIGITS)), 'Combined frequency inside the analysis window.'),
    adv_frequency_windows: (ctx, block) => {
        const frequencies = values.digitWindowFrequencies(ctx.digits, Number(block.fields.DIGIT), Number(block.fields.N));
        const change = values.frequencyChange(frequencies);
        return finite(change, 'Difference between the two newest disjoint windows.');
    },
    adv_streak: ctx => {
        const streak = values.currentStreak(ctx.digits);
        return streak.digit === null ? unknown(NO_TICK) : read(streak.length, `Current streak is ${streak.length}.`);
    },
    adv_longest: ctx => (ctx.digits.length ? read(values.longestDigitStreak(ctx.digits), 'Longest repeating run in the window.') : unknown(NO_TICK)),
    adv_transition_frequency: (ctx, block) => {
        const { observations } = values.transitionStats(ctx.digits, Number(block.fields.DIGIT), Number(block.fields.TO));
        if (observations < Math.max(1, Number(block.fields.MINIMUM))) {
            return unknown(`Inconclusive: ${observations} observation(s), ${block.fields.MINIMUM} required.`);
        }
        return finite(values.transitionFrequency(ctx.digits, Number(block.fields.DIGIT), Number(block.fields.TO)), 'Transition frequency.');
    },
    adv_transition_count: (ctx, block) => read(values.transitionStats(ctx.digits, Number(block.fields.DIGIT), Number(block.fields.TO)).hits, 'Times A was followed by B.'),
    adv_transition_windows: (ctx, block) => {
        const size = Math.max(1, Number(block.fields.N));
        const windows = values.completeWindows(ctx.digits, size);
        if (windows.length < 2) return unknown('Inconclusive: two full windows are needed.');
        const [previous, latest] = windows.slice(-2).map(window => values.transitionFrequency(window, Number(block.fields.DIGIT), Number(block.fields.TO)));
        if (!Number.isFinite(previous) || !Number.isFinite(latest)) return unknown('Inconclusive: not enough transitions in both windows.');
        return read(latest - previous, 'Transition frequency change between the two newest windows.');
    },
    pattern_stage: ctx => read(ctx.stage, `Pattern stage is ${ctx.stage}.`),
    adv_stage: ctx => read(ctx.stage, `Pattern stage is ${ctx.stage}.`),
};

export default EVALUATORS;
