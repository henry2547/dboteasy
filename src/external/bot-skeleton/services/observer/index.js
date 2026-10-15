/**
 * The observer runtime the bot session talks to.
 *
 * Wiring:
 * - `attach()` is called once per run, right before the program is generated. It reads the observer
 *   program off the canvas and reports whether trading should be gated on it.
 * - the trade engine's tick subscription calls `feedTick()` with every genuine tick;
 * - the generated program calls `consumeEntry()` before it starts a trade, so a trade happens only
 *   when the observer's entry conditions passed — using the trade parameters already on the canvas;
 * - `detach()` on stop, pause and resume.
 *
 * Journal lines go to the run panel's journal through the same `ui.log.notify` channel the other
 * blocks use, so the observer never needs its own store or panel.
 */
import { observer as globalObserver } from '../../utils/observer';
import { ObserverEngine } from './observer-engine';
import { readProgram, readTradeSetupSymbol } from './observer-program';

const journal = message => globalObserver.emit('ui.log.notify', { className: 'info', message });

let engine = null;

const createEngine = ({ workspace, onStop, onPause } = {}) => {
    const program = readProgram(workspace);
    if (!program.blocks.size) return null;
    const symbol = readTradeSetupSymbol(workspace);
    if (program.has_entry_gate && !symbol) {
        journal('Observer: an entry block is on the canvas, but the trade parameters are not set, so no trade can start.');
    }
    return new ObserverEngine(program, {
        journal,
        symbol,
        onStop: reason => {
            if (typeof onStop === 'function') onStop(reason);
        },
        onPause: () => {
            if (typeof onPause === 'function') onPause();
        },
    });
};

export const observerRuntime = {
    /** Reads the canvas and starts a fresh session. Returns true when the observer gates trading. */
    attach(options = {}) {
        this.detach('Starting a new run');
        engine = createEngine(options);
        if (!engine) return false;
        engine.start({ symbol: engine.ctx.symbol });
        return engine.gate_enabled;
    },

    detach(reason) {
        if (!engine) return;
        engine.stop(reason ?? 'Bot stopped');
        engine = null;
    },

    /** One genuine tick from the running feed. */
    feedTick(tick) {
        engine?.feedTick(tick);
    },

    /** The feed reported a connection change directly. */
    connection(connected) {
        engine?.connection(connected);
    },

    /** True while the observer program gates trading (the canvas has entry blocks). */
    gateEnabled() {
        return Boolean(engine?.gate_enabled);
    },

    /** Consumed by the generated program: true exactly once per signalled entry. */
    consumeEntry() {
        return Boolean(engine?.consumeEntry());
    },

    /** A value block the generated program reached: its value, or `fallback` when Inconclusive. */
    valueOfBlock(id, fallback) {
        const outcome = engine?.evaluateBlock(id);
        const usable = outcome?.status === 'Pass' && outcome.value !== null && outcome.value !== undefined;
        return usable ? outcome.value : fallback;
    },

    /** A condition block the generated program reached: true only when it genuinely passes. */
    conditionOfBlock(id) {
        const outcome = engine?.evaluateBlock(id);
        return Boolean(outcome?.status === 'Pass' && outcome.value);
    },

    /** A statement block the generated program reached: run it through the observer. */
    runStatement(id) {
        engine?.runStatementById(id);
    },

    /** Diagnostics for tests and manual checks — never used by the bots themselves. */
    get current() {
        return engine;
    },
};

export default observerRuntime;
