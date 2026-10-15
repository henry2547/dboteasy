/**
 * The observer engine: genuine ticks in, journal trail and a trade entry signal out.
 *
 * It walks the observer program read off the canvas (`observer-program.js`) with a bounded,
 * deterministic evaluator — a 500-operation budget and a 200-step sequence cap per dispatch, no
 * `eval`, no generated JavaScript and no account calls of its own. Market data is only ever what
 * the running feed delivered: a missing value is Inconclusive, never invented.
 *
 * The one thing it triggers in the bot is the trade entry: when an entry block passes (or the
 * pattern detector emits a setup) it raises the entry signal, and the generated program starts a
 * trade from the trade parameters already on the canvas — the observer never picks an amount,
 * contract or duration itself.
 */
import { DEFAULT_FRESHNESS_SECONDS, EVALUATORS, MAX_SETUPS_PER_SESSION, unknown } from './observer-evaluators';
import { STATEMENTS } from './observer-statements';
import * as values from './observer-values';

export const MAX_OPS = 500;
const MAX_SEQUENCE_STEPS = 200;
const MAX_HISTORY = 1000;
const MAX_REPEAT = 20;

export const STAGES = {
    WAITING_PAIR: 'Waiting for pair',
    WAITING_CONFIRMATION: 'Waiting for confirmation',
    SETUP: 'Setup detected',
    EVALUATION: 'Evaluation pending',
    COOLDOWN: 'Cooldown',
};

export class ObserverEngine {
    constructor(program, hooks = {}) {
        this.program = program;
        this.journal = hooks.journal ?? (() => {});
        this.onStop = hooks.onStop ?? (() => {});
        this.active = false;
        this.entry_pending = false;
        this.unimplemented = new Set();
        this.waiters = new Map();
        this.cache = new Map();
        this.ctx = this.create_context(hooks);
    }

    /** Does the canvas actually gate trading on the observer program? */
    get gate_enabled() {
        return Boolean(this.program.has_entry_gate);
    }

    create_context(hooks) {
        const engine = this;
        return {
            symbol: hooks.symbol ?? '',
            pip_size: hooks.pip_size ?? 0,
            digits: [],
            history: [],
            last_tick: null,
            analysis_window: 100,
            connected: false,
            market_ready: false,
            freshness_seconds: DEFAULT_FRESHNESS_SECONDS,
            now: Date.now(),
            tick_index: 0,
            strategy: 'matches',
            digit: 2,
            barrier: 2,
            digit_selected: false,
            variables: new Map(),
            consecutive: new Map(),
            stage: STAGES.WAITING_PAIR,
            setups: 0,
            evaluations: 0,
            completed: [],
            pending: [],
            cooldown_until_tick: 0,
            cooldown_until_time: 0,
            monitoring: true,
            paused: false,
            duplicate_setup: false,
            awaiting_restart: false,
            force_inconclusive: false,
            last_rejection: 'No setup has been rejected yet.',
            limits: { setups: MAX_SETUPS_PER_SESSION, evaluations: Infinity, duration: Infinity, stale: false, connection: false },
            pattern: engine.fresh_pattern(),
            setup_snapshot: null,
            current_block: null,
            get cooldown_active() {
                return this.tick_index < this.cooldown_until_tick || this.now < this.cooldown_until_time;
            },
            // Effects the statement blocks reach for.
            note: (message, dedupe) => engine.note(message, dedupe),
            journal: message => engine.note(message, false),
            signalEntry: reason => engine.signalEntry(reason),
            setStage: (stage, message) => engine.setStage(stage, message),
            setDigit: (digit, source) => engine.setDigit(digit, source),
            setBarrier: barrier => engine.setBarrier(barrier),
            configureStrategy: strategy => engine.configureStrategy(strategy),
            armObservation: options => engine.armObservation(options),
            armBarrier: rule => engine.armBarrier(rule),
            armParity: parity => engine.armParity(parity),
            setCooldown: options => engine.setCooldown(options),
            restart: reason => engine.restart(reason),
            resetSession: () => engine.resetSession(),
            resetStreak: () => engine.resetStreak(),
            setLimit: (key, value) => engine.setLimit(key, value),
            requestPause: () => engine.requestPause(),
            requestStop: () => engine.requestStop(),
            setMonitoring: flag => engine.setMonitoring(flag),
            markInconclusive: () => engine.markInconclusive(),
            explainPattern: () => engine.explainPattern(),
            explainResearch: () => engine.explainResearch(),
            detectPair: pairs => engine.detectPair(pairs),
            detectRun: (kind, run) => engine.detectRun(kind, run),
            detectParityPattern: config => engine.detectParityPattern(config),
            detectParitySequence: sequence => engine.detectParitySequence(sequence),
            setConfirmation: options => engine.setConfirmation(options),
            setIntervening: allow => engine.setIntervening(allow),
            setConfirmationTimeout: ticks => engine.setConfirmationTimeout(ticks),
            setMinimumSample: ticks => engine.setMinimumSample(ticks),
            emitSetup: source => engine.emitSetup(source),
            resetPattern: reason => engine.resetPattern(reason),
            setDedupe: flag => engine.setDedupe(flag),
            recordSetup: () => engine.recordSetup(),
            recordOutcome: () => engine.recordOutcome(),
            allowNextSetup: () => engine.allowNextSetup(),
        };
    }

