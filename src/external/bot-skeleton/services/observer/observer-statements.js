/**
 * Statement blocks of the observer language.
 *
 * Each entry takes `(ctx, block, args)` and performs its effect on the running observation session
 * (journal notes, variables, strategy selection, cooldowns, pattern stages, the trade entry signal).
 * Control flow (`IF`, `Repeat`, `Run Once`, `Wait`, entry blocks) is driven by the engine, which is
 * the only thing that knows the surrounding sequence.
 */
import * as values from './observer-values';

const numericArg = (args, name) => {
    const outcome = args?.[name];
    if (!outcome || outcome.status !== 'Pass' || !Number.isFinite(Number(outcome.value))) return null;
    return Number(outcome.value);
};

const variableName = block => String(block.fields.NAME ?? 'counter');

/** One journal line per strategy, from genuinely completed observations only. */
const describeComparisons = rows =>
    rows
        .map(row =>
            row.sufficient
                ? `${row.strategy} ${row.passes}/${row.completed} (older ${row.older.frequency.toFixed(2)}% → newer ${row.newer.frequency.toFixed(2)}%)`
                : `${row.strategy} insufficient sample (${row.older.completed} / ${row.newer.completed} completed)`
        )
        .join('; ');

export const STATEMENTS = {
    // Journal.
    note: (ctx, block) => ctx.note(String(block.fields.TEXT), block.type === 'obs_notification'),
    report_value: (ctx, block, args) => {
        const outcome = args?.VALUE;
        if (!outcome || outcome.status !== 'Pass') {
            ctx.note(`${block.label}: ${outcome?.reason ?? 'nothing is connected.'}`);
            return;
        }
        const readout = Array.isArray(outcome.value) ? outcome.value.join(', ') : String(outcome.value);
        ctx.note(`${block.label}: ${readout}`);
    },

    // Variables and counters.
    set_variable: (ctx, block, args) => {
        const value = numericArg(args, 'VALUE');
        if (value === null) {
            ctx.note(`Set Number Variable: nothing usable is connected to ${variableName(block)}.`);
            return;
        }
        ctx.variables.set(variableName(block), value);
    },
    increase: (ctx, block) => {
        const name = variableName(block);
        ctx.variables.set(name, (ctx.variables.get(name) ?? 0) + Number(block.fields.N));
    },
    reset_counter: (ctx, block) => ctx.variables.set(variableName(block), 0),
    reset_counters: ctx => ctx.variables.clear(),
    reset_streak: ctx => ctx.resetStreak(),

    // Strategy selection.
    set_digit: (ctx, block) => ctx.setDigit(Number(block.fields.DIGIT), 'Set Match / Excluded Digit'),
    suggest_digit: (ctx, block) => {
        const window = values.windowOf(ctx.digits, ctx.analysis_window);
        if (!window.length) {
            ctx.note('Use Suggested Match / Differs Digit: the analysis window holds no genuine ticks yet.');
            return;
        }
        const digit = String(block.fields.RANK) === 'highest-frequency' ? values.mostFrequentDigit(window) : values.leastFrequentDigit(window);
        ctx.setDigit(digit, `Use Suggested Match / Differs Digit (${block.fields.RANK})`);
    },
    set_barrier: (ctx, block) => ctx.setBarrier(Number(block.fields.BARRIER)),
    configure_matches: ctx => ctx.configureStrategy('matches'),
    configure_differs: ctx => ctx.configureStrategy('differs'),
    configure_over: ctx => ctx.configureStrategy('over'),
    configure_under: ctx => ctx.configureStrategy('under'),
    configure_even: ctx => ctx.configureStrategy('even'),
    configure_odd: ctx => ctx.configureStrategy('odd'),
    observe_matches: ctx => ctx.armObservation({ strategy: 'matches', ticks: 1 }),
    observe_differs: ctx => ctx.armObservation({ strategy: 'differs', ticks: 1 }),
    observe_over: ctx => ctx.armObservation({ strategy: 'over', ticks: 1 }),
    observe_under: ctx => ctx.armObservation({ strategy: 'under', ticks: 1 }),
    observe_even: ctx => ctx.armObservation({ strategy: 'even', ticks: 1 }),
    observe_odd: ctx => ctx.armObservation({ strategy: 'odd', ticks: 1 }),
    observe: (ctx, block) => ctx.armObservation({ strategy: ctx.strategy, ticks: Math.max(1, Number(block.fields.N)) }),
    pattern_subsequent: ctx => ctx.armObservation({ strategy: ctx.strategy, ticks: 1 }),

    // Restart, cooldown and session limits.
    restart: ctx => ctx.restart('Restart Monitoring'),
    cooldown_ticks: (ctx, block) => ctx.setCooldown({ ticks: Number(block.fields.N) }),
    cooldown_seconds: (ctx, block) => ctx.setCooldown({ seconds: Number(block.fields.N) }),
    pattern_cooldown: (ctx, block) => ctx.setCooldown({ ticks: Number(block.fields.N) }),
    reset: ctx => ctx.resetSession(),
    reset_session: ctx => ctx.resetSession(),
    stop_setups: (ctx, block) => ctx.setLimit('setups', Number(block.fields.N)),
    stop_evaluations: (ctx, block) => ctx.setLimit('evaluations', Number(block.fields.N)),
    stop_duration: (ctx, block) => ctx.setLimit('duration', Number(block.fields.N)),
    stale_stop: ctx => ctx.setLimit('stale', true),
    connection_stop: ctx => ctx.setLimit('connection', true),
    pause: ctx => ctx.requestPause(),
    stop: ctx => ctx.requestStop(),
    monitor_start: ctx => ctx.setMonitoring(true),
    monitor_resume: ctx => ctx.setMonitoring(true),
    monitor_stop: ctx => ctx.setMonitoring(false),
    next_genuine: () => 'end',
    inconclusive: ctx => ctx.markInconclusive(),
    adv_window: (ctx, block) => ctx.setAnalysisWindow(Number(block.fields.N)),

    // Pattern detector.
    pattern_detect_pair: (ctx, block) => ctx.detectPair(String(block.fields.PAIRS)),
    pattern_detect_identical: (ctx, block) => ctx.detectRun('digit', Number(block.fields.N)),
    pattern_detect_even: (ctx, block) => ctx.detectRun('even', Number(block.fields.N)),
    pattern_detect_odd: (ctx, block) => ctx.detectRun('odd', Number(block.fields.N)),
    // `obs_detect_run` says in one dropdown what the three blocks above say in their names.
    pattern_detect_run: (ctx, block) => {
        const kind = String(block.fields.KIND);
        const run = Number(block.fields.N);
        if (kind.toLowerCase().startsWith('even')) return ctx.detectRun('even', run);
        if (kind.toLowerCase().startsWith('odd')) return ctx.detectRun('odd', run);
        return ctx.detectRun('digit', run);
    },
    pattern_detect_parity: (ctx, block) =>
        ctx.detectParityPattern({
            initial: String(block.fields.INITIAL),
            run: Number(block.fields.N),
            confirm: String(block.fields.CONFIRM),
            target: String(block.fields.TARGET),
            timeout: Number(block.fields.TIMEOUT),
            cooldown: Number(block.fields.COOLDOWN),
            minimum: Number(block.fields.MINIMUM),
        }),
    pattern_detect_transitions: (ctx, block) => ctx.detectParitySequence(String(block.fields.PARITIES)),
    pattern_confirm_digit: (ctx, block) => ctx.setConfirmation({ digit: Number(block.fields.DIGIT) }),
    pattern_confirm_even: ctx => ctx.setConfirmation({ parity: 'Even' }),
    pattern_confirm_odd: ctx => ctx.setConfirmation({ parity: 'Odd' }),
    pattern_confirm_parity: (ctx, block) => ctx.setConfirmation({ parity: String(block.fields.PARITY) }),
    pattern_intervening: (ctx, block) => ctx.setIntervening(String(block.fields.ALLOW) === 'Yes'),
    pattern_timeout: (ctx, block) => ctx.setConfirmationTimeout(Number(block.fields.N)),
    pattern_emit: ctx => ctx.emitSetup('Emit Setup Detected'),
    pattern_reset: ctx => ctx.resetPattern(block_label(ctx, 'Reset Pattern Detector')),
    pattern_deduplicate: ctx => ctx.setDedupe(true),
    pattern_barrier: (ctx, block) => ctx.armBarrier(String(block.fields.RULE)),
    pattern_parity_outcome: (ctx, block) => ctx.armParity(String(block.fields.PARITY)),
    pattern_record_setup: ctx => ctx.recordSetup(),
    pattern_record: ctx => ctx.recordOutcome(),
    pattern_allow_next: ctx => ctx.allowNextSetup(),
    pattern_explain: ctx => ctx.explainPattern(),
    pattern_minimum: (ctx, block) => ctx.setMinimumSample(Number(block.fields.N)),
    research_windows: (ctx, block) => {
        const rows = values.compareObservedStrategies(ctx.completed, {
            digit: ctx.digit,
            minimum: Number(block.fields.MINIMUM),
            window: Number(block.fields.N),
        });
        ctx.note(
            `Compare Strategy Across Windows (${block.fields.N} ticks per window): ${describeComparisons(rows)}. Descriptive frequencies of completed observations, not probabilities.`
        );
    },
    research_rank: (ctx, block) => {
        const eligible = values
            .compareObservedStrategies(ctx.completed, { digit: ctx.digit, minimum: Number(block.fields.MINIMUM) })
            .filter(row => row.sufficient)
            .sort((a, b) => b.frequency - a.frequency);
        if (!eligible.length) {
            ctx.note(`Rank Strategies By Observed Results: no strategy has ${block.fields.MINIMUM} completed setups in each half-window yet.`);
            return;
        }
        ctx.note(
            `Rank Strategies By Observed Results: ${eligible
                .map((row, index) => `${index + 1}. ${row.strategy} ${row.frequency.toFixed(2)}% (${row.passes}/${row.completed})`)
                .join(', ')}. Descriptive frequency of completed observations, not a probability.`
        );
    },
    research_explain: ctx => ctx.explainResearch(),
    use_market: () => {},

    // "Reset To Waiting For Pair" / "Start New Pattern Cycle" share the pattern_reset op.
    reset_to_pair: ctx => ctx.resetPattern('Reset To Waiting For Pair'),
    new_cycle: ctx => ctx.resetPattern('Start New Pattern Cycle'),
};

/** Label of the block being executed, for the journal trail. */
function block_label(ctx, fallback) {
    return ctx.current_block?.label ?? fallback;
}

export default STATEMENTS;
