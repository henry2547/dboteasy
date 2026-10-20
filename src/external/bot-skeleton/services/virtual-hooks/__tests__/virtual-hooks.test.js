/**
 * Virtual Hook runtime tests.
 *
 * These use genuine manager code with a fake clock and no Blockly: a hook must fire only on the
 * event it registered for, once per tick, with the condition it configured, and never after a
 * stop. The canvas reader is checked separately with a small fake workspace.
 */
import { VirtualHookManager, digitFromQuote } from '../virtual-hook-manager';
import { readHookProgram } from '../virtual-hook-program';

const flush = async (rounds = 12) => {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve();
};

const node = (id, type, fields = {}, inputs = {}, next = null) => ({ id, type, fields, inputs, next });
const text = (id, value) => node(id, 'text', { TEXT: value });
const print = (id, message, next = null) => node(id, 'text_print', {}, { TEXT: `t_${id}` }, next);

const definition = (name, extra = {}) => ({
    id: `reg_${name}`,
    name,
    event: 'tick',
    market: '',
    enabled: true,
    priority: 10,
    concurrency: 'sequential',
    condition: null,
    ...extra,
});

const program = ({ definitions = [], listeners = [], nodes = [], errors = [] } = {}) => ({
    definitions,
    listeners,
    blocks: new Map(nodes.map(item => [item.id, item])),
    errors,
    warnings: [],
    has_hook_blocks: true,
});

const managerWith = (overrides = {}) => {
    const clock = { now: 1_000_000 };
    const journal = jest.fn();
    const manager = new VirtualHookManager({
        journal,
        now: () => clock.now,
        sleep: () => Promise.resolve(),
        ...overrides,
    });
    return { manager, journal, clock };
};

const tick = (manager, epoch, digit, symbol = 'R_100') =>
    manager.feedTick({ symbol, price: 100 + digit / 100, epoch, pip_size: 2 });

const withListener = (name, chain, options = {}) =>
    program({
        definitions: [definition(name, options.definition)],
        listeners: [{ id: `listener_${name}`, hook: name, body: chain[0].id, order: 0 }],
        nodes: chain,
    });