    fresh_pattern() {
        return {
            waiting: false,
            started_tick: null,
            waited: 0,
            kind: null,
            describe: '',
            digit: null,
            confirm_digit: null,
            confirm_parity: null,
            intervening: true,
            timeout: 0,
            confirmed: false,
            dedupe: true,
            emitted_key: null,
        };
    }

    // ---------------------------------------------------------------- lifecycle

    start({ symbol, seed } = {}) {
        this.active = true;
        this.entry_pending = false;
        this.ctx.symbol = symbol ?? this.ctx.symbol;
        this.ctx.started_at = Date.now();
        this.note(`Observer monitoring started${this.ctx.symbol ? ` on ${this.ctx.symbol}` : ''}${this.gate_enabled ? '; trades start only when an entry block passes.' : '.'}`);
        if (Array.isArray(seed) && seed.length) this.seed(seed);
        this.dispatch('start');
    }

    /** Genuine history already loaded by the running feed, oldest first. */
    seed(digits) {
        this.ctx.digits = digits.map(Number).filter(Number.isInteger).slice(-MAX_HISTORY);
        this.ctx.market_ready = true;
        this.note(`Analysis seeded with ${this.ctx.digits.length} genuine historical tick(s).`);
    }

    feedTick({ symbol, price, epoch, pip_size } = {}) {
        if (!this.active) return;
        const ctx = this.ctx;
        if (Number.isFinite(Number(pip_size))) ctx.pip_size = Number(pip_size);
        if (symbol && symbol !== ctx.symbol) {
            ctx.symbol = symbol;
            ctx.market_ready = false;
            ctx.digits = [];
            ctx.history = [];
            this.dispatch('market');
        }
        const digit = Number(String(Number(price).toFixed(ctx.pip_size)).slice(-1));
        if (!Number.isInteger(digit)) return;

        const now = Date.now();
        const key = `${epoch}`;
        if (this.last_key === key) return;
        const previous = ctx.last_tick;
        const gap = previous ? (Number(epoch) - previous.epoch) : 0;
        this.last_key = key;

        ctx.now = now;
        ctx.tick_index += 1;
        ctx.digits.push(digit);
        if (ctx.digits.length > MAX_HISTORY) ctx.digits.splice(0, ctx.digits.length - MAX_HISTORY);
        ctx.history = [...ctx.history, { epoch: Number(epoch), price: Number(price) }].slice(-MAX_HISTORY);
        ctx.last_tick = { epoch: Number(epoch), price: Number(price) };
        ctx.market_ready = true;
        ctx.duplicate_setup = false;
        ctx.force_inconclusive = false;
        // Every value the generated program asks for belongs to this tick, never the previous one.
        this.cache.clear();

        // A silent stretch of ticks means the data feed was interrupted, not that ticks vanished.
        if (previous && gap > ctx.freshness_seconds) {
            this.interrupt(`No genuine tick for ${gap}s; new setups are suspended until data returns.`);
        } else if (this.interrupted) {
            this.interrupted = false;
            ctx.connected = true;
            this.note('Market data restored; observation resumes on genuine ticks.');
            this.dispatch('restored');
        }
        if (this.interrupted) return;

        ctx.connected = true;
        this.resolveWaiters();
        this.resolvePending();
        this.advancePattern();
        this.dispatch('tick');
        this.runRoots();
        if (ctx.tick_index >= ctx.analysis_window && ctx.tick_index % ctx.analysis_window === 0) this.dispatch('window');
        this.checkLimits();
    }

