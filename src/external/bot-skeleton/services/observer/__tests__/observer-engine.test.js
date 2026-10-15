/**
 * The observer runtime, exercised on a plain program graph (no Blockly, no network).
 *
 * These are the guarantees the runtime makes to a trading session:
 * - nothing is signalled from missing data (Inconclusive never signals);
 * - an op with no evaluator yet cannot signal either;
 * - one entry per pass: a second trade needs an explicit restart or cooldown;
 * - every verdict lands in the journal.
 */
import { ObserverEngine } from '../observer-engine';
import * as values from '../observer-values';

const block = (id, op, extra = {}) => ({
    id,
    op,
    label: extra.label ?? op,
    event: extra.event ?? null,
    fields: extra.fields ?? {},
    inputs: extra.inputs ?? {},
    body: extra.body ?? null,
    else_body: extra.else_body ?? null,
    next: extra.next ?? null,
});

/** When New Tick Arrives -> IF latest digit is even -> entry (min sample 2) -> note. */
const program = ({ entry_condition = 'sample1', condition = { op: 'even' } } = {}) => {
    const blocks = [
        block('hat', 'event', { event: 'tick', body: 'if1', label: 'When New Tick Arrives' }),
        block('if1', 'if', { inputs: { CONDITION: 'even1' }, body: 'entry1' }),
        block('even1', condition.op, { label: 'Latest Digit Is Even' }),
        block('entry1', 'entry', { inputs: { CONDITION: entry_condition }, body: 'note1', label: 'When All Entry Conditions Pass' }),
        block('note1', 'note', { fields: { TEXT: 'Setup seen' } }),
        block('sample1', 'sample', { fields: { N: 2 }, label: 'Check Minimum Sample Size' }),
        block('unbuilt1', 'research_rank', { fields: { MINIMUM: 10 }, label: 'Rank Strategies By Observed Results' }),
    ];
    return {
        blocks: new Map(blocks.map(item => [item.id, item])),
        events: new Map([['tick', ['hat']]]),
        entries: ['entry1'],
        roots: [],
        has_entry_gate: true,
    };
};

/** The same entry, dragged onto the canvas on its own instead of under an event hat. */
const rootProgram = () => {
    const blocks = [
        block('entry1', 'entry', { inputs: { CONDITION: 'even1' }, body: 'note1', label: 'When All Entry Conditions Pass' }),
        block('even1', 'even', { label: 'Latest Digit Is Even' }),
        block('note1', 'note', { fields: { TEXT: 'Setup seen' } }),
    ];
    return {
        blocks: new Map(blocks.map(item => [item.id, item])),
        events: new Map(),
        entries: ['entry1'],
        roots: ['entry1'],
        has_entry_gate: true,
    };
};

let epoch = 1000;
const feed = (engine, prices) => {
    // Epochs move forward across calls too: the runtime treats one epoch as one genuine tick.
    prices.forEach(price => {
        epoch += 1;
        engine.feedTick({ symbol: 'R_100', price, epoch, pip_size: 2 });
    });
};

const journalFor = () => {
    const lines = [];
    return { lines, write: message => lines.push(message) };
};

describe('observer-values', () => {
    it('reads the window and its transitions without inventing data', () => {
        expect(values.currentStreak([1, 2, 2, 2])).toEqual({ digit: 2, length: 3 });
        expect(values.digitAgo([1, 2, 3], 1)).toBe(2);
        expect(values.frequencyOf([1, 1, 2], 1)).toBeCloseTo(66.67, 1);
        expect(values.transitionFrequency([1, 2, 1, 2], 1, 2)).toBe(100);
        expect(values.matchesSequence([1, 2, 3], [2, 3])).toBe(true);
        expect(values.matchesSequence([1, 2], [1, 2, 3])).toBeNull();
        expect(Number.isNaN(values.frequencyOf([], 1))).toBe(true);
    });
});

