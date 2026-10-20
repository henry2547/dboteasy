/**
 * The Virtual Hook Manager: registration, dispatch, execution and diagnostics.
 *
 * Lifecycle: `attach(program)` once per Run (right before the program is generated), genuine
 * ticks through `feedTick()` from the existing trade-engine subscription, and `stop()` on Stop /
 * unmount. Nothing here buys a contract — the manager has no purchase call, and a listener that
 * carries a Purchase block is rejected when the canvas is read.
 *
 * Concurrency is per hook and explicit:
 * - `sequential` — one execution at a time; events that arrive while busy are queued in order,
 *   and once the queue is full the newest event is dropped and recorded;
 * - `skip` — an event that arrives while the hook is running is skipped and counted;
 * - `queue` — events are queued; once the queue is full the oldest pending event is dropped so
 *   the newest signal still runs.
 *
 * Every execution carries its own id, event id and recursion depth, so a hook that triggers
 * another hook is traceable and a runaway chain is cut at `maxDepth`.
 */
import { observer as globalObserver } from '../../utils/observer';
import { evaluateVirtualHookCondition } from './virtual-hook-conditions';
import { conditionOfBlock } from './virtual-hook-program';
import { MAX_SEQUENCE_STEPS, runHookSequence } from './virtual-hook-executor';
import { PATTERN_CONDITIONS } from './virtual-hook-types';

const DEFAULTS = {
    freshnessSeconds: 20,
    gapSeconds: 30,
    maxQueue: 20,
    maxDepth: 4,
    maxExecutions: 30,
    maxErrors: 50,
    maxDigits: 1000,
    maxTraceSteps: 40,
    maxFiredKeys: 5000,
};

let sequence = 0;

const nextId = prefix => {
    sequence += 1;
    return `${prefix}-${sequence}`;
};

/** Digits come from the validated quote and the market's decimal precision, never a display string. */
export const digitFromQuote = (quote, pipSize) => {
    const size = Number(pipSize);
    if (!Number.isInteger(size) || size < 0 || size > 8) return null;
    const fixed = Number(quote).toFixed(size);
    const digit = Number(fixed.slice(-1));
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
};