    /** The feed reported the market connection state directly. */
    connection(connected) {
        if (!this.active) return;
        if (connected === this.ctx.connected) return;
        this.ctx.connected = connected;
        if (connected) {
            this.interrupted = false;
            this.note('Market connection restored.');
            this.dispatch('restored');
        } else {
            this.interrupt('Market connection lost; pending evaluations are Inconclusive.');
            this.dispatch('lost');
            if (this.ctx.limits.connection) this.requestStop('Stop When Market Connection Fails');
        }
    }

    interrupt(reason) {
        this.interrupted = true;
        this.ctx.connected = false;
        this.waiters.clear();
        this.ctx.pending.forEach(observation => this.recordObservation(observation, null, reason));
        this.ctx.pending = [];
        if (this.ctx.limits.stale && !this.ctx.limits.connection) this.requestStop('Stop When Data Becomes Stale');
        else this.setStage(STAGES.WAITING_PAIR, reason);
    }

    stop(reason = 'Bot stopped') {
        if (!this.active) return;
        this.active = false;
        this.waiters.clear();
        this.ctx.pending.forEach(observation => this.recordObservation(observation, null, 'Stopped before all subsequent ticks were observed.'));
        this.ctx.pending = [];
        this.note(`Observer session ended: ${reason}. Journal preserved.`);
    }

    // ---------------------------------------------------------------- dispatch

    dispatch(event) {
        const hats = this.program.events.get(event) ?? [];
        if (!hats.length || !this.ctx.monitoring || this.ctx.paused) return;
        hats.forEach(id => {
            const hat = this.program.blocks.get(id);
            this.cache.clear();
            this.budget = MAX_OPS;
            this.once = new Set();
            this.runSequence(hat?.body, event);
        });
    }

    /**
     * Free-standing observer statements are driven by the tick stream exactly like the event hats,
     * so a program dragged straight onto the canvas — an entry block, a guard, a limit — is
     * evaluated on every genuine tick instead of sitting there unused.
     */
    runRoots() {
        if (!this.ctx.monitoring || this.ctx.paused) return;
        (this.program.roots ?? []).forEach(id => {
            this.cache.clear();
            this.budget = MAX_OPS;
            this.once = new Set();
            this.runSequence(id, 'tick');
        });
    }

    runSequence(first_id, event) {
        let current = first_id;
        let steps = 0;
        while (current && steps < MAX_SEQUENCE_STEPS) {
            steps += 1;
            const block = this.program.blocks.get(current);
            if (!block) return;
            this.ctx.current_block = block;
            const flow = this.runStatement(block, event);
            if (flow === 'end' || flow === 'stop-sequence') return;
            current = block.next;
        }
        if (steps >= MAX_SEQUENCE_STEPS) this.note('Observer sequence stopped at its 200-step bound; the canvas has an unbounded loop.');
    }

