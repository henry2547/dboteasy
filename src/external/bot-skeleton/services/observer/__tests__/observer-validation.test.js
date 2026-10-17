/**
 * A program is checked before it runs.
 *
 * These tests cover the promise the runtime makes to a session: every block on the canvas is either
 * implemented, or the run is refused with the offending block named — and every "When …" hat has an
 * event the tick stream genuinely raises, so no block can sit there without ever running.
 */
import { DISPATCH_EVENTS, ObserverEngine } from '../observer-engine';
import { EVALUATORS } from '../observer-evaluators';
import { STATEMENTS } from '../observer-statements';
import { readProgram } from '../observer-program';
import { validateProgram } from '../observer-validate';
import { BLOCKS, SPEC } from '../../../scratch/blocks/Observer/observer-catalog';

const block = (id, op, extra = {}) => ({
    id,
    op,
    type: extra.type ?? id,
    label: extra.label ?? op,
    event: extra.event ?? null,
    fields: extra.fields ?? {},
    inputs: extra.inputs ?? {},
    body: extra.body ?? null,
    else_body: extra.else_body ?? null,
    next: extra.next ?? null,
});

const programOf = blocks => ({
    blocks: new Map(blocks.map(item => [item.id, item])),
    events: new Map(),
    entries: [],
    roots: [],
    has_entry_gate: false,
    unknown: [],
});

const specBlock = (type, extra = {}) => {
    const spec = SPEC.get(type);
    return block(extra.id ?? type, spec.op, { ...extra, type, label: spec.label });
};

let epoch = 5000;
const feed = (engine, prices) =>
    prices.forEach(price => {
        epoch += 1;
        engine.feedTick({ symbol: 'R_100', price, epoch, pip_size: 2 });
    });

const journalFor = () => {
    const lines = [];
    return { lines, write: message => lines.push(message) };
};

describe('observer program validation', () => {
    it('accepts a program whose blocks are implemented and wired', () => {
        const report = validateProgram(
            programOf([
                specBlock('obs_on_tick', { event: 'tick', body: 'if1' }),
                specBlock('obs_if', { id: 'if1', inputs: { CONDITION: 'even1' }, body: 'entry1' }),
                specBlock('obs_even', { id: 'even1' }),
                specBlock('obs_entry', { id: 'entry1', inputs: { CONDITION: 'sample1' } }),
                specBlock('obs_min_sample', { id: 'sample1', fields: { N: 2 } }),
            ])
        );
        expect(report.ok).toBe(true);
        expect(report.errors).toEqual([]);
    });

    it('names a block the runtime cannot evaluate and refuses the run', () => {
        const saved = EVALUATORS.even;
        delete EVALUATORS.even;
        try {
            const report = validateProgram(programOf([specBlock('obs_even', { id: 'even1' })]));
            expect(report.ok).toBe(false);
            expect(report.errors).toHaveLength(1);
            expect(report.errors[0].type).toBe('obs_even');
            expect(report.errors[0].message).toContain('obs_even');
            expect(report.errors[0].message).toContain('Remove the block');
        } finally {
            EVALUATORS.even = saved;
        }
    });

    it('refuses a hat that waits for an event the tick stream never raises', () => {
        const saved = DISPATCH_EVENTS.has('resume');
        DISPATCH_EVENTS.delete('resume');
        try {
            const report = validateProgram(programOf([specBlock('obs_on_resume')]));
            expect(report.ok).toBe(false);
            expect(report.errors[0].message).toContain('never raises');
            expect(report.errors[0].message).toContain('Replace it with a "When …" block');
        } finally {
            if (saved) DISPATCH_EVENTS.add('resume');
        }
    });

    it('reports an unconnected socket and an empty field without stopping the run', () => {
        const report = validateProgram(
            programOf([
                specBlock('obs_compare_equal', { id: 'cmp1' }),
                specBlock('obs_note', { id: 'note1', fields: { TEXT: '' } }),
            ])
        );
        expect(report.ok).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.warnings.map(issue => issue.type)).toEqual(['obs_compare_equal', 'obs_compare_equal', 'obs_note']);
        report.warnings.forEach(issue => expect(issue.message).toContain('obs_'));
    });

    it('stops an observer program that carries a block type this version no longer defines', () => {
        const report = validateProgram({
            ...programOf([]),
            unknown: [{ id: 'old1', type: 'obs_old_frequency_block', label: 'obs_old_frequency_block' }],
        });
        expect(report.ok).toBe(false);
        expect(report.errors[0].type).toBe('obs_old_frequency_block');
        expect(report.errors[0].message).toContain('older or renamed configuration');
    });
});

