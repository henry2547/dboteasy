/**
 * The Virtual Hook runtime singleton the bot session talks to.
 *
 * - `attach()` runs once per Run, right before the program is generated: it reads the hook
 *   blocks off the canvas and registers the enabled hooks.
 * - the trade engine's tick subscription calls `feedTick()` with every genuine tick (the same
 *   call site that feeds the observer), so hooks never open a feed of their own.
 * - the generated program reaches `conditionOfBlock()` / `resultOfBlock()` / `trigger()` when a
 *   Virtual Hook Condition (for example inside Purchase conditions), a result or a trigger block
 *   is part of the strategy.
 * - `detach()` on Stop clears dispatch, queues and the contract listener, so no late execution
 *   can act after the bot has been stopped.
 *
 * The monitor reads `getSnapshot()`; it is a plain object built on demand, so tick frequency
 * never re-renders React.
 */
import { observer as globalObserver } from '../../utils/observer';
import { observerRuntime } from '../observer';
import VirtualHookManager from './virtual-hook-manager';
import { readHookProgram } from './virtual-hook-program';

const journal = (message, level = 'info') =>
    globalObserver.emit('ui.log.notify', { className: level === 'error' ? 'error' : 'info', message });

const EMPTY_SNAPSHOT = {
    active: false,
    startedAt: null,
    feed: {
        healthy: false,
        reason: 'Virtual hooks are not running; start the bot to receive ticks.',
        symbol: '',
        lastTickAt: null,
        ageMs: null,
        validTicks: 0,
        lastDigit: null,
        quote: null,
    },
    hooks: [],
    listeners: [],
    executions: [],
    errors: [],
    metrics: {
        ticksReceived: 0,
        eventsDispatched: 0,
        executionsCompleted: 0,
        executionsBlocked: 0,
        activeExecutions: 0,
    },
};

let manager = null;

export const virtualHookRuntime = {
    /**
     * Reads the canvas and starts a fresh session.
     * @returns {{ hasBlocks: boolean, hooks: number, errors: string[] }}
     */
    attach({ workspace, symbol = '' } = {}) {
        // A fresh manager per run: no listener, queue or contract subscription survives a Run/Stop cycle.
        if (manager) manager.stop('Starting a new run', { silent: true });
        const program = readHookProgram(workspace);
        if (!program.has_hook_blocks) {
            manager = null;
            return { hasBlocks: false, hooks: 0, errors: [] };
        }
        manager = new VirtualHookManager({ journal, observer: observerRuntime });
        const hooks = manager.attach(program, { symbol });
        return { hasBlocks: true, hooks, errors: program.errors };
    },

    detach(reason = 'Bot stopped') {
        manager?.stop(reason);
    },

    feedTick(tick) {
        manager?.feedTick(tick);
    },

    /** A condition block reached by the generated program (Purchase conditions). */
    conditionOfBlock(id) {
        return manager ? manager.conditionOfBlock(id) : false;
    },

    /** A result block reached by the generated program. */
    resultOfBlock(id, field) {
        return manager ? manager.resultOfBlock(id, field) : '';
    },

    /** Manual trigger from a Trigger block inside the generated program. */
    triggerFromProgram(name, data = '') {
        return manager ? manager.trigger(name, { data }) : false;
    },

    setEnabled(name, enabled) {
        return manager ? manager.setEnabled(name, enabled) : false;
    },

    clearDiagnostics() {
        manager?.clearDiagnostics();
    },

    /** Monitor-facing state, never used by the bot itself. */
    getSnapshot() {
        return manager ? manager.getSnapshot() : EMPTY_SNAPSHOT;
    },

    get manager() {
        return manager;
    },
};

export default virtualHookRuntime;