    runStatement(block, event) {
        switch (block.op) {
            case 'if':
            case 'if_else': {
                const outcome = this.evaluate(block.inputs.CONDITION);
                const taken = outcome?.status === 'Pass' && outcome.value;
                if (taken) this.runSequence(block.body, event);
                else if (block.op === 'if_else') this.runSequence(block.else_body, event);
                return null;
            }
            case 'repeat': {
                const times = Math.min(MAX_REPEAT, Math.max(1, Number(block.fields.N)));
                for (let iteration = 0; iteration < times && this.budget > 0; iteration += 1) this.runSequence(block.body, event);
                return null;
            }
            case 'once': {
                if (this.once.has(block.id)) return null;
                this.once.add(block.id);
                this.runSequence(block.body, event);
                return null;
            }
            case 'wait': {
                const outcome = this.evaluate(block.inputs.CONDITION);
                if (outcome?.status === 'Pass' && outcome.value) {
                    this.waiters.delete(block.id);
                    this.runSequence(block.body, event);
                    return null;
                }
                if (!this.waiters.has(block.id)) {
                    this.waiters.set(block.id, block);
                    this.note(`Waiting until the condition holds; rechecked on the next genuine tick. ${outcome?.reason ?? ''}`.trim());
                }
                return 'stop-sequence';
            }
            case 'entry':
            case 'entry_any':
                this.runEntry(block, event);
                return null;
            case 'end':
                return 'end';
            case 'continue':
                return null;
            default:
                break;
        }

        const statement = STATEMENTS[block.op];
        if (!statement) {
            this.reportUnimplemented(block);
            return null;
        }
        return statement(this.ctx, block, this.inputs(block));
    }

    /** Entry: the one place the observer asks the bot to trade its existing trade setup. */
    runEntry(block, event) {
        const ctx = this.ctx;
        const outcome = this.evaluate(block.inputs.CONDITION);
        if (!outcome || outcome.status !== 'Pass' || !outcome.value) {
            ctx.last_rejection = outcome?.reason ?? 'Nothing is connected to the entry condition.';
            return;
        }
        const rejection = this.entryGuard();
        if (rejection) {
            ctx.last_rejection = rejection;
            return;
        }
        this.registerSetup(outcome.reason, block.label);
        this.runSequence(block.body, event);
        if (!ctx.pending.length) this.setStage(STAGES.WAITING_PAIR);
    }

    entryGuard() {
        const ctx = this.ctx;
        if (!ctx.connected) return 'Market data is not connected.';
        if (!ctx.market_ready) return 'Market history is not ready yet.';
        if (ctx.force_inconclusive) return 'The evaluation was marked Inconclusive on this tick.';
        if (ctx.awaiting_restart) return 'Restart Monitoring has not run since the last setup.';
        if (ctx.cooldown_active) return 'Cooldown is still running.';
        if (ctx.duplicate_setup) return 'A setup was already recorded for this tick.';
        if (ctx.setups >= ctx.limits.setups) return `${ctx.setups} setups already recorded for this session.`;
        return null;
    }

    /** Records the setup, raises the trade signal and tells the program about it. */
    registerSetup(reason, source) {
        const ctx = this.ctx;
        ctx.setups += 1;
        ctx.duplicate_setup = true;
        // One setup per pass: another trade needs an explicit restart or cooldown first, so a
        // condition that keeps passing cannot start a trade on every single tick.
        ctx.awaiting_restart = true;
        if (ctx.pattern.dedupe) ctx.pattern.emitted_key = `${ctx.tick_index}`;
        ctx.setup_snapshot = { symbol: ctx.symbol, strategy: ctx.strategy, digit: ctx.digit, barrier: ctx.barrier, window: ctx.analysis_window, tick_index: ctx.tick_index };
        this.setStage(STAGES.SETUP, `Setup detected (${source}): ${reason}`);
        this.signalEntry(`${source}: ${reason}`);
        this.dispatch('setup');
    }

    signalEntry(reason) {
        this.entry_pending = true;
        this.note(`Entry conditions passed — the bot starts a trade from its existing trade setup. (${reason})`);
    }

    /** Consumed by the generated program: true exactly once per signalled entry. */
    consumeEntry() {
        if (!this.entry_pending) return false;
        this.entry_pending = false;
        this.setStage(this.ctx.pending.length ? STAGES.EVALUATION : STAGES.WAITING_PAIR);
        return true;
    }

    // ---------------------------------------------------------------- evaluation