describe('virtual hook runtime', () => {
    it('fires the matching hook with genuine tick data and runs its blocks in order', async () => {
        const { manager, journal } = managerWith();
        manager.attach(
            program({
                definitions: [definition('a'), definition('b')],
                listeners: [
                    { id: 'la', hook: 'a', body: 'p1', order: 0 },
                    { id: 'lb', hook: 'b', body: 'p3', order: 1 },
                ],
                nodes: [
                    print('p1', 'one', 'p2'),
                    text('t_p1', 'one'),
                    print('p2', 'two'),
                    text('t_p2', 'two'),
                    print('p3', 'other'),
                    text('t_p3', 'other'),
                ],
            })
        );

        const event = tick(manager, 1, 3);
        await flush();

        expect(event.digit).toBe(3);
        expect(manager.states.get('a').triggerCount).toBe(1);
        expect(manager.states.get('b').triggerCount).toBe(0);
        expect(journal.mock.calls.map(call => call[0])).toEqual(
            expect.arrayContaining([expect.stringContaining('one'), expect.stringContaining('two')])
        );
        const completed = manager.executions.find(execution => execution.hook === 'a');
        expect(completed.state).toBe('completed');
        expect(completed.event.epoch).toBe(1);
        expect(completed.steps.map(step => step.label)).toContain('Purchase not requested');
    });

    it('does not run a listener whose condition fails', async () => {
        const { manager } = managerWith();
        manager.attach(
            withListener('pattern', [print('p1', 'ran'), text('t_p1', 'ran')], {
                definition: { condition: { type: 'last_digit_equals', digit: 7 } },
            })
        );

        tick(manager, 1, 3);
        await flush();
        expect(manager.states.get('pattern').triggerCount).toBe(0);

        tick(manager, 2, 7);
        await flush();
        expect(manager.states.get('pattern').triggerCount).toBe(1);
    });

    it('processes one tick once, even if the feed delivers it twice', async () => {
        const { manager } = managerWith();
        manager.attach(withListener('once', [print('p1', 'ran'), text('t_p1', 'ran')]));

        tick(manager, 5, 2);
        const duplicate = tick(manager, 5, 2);
        await flush();

        expect(duplicate).toBeNull();
        expect(manager.states.get('once').triggerCount).toBe(1);
        expect(manager.metrics.duplicatesIgnored).toBe(1);
    });

    it('detects a consecutive pattern from the real tick order and emits it once', async () => {
        const { manager } = managerWith();
        manager.attach(
            withListener('pair', [print('p1', 'pair'), text('t_p1', 'pair')], {
                definition: {
                    event: 'digit_pattern',
                    condition: { type: 'consecutive_match', count: 2 },
                },
            })
        );

        [1, 2, 1, 1].forEach((digit, index) => tick(manager, index + 1, digit));
        await flush();

        const executions = manager.executions.filter(execution => execution.hook === 'pair');
        expect(executions).toHaveLength(1);
        expect(executions[0].event.pattern).toEqual([1, 1]);
        expect(manager.states.get('pair').triggerCount).toBe(1);
    });

    it('ignores malformed ticks and never invents a replacement', async () => {
        const { manager } = managerWith();
        manager.attach(withListener('feed', [print('p1', 'ran'), text('t_p1', 'ran')]));

        expect(manager.feedTick({ symbol: '', price: 1.23, epoch: 1, pip_size: 2 })).toBeNull();
        expect(manager.feedTick({ symbol: 'R_100', price: Number.NaN, epoch: 1, pip_size: 2 })).toBeNull();
        await flush();

        expect(manager.states.get('feed').triggerCount).toBe(0);
        expect(manager.getSnapshot().errors[0].message).toMatch(/malformed tick/);
        expect(manager.metrics.ticksReceived).toBe(0);
    });

    it('rejects an unknown hook and a disabled hook instead of firing them', async () => {
        const { manager } = managerWith();
        manager.attach(
            program({ definitions: [definition('off', { enabled: false })], listeners: [], nodes: [] })
        );

        expect(manager.trigger('missing')).toBe(false);
        expect(manager.trigger('off')).toBe(false);
        expect(manager.getSnapshot().errors.map(error => error.message).join(' ')).toMatch(/not registered/);
        expect(manager.getSnapshot().errors.map(error => error.message).join(' ')).toMatch(/disabled/);
    });

    it('cuts a hook chain at the recursion limit instead of looping forever', async () => {
        const { manager } = managerWith({ maxDepth: 3 });
        manager.attach(
            program({
                definitions: [definition('a'), definition('b')],
                listeners: [
                    { id: 'la', hook: 'a', body: 'ta', order: 0 },
                    { id: 'lb', hook: 'b', body: 'tb', order: 1 },
                ],
                nodes: [
                    node('ta', 'vhook_trigger', { NAME: 'b' }),
                    node('tb', 'vhook_trigger', { NAME: 'a' }),
                ],
            })
        );

        tick(manager, 1, 4);
        await flush(60);

        expect(manager.getSnapshot().errors.map(error => error.message).join(' ')).toMatch(/recursion limit/);
        const deepest = Math.max(...manager.executions.map(execution => execution.depth));
        expect(deepest).toBeLessThanOrEqual(3);
    });

    it('stops pending work when the bot stops', async () => {
        const resolvers = [];
        const { manager, journal } = managerWith({
            sleep: () => new Promise(resolve => resolvers.push(resolve)),
        });
        manager.attach(
            program({
                definitions: [definition('slow')],
                listeners: [{ id: 'ls', hook: 'slow', body: 'wait', order: 0 }],
                nodes: [
                    node('wait', 'timeout', {}, { VALUE: 'delay' }, 'after'),
                    node('delay', 'math_number', { NUM: '50' }),
                    print('after', 'after-stop'),
                    text('t_after', 'after-stop'),
                ],
            })
        );

        tick(manager, 1, 1);
        await flush();
        expect(manager.metrics.activeExecutions).toBe(1);

        manager.stop('Bot stopped');
        resolvers.forEach(resolve => resolve());
        await flush(30);

        const execution = manager.executions[0];
        expect(execution.state).toBe('cancelled');
        expect(journal.mock.calls.map(call => call[0]).join(' ')).not.toContain('after-stop');
        expect(manager.getSnapshot().active).toBe(false);
    });

    it('queues a busy hook in order and skips when the policy says skip', async () => {
        const resolvers = [];
        const sleep = () => new Promise(resolve => resolvers.push(resolve));
        const { manager } = managerWith({ sleep });
        manager.attach(
            program({
                definitions: [definition('queued', { concurrency: 'sequential' }), definition('skipping', { concurrency: 'skip' })],
                listeners: [
                    { id: 'lq', hook: 'queued', body: 'qwait', order: 0 },
                    { id: 'lk', hook: 'skipping', body: 'kwait', order: 1 },
                ],
                nodes: [
                    node('qwait', 'timeout', {}, { VALUE: 'qdelay' }),
                    node('qdelay', 'math_number', { NUM: '10' }),
                    node('kwait', 'timeout', {}, { VALUE: 'kdelay' }),
                    node('kdelay', 'math_number', { NUM: '10' }),
                ],
            })
        );

        tick(manager, 1, 1);
        await flush();
        tick(manager, 2, 2);
        await flush();

        expect(manager.states.get('queued').queueDepth).toBe(1);
        expect(manager.states.get('skipping').skippedCount).toBe(1);
        expect(manager.states.get('skipping').triggerCount).toBe(1);

        resolvers.forEach(resolve => resolve());
        await flush(30);
        expect(manager.states.get('queued').triggerCount).toBe(2);
        expect(manager.states.get('queued').queueDepth).toBe(0);
    });

    it('does not duplicate listeners across repeated Run/Stop cycles', async () => {
        const { manager } = managerWith();
        const canvas = withListener('entry', [print('p1', 'ran'), text('t_p1', 'ran')]);

        manager.attach(canvas);
        tick(manager, 1, 1);
        await flush();
        expect(manager.states.get('entry').triggerCount).toBe(1);

        manager.stop('stopped');
        manager.attach(canvas);
        tick(manager, 2, 2);
        await flush();

        expect(manager.states.get('entry').triggerCount).toBe(1);
        expect(manager.listenersByHook.get('entry')).toHaveLength(1);
        expect(manager.executions.filter(execution => execution.hook === 'entry')).toHaveLength(1);
    });

    it('gates on a condition block against the genuine tick and fails closed when stale', () => {
        const { manager, clock } = managerWith({ freshnessSeconds: 5 });
        manager.attach(
            program({
                definitions: [],
                listeners: [],
                nodes: [node('cond', 'vhook_condition', { CONDITION: 'last_digit_equals', DIGIT: '3' })],
            })
        );

        expect(manager.conditionOfBlock('cond')).toBe(false);
        tick(manager, 1, 3);
        expect(manager.conditionOfBlock('cond')).toBe(true);
        tick(manager, 2, 4);
        expect(manager.conditionOfBlock('cond')).toBe(false);

        tick(manager, 3, 3);
        clock.now += 6000;
        expect(manager.conditionOfBlock('cond')).toBe(false);
        expect(manager.getSnapshot().feed.healthy).toBe(false);
    });

    it('exposes structured result values from the execution that is being handled', async () => {
        const { manager } = managerWith();
        manager.attach(
            program({
                definitions: [definition('data')],
                listeners: [{ id: 'ld', hook: 'data', body: 'p1', order: 0 }],
                nodes: [
                    print('p1', 'done'),
                    text('t_p1', 'done'),
                    node('result', 'vhook_result', { FIELD: 'last_digit' }),
                ],
            })
        );

        tick(manager, 9, 6);
        await flush();

        expect(manager.resultOfBlock('result', 'last_digit')).toBe('6');
        expect(manager.resultOfBlock('result', 'market')).toBe('R_100');
        expect(manager.resultOfBlock('result', 'hook_name')).toBe('data');
        expect(manager.resultOfBlock('result', 'execution_id')).toMatch(/^vh-/);
    });

    it('has no purchase path of its own', () => {
        const { manager } = managerWith();
        expect(manager.purchase).toBeUndefined();
        expect(manager.buy).toBeUndefined();
    });
});