export class VirtualHookManager {
    constructor(options = {}) {
        this.options = { ...DEFAULTS, ...options };
        this.journal = options.journal ?? (() => {});
        this.now = options.now ?? (() => Date.now());
        this.sleep =
            options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0))));
        this.observer = options.observer ?? null;

        this.program = null;
        this.definitions = new Map();
        this.listenersByHook = new Map();
        this.states = new Map();
        this.executions = [];
        this.errors = [];
        this.queues = new Map();
        this.firedKeys = new Set();
        this.variables = new Map();
        this.conditionReadings = new Map();

        this.active = false;
        this.generation = 0;
        this.startedAt = null;
        this.symbol = '';
        this.pipSize = null;
        this.digits = [];
        this.validTicks = 0;
        this.lastTickAt = null;
        this.lastTickEpoch = null;
        this.lastQuote = null;
        this.lastEventKey = null;
        this.currentExecution = null;
        this.metrics = {
            ticksReceived: 0,
            duplicatesIgnored: 0,
            eventsDispatched: 0,
            executionsCompleted: 0,
            executionsBlocked: 0,
            activeExecutions: 0,
        };
        this.contractSubscription = null;
    }

    // ------------------------------------------------------------------ lifecycle

    /**
     * Registers the hooks read off the canvas and starts a fresh session.
     * @param {import('./virtual-hook-types').VirtualHookProgram} program
     */
    attach(program, { symbol = '' } = {}) {
        this.stop('Starting a new run', { silent: true });
        this.program = program;
        this.errors = [];
        this.executions = [];
        this.firedKeys.clear();
        this.variables.clear();
        this.queues.clear();
        this.listenersByHook.clear();
        this.states.clear();
        this.definitions.clear();

        (program?.errors ?? []).forEach(message => this.recordError(null, message));
        (program?.warnings ?? []).forEach(message => this.journal(message));

        (program?.definitions ?? []).forEach(definition => {
            this.definitions.set(definition.name, definition);
            this.states.set(definition.name, {
                definition,
                enabled: definition.enabled,
                state: definition.enabled ? 'idle' : 'disabled',
                triggerCount: 0,
                skippedCount: 0,
                droppedCount: 0,
                queueDepth: 0,
                lastEventAt: null,
                lastEventType: null,
                lastReason: null,
                lastResult: null,
                lastError: null,
                lastExecutionId: null,
                running: false,
            });
        });
        (program?.listeners ?? []).forEach(listener => {
            const list = this.listenersByHook.get(listener.hook) ?? [];
            list.push(listener);
            this.listenersByHook.set(listener.hook, list);
        });

        this.active = true;
        this.generation += 1;
        this.startedAt = this.now();
        this.symbol = symbol;
        this.digits = [];
        this.validTicks = 0;
        this.lastTickAt = null;
        this.lastTickEpoch = null;
        this.lastQuote = null;
        this.lastEventKey = null;

        this.subscribeContractEvents();
        const registered = this.definitions.size;
        const listeners = program?.listeners?.length ?? 0;
        this.journal(
            registered
                ? `Virtual hooks: ${registered} hook(s) and ${listeners} listener(s) registered. They run only when their event actually occurs.`
                : 'Virtual hooks: the canvas uses hook blocks but registers no hook, so no event will run.'
        );
        return registered;
    }

    stop(reason = 'Bot stopped', { silent = false } = {}) {
        if (this.contractSubscription) {
            globalObserver.unregister('contract.status', this.contractSubscription);
            this.contractSubscription = null;
        }
        const wasActive = this.active;
        this.active = false;
        this.generation += 1;
        this.queues.clear();
        this.states.forEach(state => {
            state.running = false;
            state.queueDepth = 0;
            if (state.state === 'queued') state.state = 'idle';
        });
        if (wasActive && !silent) this.journal(`Virtual hooks stopped: ${reason}. No further events will run.`);
    }

    subscribeContractEvents() {
        this.contractSubscription = contract => {
            if (!contract) return;
            const type =
                contract.id === 'contract.sold' || contract.id === 'contract.closed'
                    ? 'contract_settled'
                    : 'contract_purchased';
            this.notifyContract(type, contract);
        };
        globalObserver.register('contract.status', this.contractSubscription);
    }

    setEnabled(name, enabled) {
        const state = this.states.get(name);
        if (!state) {
            this.recordError(name, `Cannot ${enabled ? 'enable' : 'disable'} "${name}": no such hook is registered.`);
            return false;
        }
        state.enabled = Boolean(enabled);
        state.state = state.enabled ? 'idle' : 'disabled';
        if (!state.enabled) {
            this.queues.delete(name);
            state.queueDepth = 0;
        }
        this.journal(`Virtual hook "${name}" ${state.enabled ? 'enabled' : 'disabled'}.`);
        return true;
    }

    // ------------------------------------------------------------------ events in

    /**
     * One genuine tick from the running feed.
     * @returns {import('./virtual-hook-types').VirtualHookEvent|null}
     */
    feedTick({ symbol, price, epoch, pip_size } = {}) {
        if (!this.active) return null;
        const now = this.now();
        const quote = Number(price);
        const tickEpoch = Number(epoch);

        if (!symbol || !Number.isFinite(quote) || !Number.isFinite(tickEpoch)) {
            this.recordError(null, 'Ignored a malformed tick: symbol, quote and epoch are required.');
            return null;
        }
        if (Number.isFinite(Number(pip_size))) this.pipSize = Number(pip_size);
        const digit = digitFromQuote(quote, this.pipSize);
        if (digit === null) {
            this.recordError(null, `Ignored a tick with unusable precision (pip size ${this.pipSize}).`);
            return null;
        }

        const eventKey = `${symbol}|${tickEpoch}|${quote}`;
        if (eventKey === this.lastEventKey) {
            this.metrics.duplicatesIgnored += 1;
            return null;
        }

        if (symbol !== this.symbol) {
            const previous = this.symbol;
            this.symbol = symbol;
            this.digits = [];
            this.validTicks = 0;
            this.lastTickEpoch = null;
            this.journal(`Virtual hooks: market changed${previous ? ` from ${previous}` : ''} to ${symbol}; the digit buffer starts fresh.`);
        }

        const gap = this.lastTickEpoch !== null ? tickEpoch - this.lastTickEpoch : 0;
        const interrupted = this.isStale(now) && this.lastTickAt !== null;
        if (interrupted) {
            this.journal('Virtual hooks: market data returned after a gap; no condition runs on the stale buffer.');
            this.digits = [];
        }
        if (gap > this.options.gapSeconds) {
            this.digits = [];
            this.journal(
                `Virtual hooks: ${gap}s gap before this tick; the pattern buffer was cleared so no partial pattern spans the gap.`
            );
        }

        this.lastEventKey = eventKey;
        this.lastTickAt = now;
        this.lastTickEpoch = tickEpoch;
        this.lastQuote = quote;
        this.validTicks += 1;
        this.metrics.ticksReceived += 1;
        this.conditionReadings.clear();
        this.digits.push(digit);
        if (this.digits.length > this.options.maxDigits) {
            this.digits.splice(0, this.digits.length - this.options.maxDigits);
        }

        const context = this.dataContext(now);
        const event = {
            id: `${symbol}:${tickEpoch}`,
            type: 'tick',
            symbol,
            epoch: tickEpoch,
            quote,
            digit,
            at: now,
            pattern: null,
            reason: `Genuine tick ${tickEpoch} on ${symbol}, last digit ${digit}.`,
        };

        this.dispatchTick(event, context);
        return event;
    }

    /** Contract lifecycle, delivered by trade/Purchase.js / OpenContract.js through the observer bus. */
    notifyContract(type, contract) {
        if (!this.active) return;
        const now = this.now();
        const contractId = contract?.contract_id ?? contract?.contractId ?? 'unknown';
        const event = {
            id: `contract:${contractId}:${type}:${now}`,
            type,
            symbol: this.symbol,
            epoch: this.lastTickEpoch,
            quote: this.lastQuote,
            digit: this.digits.length ? this.digits[this.digits.length - 1] : null,
            at: now,
            pattern: null,
            reason: `${type === 'contract_purchased' ? 'Contract purchased' : 'Contract settled'} (${contractId}).`,
        };
        this.dispatchEvent(this.matchingHooks(event), event);
    }

    dispatchTick(event, context) {
        this.states.forEach(state => {
            const definition = state.definition;
            if (!state.enabled) return;
            if (definition.market && definition.market !== event.symbol) return;

            let condition = { passed: true, reason: 'No condition configured.', pattern: null };
            if (definition.condition) condition = evaluateVirtualHookCondition(definition.condition, context);
            state.lastReason = condition.reason;

            const patternCondition = definition.condition && PATTERN_CONDITIONS.has(definition.condition.type);
            let eligible = false;
            if (definition.event === 'tick') eligible = condition.passed;
            else if (definition.event === 'digit_pattern') eligible = Boolean(patternCondition && condition.passed);
            else if (definition.event === 'analysis_condition') {
                eligible = Boolean(definition.condition && !patternCondition && condition.passed);
            }
            if (!eligible) return;

            const fired = {
                ...event,
                type: definition.event,
                pattern: condition.pattern ?? null,
                reason: condition.reason,
            };
            this.dispatch(defStateName(state), fired, null, 0);
        });
    }

    matchingHooks(event) {
        return [...this.states.values()]
            .filter(state => state.enabled && state.definition.event === event.type)
            .map(state => state.definition.name);
    }

    dispatchEvent(names, event) {
        names.forEach(name => this.dispatch(name, event, null, 0));
    }

    /** Explicit manual trigger, from the Trigger block or an already running listener. */
    trigger(name, { data = '', parentId = null, depth = 0, fromHook = null } = {}) {
        const state = this.states.get(String(name ?? '').trim());
        if (!state) {
            this.recordError(name, `Trigger ignored: hook "${name}" is not registered.`);
            return false;
        }
        if (!this.active) {
            this.recordError(name, `Trigger ignored: the bot is not running, so hook "${name}" cannot fire.`);
            return false;
        }
        if (!state.enabled) {
            this.recordError(name, `Trigger ignored: hook "${name}" is disabled.`);
            return false;
        }
        if (fromHook && fromHook === state.definition.name) {
            this.recordError(name, `Trigger blocked: hook "${name}" cannot trigger itself.`);
            return false;
        }
        if (depth >= this.options.maxDepth) {
            this.recordError(
                name,
                `Trigger blocked: hook chain reached the ${this.options.maxDepth}-level recursion limit at "${name}".`
            );
            return false;
        }
        const now = this.now();
        const event = {
            id: nextId('manual'),
            type: 'manual',
            symbol: this.symbol,
            epoch: this.lastTickEpoch,
            quote: this.lastQuote,
            digit: this.digits.length ? this.digits[this.digits.length - 1] : null,
            at: now,
            pattern: null,
            reason: fromHook ? `Triggered by hook "${fromHook}".` : 'Manual trigger.',
            data: String(data ?? ''),
        };
        return this.dispatch(name, event, parentId, depth + 1);
    }

    dispatch(name, event, parentId, depth) {
        const state = this.states.get(name);
        if (!state || !this.active || !state.enabled) return false;

        const firedKey = `${event.id}|${name}`;
        if (this.firedKeys.has(firedKey)) {
            if (event.type === 'tick') this.metrics.duplicatesIgnored += 1;
            return false;
        }
        this.firedKeys.add(firedKey);
        if (this.firedKeys.size > this.options.maxFiredKeys) {
            this.firedKeys.delete(this.firedKeys.values().next().value);
        }

        const definition = state.definition;
        if (state.running) {
            if (definition.concurrency === 'skip') {
                state.skippedCount += 1;
                state.lastReason = `Skipped ${event.type} ${event.id}: the previous execution is still running.`;
                return false;
            }
            const queue = this.queues.get(name) ?? [];
            if (queue.length >= this.options.maxQueue) {
                if (definition.concurrency === 'queue') {
                    const dropped = queue.shift();
                    state.droppedCount += 1;
                    this.recordError(
                        name,
                        `Queue full (${this.options.maxQueue}): dropped the oldest pending event ${dropped.event.id}.`
                    );
                } else {
                    state.droppedCount += 1;
                    state.lastReason = `Dropped ${event.type} ${event.id}: the hook queue is full.`;
                    this.recordError(name, `Queue full (${this.options.maxQueue}): dropped event ${event.id}.`);
                    return false;
                }
            }
            queue.push({ event, parentId, depth });
            this.queues.set(name, queue);
            state.queueDepth = queue.length;
            state.state = 'queued';
            return true;
        }

        this.metrics.eventsDispatched += 1;
        this.runHook(name, event, parentId, depth);
        return true;
    }

    // ------------------------------------------------------------------ execution

    async runHook(name, event, parentId, depth) {
        const state = this.states.get(name);
        if (!state) return;
        const generation = this.generation;
        const definition = state.definition;
        const execution = {
            id: nextId('vh'),
            hook: name,
            hookId: definition.id,
            event,
            parentId: parentId ?? null,
            depth: depth ?? 0,
            startedAt: this.now(),
            finishedAt: null,
            durationMs: null,
            state: 'running',
            steps: [],
            result: '',
            error: null,
        };

        state.running = true;
        state.state = 'running';
        state.lastEventAt = event.at;
        state.lastEventType = event.type;
        state.triggerCount += 1;
        state.lastExecutionId = execution.id;
        this.metrics.activeExecutions += 1;
        this.executions.unshift(execution);
        if (this.executions.length > this.options.maxExecutions) this.executions.pop();
        this.currentExecution = execution;

        const step = (label, detail, status = 'ok') => {
            if (execution.steps.length >= this.options.maxTraceSteps) return;
            execution.steps.push({ at: this.now(), label, detail, status });
        };

        const listeners = this.listenersByHook.get(name) ?? [];
        step(
            event.type === 'tick' ? 'Tick received' : `${event.type} event received`,
            `${event.reason} (event ${event.id})`
        );
        step('Last digit extracted', event.digit === null ? 'No digit available.' : `Last digit ${event.digit}.`);
        step(
            'Condition evaluated',
            definition.condition
                ? `${definition.condition.type}: ${event.reason}`
                : 'No condition configured; the event alone is enough.'
        );
        step('Hook matched', `${listeners.length} listener(s) registered for "${name}".`);

        if (!listeners.length) {
            step('No listener attached', `Register a "When Virtual Hook ${name} fires" block to give this hook logic.`, 'blocked');
            execution.state = 'error';
            execution.error = `No listener is attached to hook "${name}".`;
            state.lastResult = 'No listener attached';
            state.lastError = execution.error;
            state.state = 'error';
            this.metrics.executionsBlocked += 1;
            this.recordError(name, execution.error);
            this.finishExecution(execution, state);
            return;
        }

        const tools = {
            blocks: this.program?.blocks ?? new Map(),
            context: this.dataContext(),
            variables: this.variables,
            hookName: name,
            conditionConfig: conditionOfBlock,
            result: field => this.resultValue(field, execution),
            journal: (message, level = 'info') => {
                step('Journal', String(message), level === 'error' ? 'error' : 'ok');
                this.journal(`Hook "${name}": ${message}`, level);
            },
            trigger: target =>
                this.trigger(target, {
                    parentId: execution.id,
                    depth: execution.depth,
                    fromHook: name,
                }),
            observer: this.observer,
            isCancelled: () => generation !== this.generation || !this.active,
            sleep: this.sleep,
            onStep: (label, detail) => step(label, detail),
        };

        try {
            for (const listener of listeners) {
                if (tools.isCancelled()) {
                    execution.state = 'cancelled';
                    execution.error = 'Cancelled: the bot was stopped.';
                    state.lastResult = 'Cancelled';
                    break;
                }
                if (!listener.body) {
                    step('Listener empty', `Listener ${listener.id} has no blocks attached.`, 'blocked');
                    continue;
                }
                const outcome = await runHookSequence(listener.body, tools);
                if (outcome.stopped === 'cancelled') {
                    execution.state = 'cancelled';
                    execution.error = 'Cancelled: the bot was stopped before the listener finished.';
                    state.lastResult = 'Cancelled';
                    break;
                }
                if (outcome.stopped === 'bounded' || outcome.stopped === 'missing') {
                    step('Listener stopped', `Sequence ended early (${outcome.stopped}).`, 'error');
                }
            }
            if (execution.state !== 'cancelled') {
                step('Purchase not requested', 'Virtual hooks never buy; a Purchase block in Purchase conditions decides that.', 'ok');
                execution.state = 'completed';
                execution.result = this.describeExecution(name, event);
                state.lastResult = execution.result;
                this.metrics.executionsCompleted += 1;
            }
            state.lastError = execution.error;
        } catch (error) {
            execution.state = 'error';
            execution.error = error?.message ?? String(error);
            state.lastResult = 'Execution error';
            state.lastError = execution.error;
            this.metrics.executionsBlocked += 1;
            this.recordError(name, `Execution error: ${execution.error}`);
            step('Execution error', execution.error, 'error');
        } finally {
            this.finishExecution(execution, state);
        }
    }

    describeExecution(name, event) {
        const matched = event.pattern?.length ? ` pattern ${event.pattern.join(',')}` : '';
        return `${name}: ${event.type} on ${event.symbol}${matched} (${event.reason})`;
    }

    finishExecution(execution, state) {
        execution.finishedAt = this.now();
        execution.durationMs = execution.finishedAt - execution.startedAt;
        if (state.running) this.metrics.activeExecutions = Math.max(0, this.metrics.activeExecutions - 1);
        state.running = false;
        state.state = state.enabled ? (execution.state === 'error' ? 'error' : 'idle') : 'disabled';
        if (this.currentExecution === execution) this.currentExecution = null;

        const name = execution.hook;
        const queue = this.queues.get(name) ?? [];
        if (!this.active || !queue.length) {
            if (!queue.length) this.queues.delete(name);
            state.queueDepth = 0;
            return;
        }
        const next = queue.shift();
        state.queueDepth = queue.length;
        if (!queue.length) this.queues.delete(name);
        state.state = 'queued';
        this.runHook(name, next.event, next.parentId, next.depth);
    }

    // ------------------------------------------------------------------ reads for generated code

    /**
     * Value of a `vhook_condition` block reached by the generated program — the block placed inside
     * the Purchase conditions stack. False whenever the setup is not true right now.
     */
    conditionOfBlock(id) {
        return this.evaluateConditionBlock(id).passed;
    }

    evaluateConditionBlock(id) {
        const node = this.program?.blocks?.get(id);
        if (!node || node.type !== 'vhook_condition') {
            return { passed: false, reason: 'Not a Virtual Hook Condition block.', pattern: null };
        }
        if (!this.active) return { passed: false, reason: 'Virtual hook session is not running.', pattern: null };
        const feed = this.feedHealth();
        if (!feed.healthy) return { passed: false, reason: feed.reason, pattern: null };

        const cached = this.conditionReadings.get(id);
        if (cached) return cached;
        const config = conditionOfBlock(node);
        const result = evaluateVirtualHookCondition(config, this.dataContext());
        const reading = { ...result, at: this.now() };
        this.conditionReadings.set(id, reading);
        return reading;
    }

    resultValue(field, execution = null) {
        const current = execution ?? this.currentExecution ?? this.executions[0] ?? null;
        const event = current?.event ?? null;
        const digit = event?.digit ?? (this.digits.length ? this.digits[this.digits.length - 1] : null);
        const sample = this.digits.slice(-100);
        const frequency = digit === null || !sample.length
            ? null
            : (sample.filter(value => value === digit).length / sample.length) * 100;

        switch (String(field ?? 'hook_name')) {
            case 'event_type':
                return event?.type ?? 'none';
            case 'market':
                return event?.symbol ?? this.symbol;
            case 'event_timestamp':
                return event?.epoch === null || event?.epoch === undefined ? '' : String(event.epoch);
            case 'quote':
                return event?.quote === null || event?.quote === undefined ? '' : String(event.quote);
            case 'last_digit':
                return digit === null ? '' : String(digit);
            case 'matched_pattern':
                return event?.pattern?.length ? event.pattern.join(',') : '';
            case 'trigger_reason':
                return event?.reason ?? '';
            case 'digit_frequency':
                return frequency === null ? '' : frequency.toFixed(2);
            case 'condition_result':
                return event ? 'true' : 'false';
            case 'execution_id':
                return current?.id ?? '';
            case 'hook_name':
            default:
                return current?.hook ?? '';
        }
    }

    resultOfBlock(id, field) {
        const node = this.program?.blocks?.get(id);
        if (!node || node.type !== 'vhook_result') return '';
        return this.resultValue(field ?? node.fields.FIELD);
    }

    // ------------------------------------------------------------------ diagnostics

    /** Clears historical diagnostics only; the registered hooks themselves are untouched. */
    clearDiagnostics() {
        this.errors = [];
        this.executions = [];
        this.states.forEach(state => {
            state.lastError = null;
            state.lastResult = null;
        });
    }

    recordError(hook, message) {
        this.errors.unshift({ at: this.now(), hook: hook ? String(hook) : null, message });
        if (this.errors.length > this.options.maxErrors) this.errors.pop();
        this.journal(`Virtual hooks: ${message}`, 'error');
    }

    isStale(now = this.now()) {
        if (this.lastTickAt === null) return true;
        return now - this.lastTickAt > this.options.freshnessSeconds * 1000;
    }

    feedHealth(now = this.now()) {
        if (!this.active) {
            return { healthy: false, reason: 'Virtual hooks are not running; start the bot to receive ticks.' };
        }
        if (this.lastTickAt === null) {
            return { healthy: false, reason: 'Waiting for the first genuine tick.' };
        }
        const age = now - this.lastTickAt;
        if (age > this.options.freshnessSeconds * 1000) {
            return {
                healthy: false,
                reason: `No genuine tick for ${Math.round(age / 1000)}s; data-dependent hooks are suspended until the feed returns.`,
            };
        }
        return { healthy: true, reason: `Feed healthy: last tick ${Math.round(age / 1000)}s ago.` };
    }

    dataContext(now = this.now()) {
        return {
            symbol: this.symbol,
            digits: this.digits,
            lastDigit: this.digits.length ? this.digits[this.digits.length - 1] : null,
            quote: this.lastQuote,
            epoch: this.lastTickEpoch,
            validTicks: this.validTicks,
            now,
        };
    }

    getSnapshot() {
        const now = this.now();
        const feed = this.feedHealth(now);
        return {
            active: this.active,
            startedAt: this.startedAt,
            feed: {
                healthy: feed.healthy,
                reason: feed.reason,
                symbol: this.symbol,
                lastTickAt: this.lastTickAt,
                ageMs: this.lastTickAt === null ? null : now - this.lastTickAt,
                validTicks: this.validTicks,
                lastDigit: this.digits.length ? this.digits[this.digits.length - 1] : null,
                quote: this.lastQuote,
            },
            hooks: [...this.states.values()]
                .sort((a, b) => a.definition.priority - b.definition.priority || a.definition.name.localeCompare(b.definition.name))
                .map(state => ({
                    definition: state.definition,
                    enabled: state.enabled,
                    state: state.enabled ? state.state : 'disabled',
                    listenerCount: (this.listenersByHook.get(state.definition.name) ?? []).length,
                    triggerCount: state.triggerCount,
                    skippedCount: state.skippedCount,
                    droppedCount: state.droppedCount,
                    queueDepth: state.queueDepth,
                    lastEventAt: state.lastEventAt,
                    lastEventType: state.lastEventType,
                    lastReason: state.lastReason,
                    lastResult: state.lastResult,
                    lastError: state.lastError,
                    lastExecutionId: state.lastExecutionId,
                })),
            listeners: [...this.listenersByHook.entries()].flatMap(([hook, list]) =>
                list.map(listener => ({
                    hook,
                    blockId: listener.id,
                    order: listener.order,
                    blocks: listener.body ? this.countChain(listener.body) : 0,
                }))
            ),
            executions: this.executions.map(execution => ({
                ...execution,
                event: { ...execution.event },
                steps: [...execution.steps],
            })),
            errors: [...this.errors],
            metrics: {
                ticksReceived: this.metrics.ticksReceived,
                eventsDispatched: this.metrics.eventsDispatched,
                executionsCompleted: this.metrics.executionsCompleted,
                executionsBlocked: this.metrics.executionsBlocked,
                activeExecutions: this.metrics.activeExecutions,
            },
        };
    }

    countChain(startId) {
        let count = 0;
        let id = startId;
        const seen = new Set();
        while (id && !seen.has(id) && count < MAX_SEQUENCE_STEPS) {
            seen.add(id);
            count += 1;
            id = this.program?.blocks?.get(id)?.next ?? null;
        }
        return count;
    }
}

const defStateName = state => state.definition.name;

export default VirtualHookManager;