    evaluate(id) {
        if (!id) return unknown('Inconclusive: nothing is connected to this socket.');
        if (this.cache.has(id)) return this.cache.get(id);
        const block = this.program.blocks.get(id);
        if (!block) return unknown('Inconclusive: the connected block is no longer on the canvas.');
        if (this.budget <= 0) return unknown('Inconclusive: the 500-operation evaluation budget ran out for this tick.');

        this.budget -= 1;
        const evaluator = EVALUATORS[block.op];
        if (!evaluator) {
            this.reportUnimplemented(block);
            const outcome = unknown(`${block.label} is not evaluated by the observer yet.`);
            this.cache.set(id, outcome);
            return outcome;
        }
        const outcome = evaluator(this.ctx, block, this.inputs(block)) ?? unknown();
        this.cache.set(id, outcome);
        return outcome;
    }

    inputs(block) {
        const args = {};
        Object.entries(block.inputs).forEach(([name, child_id]) => {
            args[name] = this.evaluate(child_id);
        });
        return args;
    }

    /** A value or condition block the generated program reached: evaluated on the spot. */
    evaluateBlock(id) {
        if (!this.active) return null;
        this.budget = MAX_OPS;
        return this.evaluate(id);
    }

    /** A statement block the generated program reached: run it, and the sequence it holds. */
    runStatementById(id) {
        if (!this.active) return;
        const block = this.program.blocks.get(id);
        if (!block) return;
        this.budget = MAX_OPS;
        this.ctx.current_block = block;
        this.runStatement(block, 'program');
    }

    reportUnimplemented(block) {
        if (this.unimplemented.has(block.id)) return;
        this.unimplemented.add(block.id);
        this.note(`"${block.label}" is not evaluated by the observer yet, so anything depending on it stays Inconclusive.`);
    }

    // ---------------------------------------------------------------- observations

    resolveWaiters() {
        [...this.waiters.values()].forEach(block => {
            this.waiters.delete(block.id);
            this.cache.clear();
            const outcome = this.evaluate(block.inputs.CONDITION);
            if (outcome?.status === 'Pass' && outcome.value) this.runSequence(block.body, 'tick');
            else this.waiters.set(block.id, block);
        });
    }

    armObservation({ strategy, ticks = 1, evaluate: custom, label }) {
        const ctx = this.ctx;
        ctx.pending.push({
            strategy: custom ? 'custom' : strategy ?? ctx.strategy,
            digit: ctx.digit,
            barrier: ctx.barrier,
            remaining: Math.max(1, ticks),
            from_tick: ctx.tick_index,
            evaluate: custom ?? (digit => values.outcome(strategy ?? ctx.strategy, digit, ctx.digit, ctx.barrier)),
            label: label ?? (custom ? 'custom evaluation' : strategy ?? ctx.strategy),
        });
        ctx.evaluations += 1;
        this.setStage(STAGES.EVALUATION, `Evaluation pending over ${Math.max(1, ticks)} subsequent genuine tick(s).`);
    }

    armBarrier(rule) {
        const over = String(rule).startsWith('Over');
        const barrier = Number(String(rule).replace(/[^0-9]/g, '')) || 1;
        this.armObservation({
            ticks: 1,
            label: rule,
            evaluate: digit => (over ? digit > barrier : digit < barrier),
        });
    }

    armParity(parity) {
        const wanted = String(parity).toLowerCase() === 'even';
        this.armObservation({ ticks: 1, label: `${parity} parity`, evaluate: digit => values.isEven(digit) === wanted });
    }

    resolvePending() {
        const ctx = this.ctx;
        const due = ctx.pending.filter(observation => observation.from_tick < ctx.tick_index);
        if (!due.length) return;
        ctx.pending = ctx.pending.filter(observation => observation.from_tick >= ctx.tick_index);
        due.forEach(observation => {
            observation.remaining -= 1;
            if (observation.remaining > 0) {
                ctx.pending.push(observation);
                return;
            }
            const digit = values.lastDigit(ctx.digits);
            const qualified = Boolean(observation.evaluate?.(digit));
            this.recordObservation(observation, qualified);
        });
        this.dispatch('complete');
    }