describe('reading the canvas', () => {
    it('records an observer block from an older configuration instead of dropping it silently', () => {
        const workspace = {
            getAllBlocks: () => [{ id: 'old1', type: 'obs_legacy_block' }],
            getTopBlocks: () => [],
        };
        const program = readProgram(workspace);
        expect(program.blocks.size).toBe(0);
        expect(program.unknown).toEqual([{ id: 'old1', type: 'obs_legacy_block', label: 'obs_legacy_block' }]);
        expect(validateProgram(program).ok).toBe(false);
    });
});

describe('every "When …" block can actually run', () => {
    it('names an event the tick stream raises', () => {
        const unknown_events = BLOCKS.filter(spec => spec.event && !DISPATCH_EVENTS.has(spec.event)).map(spec => spec.type);
        expect(unknown_events).toEqual([]);
    });

    it('raises "When Bot Is Resumed" after Resume Monitoring, before the next tick is judged', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(
            {
                ...programOf([specBlock('obs_on_resume', { id: 'hat', body: 'note1' }), specBlock('obs_note', { id: 'note1', fields: { TEXT: 'Resumed' } })]),
                events: new Map([['resume', ['hat']]]),
            },
            { journal: journal.write }
        );

        engine.start();
        engine.setMonitoring(false);
        expect(journal.lines).not.toContain('Observer: Resumed');

        engine.setMonitoring(true);
        feed(engine, [1]);
        expect(journal.lines).toContain('Observer: Resumed');
    });

    it('does not treat a start that was never stopped as a resume', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(
            {
                ...programOf([specBlock('obs_on_resume', { id: 'hat', body: 'note1' }), specBlock('obs_note', { id: 'note1', fields: { TEXT: 'Resumed' } })]),
                events: new Map([['resume', ['hat']]]),
            },
            { journal: journal.write }
        );

        engine.start();
        engine.setMonitoring(true);
        feed(engine, [1, 2]);
        expect(journal.lines).not.toContain('Observer: Resumed');
    });
});

describe('older saved configurations', () => {
    it('keeps resolving the ops of blocks that were renamed', () => {
        ['min_sample', 'stat_minimum', 'require_sample', 'pattern_stage'].forEach(op => expect(EVALUATORS[op]).toBeDefined());
        ['reset_session', 'monitor_stop', 'reset_to_pair', 'new_cycle'].forEach(op => expect(STATEMENTS[op]).toBeDefined());
    });

    it('runs or evaluates a block whose op only survives as a rename, without reporting it as unimplemented', () => {
        const journal = journalFor();
        const engine = new ObserverEngine(
            {
                ...programOf([
                    block('legacy_statement', 'reset_to_pair', { label: 'Reset To Waiting For Pair' }),
                    block('legacy_value', 'min_sample', { fields: { N: 2 }, label: 'Check Minimum Sample Size' }),
                ]),
                roots: ['legacy_statement'],
            },
            { journal: journal.write }
        );

        engine.start();
        feed(engine, [1, 2, 3]);
        expect(engine.evaluateBlock('legacy_value').status).toBe('Pass');
        expect(engine.unimplemented.size).toBe(0);
        expect(journal.lines.join(' ')).not.toContain('is not evaluated by the observer yet');
    });
});
