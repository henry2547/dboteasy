/**
 * The advanced window reads and the consolidated blocks.
 *
 * The palette was refactored so each family of near-copies became one block with a field, and the
 * new advanced reads (gap, parity run, repeat rate, frequency rank, entropy) were added. These
 * tests hold that together: every consolidated block is listed with the defaults the palette gives
 * it, the superseded duplicates are hidden from the palette but still registered, and each new op
 * answers Pass/Fail/Inconclusive the way the language promises — an empty window is Inconclusive,
 * never a zero dressed up as a reading.
 */
import { BLOCKS, GROUPS, SPEC, blocksInGroup, subcategoriesInGroup } from '../../../scratch/blocks/Observer/observer-catalog';
import { EVALUATORS } from '../observer-evaluators';
import { FLOW_OPS } from '../observer-engine';
import { STATEMENTS } from '../observer-statements';
import * as values from '../observer-values';

/** A live-market snapshot with only what a window read touches. */
const ctxFor = digits => ({ digits, analysis_window: digits.length });

/** Evaluates a palette block on a window, using the same default field values the palette drags. */
const evaluate = (type, digits, overrides = {}) => {
    const spec = SPEC.get(type);
    const fields = { ...Object.fromEntries(spec.fields.map(field => [field.name, field.value])), ...overrides };
    return EVALUATORS[spec.op](ctxFor(digits), { id: type, type, label: spec.label, fields, inputs: {} }, {});
};

describe('advanced window reads', () => {
    it('reads how long a digit has been missing, and refuses to invent one it has never seen', () => {
        expect(evaluate('obs_digit_gap', [1, 2, 3, 3], { DIGIT: 2 }).value).toBe(2);
        expect(evaluate('obs_digit_gap', [1, 2, 3, 3], { DIGIT: 3 }).value).toBe(0);
        const missing = evaluate('obs_digit_gap', [1, 2, 3], { DIGIT: 5 });
        expect(missing.status).toBe('Inconclusive');
        expect(missing.reason).toContain('has not appeared');
    });

    it('measures the parity run and the parity switches of a window', () => {
        expect(evaluate('obs_parity_run', [2, 4, 1]).value).toBe(1);
        expect(evaluate('obs_parity_run', [1, 5, 2, 4]).value).toBe(2);
        expect(evaluate('obs_parity_switches', [1, 2, 3], { N: 0 }).value).toBe(2);
        expect(evaluate('obs_parity_switches', [1, 2, 3], { N: 2 }).value).toBe(1);
        expect(evaluate('obs_parity_run', []).status).toBe('Inconclusive');
    });

    it('measures how repetitive the window is, and needs two ticks to say anything', () => {
        expect(evaluate('obs_repeat_rate', [1, 1, 2, 2], { N: 0 }).value).toBeCloseTo(66.67, 1);
        expect(evaluate('obs_repeat_rate', [1, 2, 3, 4], { N: 0 }).value).toBe(0);
        expect(evaluate('obs_repeat_rate', [1]).status).toBe('Inconclusive');
    });

    it('ranks a digit inside the window, with ties decided by the lower digit', () => {
        const window = [0, 1, 1, 2, 2, 2];
        expect(evaluate('obs_frequency_rank', window, { DIGIT: 2, RANK: 'top', N: 1 }).status).toBe('Pass');
        expect(evaluate('obs_frequency_rank', window, { DIGIT: 0, RANK: 'top', N: 1 }).status).toBe('Fail');
        expect(evaluate('obs_frequency_rank', window, { DIGIT: 0, RANK: 'bottom', N: 1 }).status).toBe('Pass');
        // A tie between digits 3 and 4 belongs to the lower digit first.
        expect(evaluate('obs_frequency_rank', [3, 4, 0, 0, 0], { DIGIT: 3, RANK: 'bottom', N: 1 }).status).toBe('Pass');
        expect(evaluate('obs_frequency_rank', [], { DIGIT: 3, RANK: 'bottom', N: 1 }).status).toBe('Inconclusive');
    });

    it('reads the window entropy against the structural boundary', () => {
        const flat = evaluate('obs_entropy', [7, 7, 7, 7]);
        expect(flat.value).toBe(0);
        expect(evaluate('obs_entropy', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).value).toBeCloseTo(values.MAX_ENTROPY_BITS, 6);
        expect(evaluate('obs_entropy', []).status).toBe('Inconclusive');

        expect(evaluate('obs_entropy_state', [7, 7, 7, 7], { STATE: 'Clustered' }).status).toBe('Pass');
        expect(evaluate('obs_entropy_state', [7, 7, 7, 7], { STATE: 'Random' }).status).toBe('Fail');
        expect(evaluate('obs_entropy_state', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { STATE: 'Random' }).status).toBe('Pass');
        expect(evaluate('obs_entropy_state', [], { STATE: 'Random' }).status).toBe('Inconclusive');
    });
});