    recordObservation(observation, qualified, reason) {
        const ctx = this.ctx;
        ctx.completed.push({
            strategy: observation.strategy,
            digit: observation.digit,
            barrier: observation.barrier,
            qualified: Boolean(qualified),
            reason,
            tick_index: ctx.tick_index,
        });
        if (ctx.completed.length > 500) ctx.completed.shift();
        const verdict = reason ?? (qualified ? 'Qualified' : 'Not qualified');
        this.note(`${observation.label} observation completed: ${verdict}.`);
        if (ctx.pending.length === 0 && !ctx.cooldown_active) this.setStage(STAGES.WAITING_PAIR);
        this.checkLimits();
    }

    recordSetup() {
        const snapshot = this.ctx.setup_snapshot;
        if (!snapshot) {
            this.note('Record Setup: there is no detected setup to record yet.');
            return;
        }
        this.note(`Recorded setup #${this.ctx.setups} (${snapshot.strategy} on ${snapshot.digit}${snapshot.strategy === 'over' || snapshot.strategy === 'under' ? `, barrier ${snapshot.barrier}` : ''}).`);
    }

    recordOutcome() {
        const ctx = this.ctx;
        if (!ctx.pending.length) {
            this.note('Record Observed Outcome: there is no pending observation to resolve.');
            return;
        }
        const [observation] = ctx.pending.splice(0, 1);
        const digit = values.lastDigit(ctx.digits);
        this.recordObservation(observation, Boolean(observation.evaluate?.(digit)));
    }

    allowNextSetup() {
        this.ctx.pattern.emitted_key = null;
        this.ctx.duplicate_setup = false;
        this.ctx.awaiting_restart = false;
        this.note('The next detected setup may be recorded.');
    }

    // ---------------------------------------------------------------- pattern detector

    /** A pair block watches for two equal adjacent digits at the end of the observed window. */
    detectPair(pairs) {
        const ctx = this.ctx;
        const latest = values.lastDigit(ctx.digits);
        const previous = values.digitAgo(ctx.digits, 1);
        if (latest === null || previous === null || latest !== previous) return;
        const allowed = String(pairs)
            .split('/')
            .map(part => part.trim())
            .filter(part => /^\d\d$/.test(part));
        if (allowed.includes(`${latest}${latest}`)) this.startPattern({ kind: 'pair', digit: latest, describe: `pair ${latest}${latest}` });
    }

    detectRun(kind, run) {
        const ctx = this.ctx;
        const length = Math.max(1, run);
        if (ctx.digits.length < length) return;
        const recent = ctx.digits.slice(-length);
        const matches =
            kind === 'digit'
                ? recent.every(digit => Number(digit) === Number(recent[0]))
                : recent.every(digit => (kind === 'even' ? values.isEven(digit) : !values.isEven(digit)));
        if (!matches) return;
        if (kind === 'digit') this.startPattern({ kind: 'identical', digit: Number(recent[0]), describe: `${length} identical digits (${recent[0]})` });
        else this.startPattern({ kind, parity: kind === 'even' ? 'Even' : 'Odd', describe: `${length} consecutive ${kind} digits` });
    }

    detectParityPattern({ initial, run, confirm, target, timeout, cooldown, minimum }) {
        const ctx = this.ctx;
        if (ctx.digits.length < Math.max(1, minimum)) {
            this.note(`Parity pattern: ${ctx.digits.length} tick(s) observed, ${minimum} required before detection.`);
            return;
        }
        const length = Math.max(1, run);
        const recent = values.windowOf(ctx.digits, length);
        const wanted_even = String(initial).toLowerCase() === 'even';
        if (!recent.every(digit => values.isEven(digit) === wanted_even)) return;
        this.setConfirmation({ parity: String(confirm) === 'Either' ? null : String(confirm) });
        this.setConfirmationTimeout(Number(timeout));
        this.startPattern({ kind: 'parity', parity: String(initial), describe: `${length} consecutive ${initial} digits (next tick target: ${target})` });
        if (Number(cooldown) > 0) this.setCooldown({ ticks: Number(cooldown) });
    }

    detectParitySequence(sequence) {
        const parities = String(sequence)
            .split(/[^A-Za-z]+/)
            .filter(Boolean);
        if (!parities.length) return;
        const matched = values.matchesParitySequence(this.ctx.digits, parities);
        if (matched) this.startPattern({ kind: 'parity-sequence', describe: `parity sequence ${parities.join(', ')}` });
    }