describe('observer engine', () => {
    it('signals an entry once, and only after its conditions genuinely pass', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(program(), { journal: journal.write });
        engine.start({ symbol: 'R_100' });

        // One tick is not enough for the minimum-sample guard.
        feed(engine, [1.02]);
        expect(engine.consumeEntry()).toBe(false);

        feed(engine, [1.06]);
        expect(engine.consumeEntry()).toBe(true);
        expect(engine.consumeEntry()).toBe(false);
        expect(journal.lines.join('\n')).toContain('Setup detected');
        expect(journal.lines.join('\n')).toContain('existing trade setup');
    });

    it('ignores ticks that do not satisfy the condition', () => {
        const engine = new ObserverEngine(program(), { journal: () => {} });
        engine.start({ symbol: 'R_100' });
        feed(engine, [1.03, 1.05, 1.07]);
        expect(engine.consumeEntry()).toBe(false);
    });

    it('needs an explicit restart before a second setup', () => {
        const engine = new ObserverEngine(program(), { journal: () => {} });
        engine.start({ symbol: 'R_100' });
        feed(engine, [1.02, 1.06]);
        expect(engine.consumeEntry()).toBe(true);

        feed(engine, [1.02, 1.04]);
        expect(engine.consumeEntry()).toBe(false);

        engine.restart('test');
        feed(engine, [1.06, 1.08]);
        expect(engine.consumeEntry()).toBe(true);
    });

    it('honours a cooldown before the next setup', () => {
        const engine = new ObserverEngine(program(), { journal: () => {} });
        engine.start({ symbol: 'R_100' });
        feed(engine, [1.02, 1.06]);
        expect(engine.consumeEntry()).toBe(true);

        engine.setCooldown({ ticks: 2 });
        feed(engine, [1.04]);
        expect(engine.consumeEntry()).toBe(false);
        feed(engine, [1.08]);
        expect(engine.consumeEntry()).toBe(true);
    });

    it('never signals from a block the observer cannot evaluate yet', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(program({ entry_condition: 'unbuilt1' }), { journal: journal.write });
        engine.start({ symbol: 'R_100' });
        feed(engine, [1.02, 1.04, 1.06]);
        expect(engine.consumeEntry()).toBe(false);
        expect(journal.lines.join('\n')).toContain('not evaluated by the observer yet');
    });

    it('reports Inconclusive instead of guessing when there is no data behind a read', () => {
        const engine = new ObserverEngine(program(), { journal: () => {} });
        engine.start({ symbol: 'R_100' });
        const outcome = engine.evaluate('sample1');
        expect(outcome.status).toBe('Fail');
        const unbuilt = engine.evaluate('unbuilt1');
        expect(unbuilt.status).toBe('Inconclusive');
    });

    it('runs a free-standing program on every genuine tick and signals its entry', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(rootProgram(), { journal: journal.write });
        engine.start({ symbol: 'R_100' });

        feed(engine, [1.03]);
        expect(engine.consumeEntry()).toBe(false);

        feed(engine, [1.06]);
        expect(engine.consumeEntry()).toBe(true);
        expect(journal.lines.join('\n')).toContain('Setup seen');
    });

    it('evaluates and runs a block the generated program reached', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(program(), { journal: journal.write });
        expect(engine.evaluateBlock('even1')).toBe(null);

        engine.start({ symbol: 'R_100' });
        feed(engine, [1.04]);
        expect(engine.evaluateBlock('even1')).toMatchObject({ status: 'Pass', value: true });

        engine.runStatementById('note1');
        expect(journal.lines.join('\n')).toContain('Setup seen');

        // An unknown id is Inconclusive, never a value the generated program could act on.
        expect(engine.evaluateBlock('gone1').status).toBe('Inconclusive');
    });

    it('records a pending observation and completes it on the next genuine tick', () => {
        const journal = journalFor();
        const blocks = [
            block('hat', 'event', { event: 'tick', body: 'obs1' }),
            block('obs1', 'observe_matches', { next: null }),
        ];
        const engine = new ObserverEngine(
            { blocks: new Map(blocks.map(item => [item.id, item])), events: new Map([['tick', ['hat']]]), entries: [], has_entry_gate: false },
            { journal: journal.write }
        );
        engine.start({ symbol: 'R_100' });
        engine.setDigit(2, 'test');
        feed(engine, [1.02, 1.02, 1.09]);
        expect(journal.lines.join('\n')).toContain('observation completed: Qualified');
        expect(journal.lines.join('\n')).toContain('observation completed: Not qualified');
    });
});