describe('consolidated blocks', () => {
    it('starts a run of identical, even or odd digits from one block', () => {
        const detectRun = jest.fn();
        const block = (kind, run) => ({ fields: { KIND: kind, N: run } });

        STATEMENTS.pattern_detect_run({ detectRun }, block('Identical digits', 4));
        STATEMENTS.pattern_detect_run({ detectRun }, block('Even digits', 3));
        STATEMENTS.pattern_detect_run({ detectRun }, block('Odd digits', 5));

        expect(detectRun.mock.calls).toEqual([
            ['digit', 4],
            ['even', 3],
            ['odd', 5],
        ]);
    });

    it('checks any pattern stage from one block', () => {
        const stage = { fields: { STAGE: 'Cooldown' } };
        expect(EVALUATORS.adv_state({ stage: 'Cooldown' }, stage).status).toBe('Pass');
        expect(EVALUATORS.adv_state({ stage: 'Waiting for pair' }, stage).status).toBe('Fail');
    });

    it('checks either parity frequency from one block', () => {
        expect(evaluate('obs_check_parity_frequency', [2, 4, 1], { PARITY: 'Even', PERCENT: 60 }).status).toBe('Pass');
        expect(evaluate('obs_check_parity_frequency', [2, 4, 1], { PARITY: 'Odd', PERCENT: 60 }).status).toBe('Fail');
        expect(evaluate('obs_check_parity_frequency', [], { PARITY: 'Odd', PERCENT: 60 }).status).toBe('Inconclusive');
    });

    it('compares any strategy candidate from one block', () => {
        const spec = SPEC.get('obs_research_candidate');
        expect(spec.fields.map(field => field.name)).toEqual(['STRATEGY', 'DIGIT', 'MINIMUM']);
        // The comparison itself reads completed observations, so an empty session is Inconclusive.
        const outcome = EVALUATORS.research_candidate(
            { completed: [] },
            { fields: { STRATEGY: 'even', DIGIT: 2, MINIMUM: 10 } }
        );
        expect(outcome.status).toBe('Inconclusive');
    });
});

describe('palette pruning', () => {
    const superseded = BLOCKS.filter(spec => spec.hidden);
    const listed = GROUPS.flatMap(group => blocksInGroup(group));

    it('keeps a superseded block registered and out of the palette', () => {
        expect(superseded.length).toBeGreaterThan(20);
        superseded.forEach(spec => {
            expect(SPEC.has(spec.type)).toBe(true);
            expect(listed.map(block => block.type)).not.toContain(spec.type);
        });
    });

    it('keeps the op of a superseded block implemented, so an older workspace still runs', () => {
        const ops = new Set(superseded.map(spec => spec.op));
        ['adv_streak', 'adv_longest', 'sample', 'parity_stable', 'pattern_reset', 'pause', 'stop', 'adv_state'].forEach(op =>
            expect(ops.has(op)).toBe(true)
        );
        superseded.forEach(spec => {
            if (spec.event || FLOW_OPS.has(spec.op)) return;
            const implemented = spec.output ? EVALUATORS[spec.op] : STATEMENTS[spec.op];
            expect(implemented).toBeDefined();
        });
    });

    it('splits every group into the sub-categories the palette lists, without an empty one', () => {
        GROUPS.forEach(group => {
            const subcategories = subcategoriesInGroup(group);
            expect(subcategories.length).toBeGreaterThan(1);
            subcategories.forEach(entry => expect(entry.blocks.length).toBeGreaterThan(0));
            const listedCount = subcategories.reduce((total, entry) => total + entry.blocks.length, 0);
            expect(listedCount).toBe(blocksInGroup(group).length);
        });
    });

    it('still offers every block the free-bot templates are built from', () => {
        // The observer blocks inside src/xml/ must stay in the palette: a free-bot card that names a
        // block the menu no longer lists would send the user looking for something that is not there.
        [
            'obs_ago',
            'obs_compare_lte',
            'obs_compare_gte',
            'obs_number',
            'obs_and',
            'obs_min_sample',
            'obs_freq_below',
            'obs_freq_above',
        ].forEach(type => expect(listed.map(block => block.type)).toContain(type));
    });
});