    startPattern({ kind, digit = null, parity = null, describe }) {
        const ctx = this.ctx;
        if (ctx.pattern.dedupe && ctx.pattern.emitted_key && String(ctx.pattern.emitted_key) === `${ctx.tick_index}`) return;
        ctx.pattern.waiting = true;
        ctx.pattern.started_tick = ctx.tick_index;
        ctx.pattern.waited = 0;
        ctx.pattern.confirmed = false;
        ctx.pattern.kind = kind;
        ctx.pattern.describe = describe;
        ctx.pattern.digit = digit;
        if (parity !== null) ctx.pattern.parity = parity;
        this.setStage(STAGES.WAITING_CONFIRMATION, `Pattern detected: ${describe}. Waiting for confirmation.`);
    }

    advancePattern() {
        const ctx = this.ctx;
        const pattern = ctx.pattern;
        if (!pattern.waiting || pattern.started_tick === ctx.tick_index || this.interrupted) return;
        const digit = values.lastDigit(ctx.digits);
        if (digit === null) return;
        pattern.waited += 1;
        const confirmed =
            pattern.confirm_digit !== null
                ? digit === Number(pattern.confirm_digit)
                : pattern.confirm_parity
                  ? values.parityOf(digit).toLowerCase() === String(pattern.confirm_parity).toLowerCase()
                  : true;
        if (confirmed) {
            pattern.waiting = false;
            pattern.confirmed = true;
            ctx.duplicate_setup = false;
            this.setStage(STAGES.SETUP, `Confirmation digit ${digit} arrived after ${pattern.describe}.`);
            this.dispatch('setup');
            return;
        }
        if (pattern.timeout && pattern.waited >= pattern.timeout) {
            this.resetPattern(`Confirmation wait expired after ${pattern.waited} tick(s).`);
            return;
        }
        if (!pattern.intervening) this.resetPattern(`Digit ${digit} intervened before the confirmation.`);
    }

    resetPattern(reason) {
        this.ctx.pattern.waiting = false;
        this.ctx.pattern.confirmed = false;
        this.ctx.pattern.waited = 0;
        this.ctx.pattern.describe = '';
        this.setStage(STAGES.WAITING_PAIR, reason);
    }

    setConfirmation({ digit = null, parity }) {
        const pattern = this.ctx.pattern;
        pattern.confirm_digit = digit === null || digit === undefined ? pattern.confirm_digit : digit;
        if (parity !== undefined) pattern.confirm_parity = parity;
    }

    setIntervening(allow) {
        this.ctx.pattern.intervening = Boolean(allow);
    }

    setConfirmationTimeout(ticks) {
        this.ctx.pattern.timeout = Math.max(0, Number(ticks) || 0);
    }

    setMinimumSample(ticks) {
        this.ctx.minimum_sample = Math.max(1, Number(ticks) || 1);
    }

    setDedupe(flag) {
        this.ctx.pattern.dedupe = Boolean(flag);
    }

    emitSetup(source) {
        const ctx = this.ctx;
        const rejection = this.entryGuard();
        if (rejection) {
            ctx.last_rejection = rejection;
            this.note(`Setup not emitted: ${rejection}`);
            return;
        }
        this.registerSetup(ctx.pattern.describe || 'pattern detector', source ?? 'Emit Setup Detected');
        if (!ctx.pending.length) this.setStage(STAGES.WAITING_PAIR);
    }

    explainPattern() {
        const ctx = this.ctx;
        const pending = ctx.pending.length ? `${ctx.pending.length} pending evaluation(s)` : 'no pending evaluation';
        this.note(`Pattern stage: ${ctx.stage}; ${pending}; ${ctx.setups} setup(s) so far; last rejection: ${ctx.last_rejection}`);
    }

    explainResearch() {
        this.note('Strategy comparison is not evaluated by the observer yet, so its numbers stay Inconclusive.');
    }

    // ---------------------------------------------------------------- session state

    setStage(stage, message) {
        this.ctx.stage = stage;
        if (message) this.note(message);
    }