describe('virtual hook canvas reader', () => {
    class FakeBlock {
        constructor({ id, type, fields = {}, inputs = {}, next = null }) {
            Object.assign(this, { id, type, fields, inputs });
            this.nextBlock = next;
        }
        get inputList() {
            return [
                ...Object.keys(this.fields).map(name => ({ name, fieldRow: [{ name }] })),
                ...Object.keys(this.inputs).map(name => ({ name, fieldRow: [] })),
            ];
        }
        getFieldValue(name) {
            return this.fields[name];
        }
        getInputTargetBlock(name) {
            return this.inputs[name] ?? null;
        }
        getNextBlock() {
            return this.nextBlock ?? null;
        }
    }

    const workspace = blocks => ({ getAllBlocks: () => blocks });

    it('reads a valid hook, its condition and its listener chain', () => {
        const listener_body = new FakeBlock({ id: 'print', type: 'text_print', inputs: { TEXT: new FakeBlock({ id: 'txt', type: 'text', fields: { TEXT: 'tick' } }) } });
        const blocks = [
            new FakeBlock({
                id: 'reg',
                type: 'vhook_register',
                fields: { NAME: 'entry', EVENT: 'digit_pattern', MARKET: 'R_100', ENABLED: 'TRUE', PRIORITY: '5', CONCURRENCY: 'skip' },
                inputs: {
                    CONDITION: new FakeBlock({
                        id: 'cond',
                        type: 'vhook_condition',
                        fields: { CONDITION: 'consecutive_match', DIGIT: '5', COUNT: '2', SET: '0,1', SEQUENCE: '1,1,5', THRESHOLD: '10', SAMPLE: '100' },
                    }),
                },
            }),
            new FakeBlock({
                id: 'listener',
                type: 'vhook_listener',
                fields: { HOOK: 'entry' },
                inputs: { DO: listener_body },
            }),
        ];

        const report = readHookProgram(workspace(blocks));
        expect(report.errors).toEqual([]);
        expect(report.definitions).toHaveLength(1);
        expect(report.definitions[0]).toMatchObject({
            name: 'entry',
            event: 'digit_pattern',
            market: 'R_100',
            priority: 5,
            concurrency: 'skip',
            condition: { type: 'consecutive_match', digit: 5, count: 2 },
        });
        expect(report.listeners[0].body).toBe('print');
        expect(report.blocks.get('txt').fields.TEXT).toBe('tick');
    });

    it('rejects duplicate hook names, unknown listeners and purchase blocks in a listener', () => {
        const purchase = new FakeBlock({ id: 'buy', type: 'purchase', fields: { PURCHASE_LIST: 'DIGITOVER' } });
        const blocks = [
            new FakeBlock({ id: 'reg1', type: 'vhook_register', fields: { NAME: 'entry', EVENT: 'tick', ENABLED: 'TRUE' } }),
            new FakeBlock({ id: 'reg2', type: 'vhook_register', fields: { NAME: 'entry', EVENT: 'tick', ENABLED: 'TRUE' } }),
            new FakeBlock({ id: 'listener1', type: 'vhook_listener', fields: { HOOK: 'missing' }, inputs: {} }),
            new FakeBlock({ id: 'listener2', type: 'vhook_listener', fields: { HOOK: 'entry' }, inputs: { DO: purchase } }),
        ];

        const report = readHookProgram(workspace(blocks));
        expect(report.definitions).toHaveLength(1);
        expect(report.errors.join(' ')).toMatch(/registered more than once/);
        expect(report.errors.join(' ')).toMatch(/has no registration/);
        expect(report.errors.join(' ')).toMatch(/never buy on their own/);
        expect(report.listeners.some(listener => listener.hook === 'missing')).toBe(false);
    });

    it('rejects an unsupported event and a non-condition input', () => {
        const blocks = [
            new FakeBlock({
                id: 'reg',
                type: 'vhook_register',
                fields: { NAME: 'bad', EVENT: 'moon_phase', ENABLED: 'TRUE' },
            }),
            new FakeBlock({
                id: 'reg2',
                type: 'vhook_register',
                fields: { NAME: 'odd', EVENT: 'tick', ENABLED: 'TRUE' },
                inputs: { CONDITION: new FakeBlock({ id: 'num', type: 'math_number', fields: { NUM: '1' } }) },
            }),
        ];

        const report = readHookProgram(workspace(blocks));
        expect(report.errors.join(' ')).toMatch(/unsupported event/);
        expect(report.errors.join(' ')).toMatch(/other than a Virtual Hook Condition/);
    });

    it('reports no hook blocks on an ordinary trading canvas', () => {
        const report = readHookProgram(
            workspace([new FakeBlock({ id: 'trade', type: 'trade_definition', fields: {} })])
        );
        expect(report.has_hook_blocks).toBe(false);
        expect(report.definitions).toEqual([]);
    });
});

describe('digit extraction', () => {
    it('uses the market precision, never a rounded display string', () => {
        expect(digitFromQuote(629.81, 2)).toBe(1);
        expect(digitFromQuote(1000.5, 2)).toBe(0);
        expect(digitFromQuote(1000.59, 2)).toBe(9);
        expect(digitFromQuote(12.3, 8)).toBe(0);
    });

    it('refuses a quote it cannot derive a digit from', () => {
        expect(digitFromQuote(12.3, -1)).toBeNull();
        expect(digitFromQuote(Number.NaN, 2)).toBeNull();
    });
});