    setDigit(digit, source) {
        this.ctx.digit = Math.max(0, Math.min(9, Number(digit)));
        this.ctx.digit_selected = true;
        this.note(`${source}: selected digit ${this.ctx.digit}.`);
    }

    setBarrier(barrier) {
        this.ctx.barrier = Math.max(0, Math.min(9, Number(barrier)));
        this.note(`Barrier set to ${this.ctx.barrier}.`);
    }

    configureStrategy(strategy) {
        this.ctx.strategy = strategy;
        if (strategy === 'matches' || strategy === 'differs') this.ctx.digit_selected = true;
        this.note(`Strategy configured: ${strategy}.`);
    }

    setCooldown({ ticks = 0, seconds = 0 }) {
        const ctx = this.ctx;
        ctx.awaiting_restart = false;
        ctx.duplicate_setup = false;
        ctx.cooldown_until_tick = Math.max(ctx.cooldown_until_tick, ctx.tick_index + Math.max(0, ticks));
        ctx.cooldown_until_time = Math.max(ctx.cooldown_until_time, ctx.now + Math.max(0, seconds) * 1000);
        this.note(`Restart allowed after ${ticks} tick(s) / ${seconds} second(s).`);
    }

    restart(reason) {
        const ctx = this.ctx;
        ctx.cooldown_until_tick = 0;
        ctx.cooldown_until_time = 0;
        ctx.duplicate_setup = false;
        ctx.awaiting_restart = false;
        ctx.pattern.emitted_key = null;
        this.setStage(STAGES.WAITING_PAIR, `${reason}: a new setup may be detected on a subsequent tick.`);
    }

    resetStreak() {
        this.ctx.consecutive.clear();
        this.note('Streak counters reset; the digit window itself is preserved.');
    }

    resetSession() {
        const ctx = this.ctx;
        ctx.variables.clear();
        ctx.consecutive.clear();
        ctx.completed = [];
        ctx.pending = [];
        ctx.setups = 0;
        ctx.evaluations = 0;
        ctx.cooldown_until_tick = 0;
        ctx.cooldown_until_time = 0;
        ctx.duplicate_setup = false;
        ctx.awaiting_restart = false;
        ctx.pattern = this.fresh_pattern();
        this.setStage(STAGES.WAITING_PAIR, 'Session state reset; the journal is preserved.');
    }

    setLimit(key, value) {
        this.ctx.limits[key] = value;
        if (value === true) this.note(`Safety limit enabled: ${key}.`);
        else this.note(`Safety limit set: stop after ${value} ${key}.`);
    }

    requestPause() {
        this.ctx.paused = true;
        this.note('Paused by the observer program; monitoring resumes with Resume Monitoring.');
    }

    requestStop(reason = 'Stop requested by the observer program') {
        this.note(`Stop requested: ${reason}.`);
        this.setMonitoring(false);
        this.onStop(reason);
    }

    setMonitoring(flag) {
        this.ctx.monitoring = Boolean(flag);
        this.ctx.paused = false;
        this.note(flag ? 'Monitoring started.' : 'Monitoring stopped by the observer program.');
    }

    markInconclusive() {
        this.ctx.force_inconclusive = true;
        this.note('Evaluation marked Inconclusive; no entry can be signalled on this tick.');
    }

    checkLimits() {
        const ctx = this.ctx;
        if (!this.active) return;
        if (ctx.setups >= ctx.limits.setups) {
            this.requestStop(`Stop After N Setups (${ctx.limits.setups})`);
            return;
        }
        if (ctx.evaluations >= ctx.limits.evaluations) this.requestStop(`Stop After N Evaluations (${ctx.limits.evaluations})`);
        const duration = (ctx.now - (ctx.started_at ?? ctx.now)) / 1000;
        if (duration > ctx.limits.duration) this.requestStop(`Stop After Session Duration (${ctx.limits.duration}s)`);
    }

    // ---------------------------------------------------------------- journal

    note(message, dedupe = false) {
        const text = String(message ?? '').trim();
        if (!text) return;
        if (dedupe && this.last_note === text) return;
        this.last_note = text;
        this.journal(`Observer: ${text}`);
    }
}

export default ObserverEngine;
