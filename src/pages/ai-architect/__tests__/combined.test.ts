/**
 * The advanced planner (every condition in the prompt), the requirements list, and the
 * "add this bot to another" combination.
 */
import { allBlocks, buildWorkspace } from '../builder';
import { combineSpecs } from '../combine';
import { assemble, generateBot } from '../pipeline';
import { createSpec, planStrategy } from '../planner';
import { buildRegistry, CAPABILITY_CATALOG, fixedProbe } from '../registry';
import { normalizeSpec } from '../spec-model';
import type { BuiltWorkspace, StrategySpec } from '../types';

const types = CAPABILITY_CATALOG.map(entry => entry.type);
const registry = buildRegistry(fixedProbe(types));
const blocksOf = (workspace: BuiltWorkspace) => allBlocks(workspace);
const plan = (prompt: string): StrategySpec => planStrategy(prompt).spec as StrategySpec;

const ADVANCED =
    'Scan all volatility markets for Over 1, entry is 5 and 6, digits 0 and 1 should have at least 10.3% frequency, digits 5 and 6 should not have the green or red bar, last 500 ticks, stop after 3 consecutive losses.';

describe('planner: everything the request says', () => {
    it('reads every digit filter, not just the first one', () => {
        const { spec } = planStrategy(ADVANCED);
        expect(spec?.filters.frequencies).toEqual([
            { digit: 0, operator: 'above', percent: 10.3 },
            { digit: 1, operator: 'above', percent: 10.3 },
        ]);
    });

    it('reads the digits that must have no hot or cold bar', () => {
        expect(planStrategy(ADVANCED).spec?.filters.barNeutral).toEqual([5, 6]);
    });

    it('reads the entry digits as a list, separate from the contract barrier', () => {
        const { spec } = planStrategy(ADVANCED);
        expect(spec?.entry).toMatchObject({ strategy: 'over', barrier: 1, digits: [5, 6] });
        expect(spec?.filters.window).toBe(500);
    });

    it('reads a digit range stated as "any 2 digits above or equal 7"', () => {
        expect(planStrategy('Trade Over 7 on all markets, entry is any 2 digits above or equal 7').spec?.entry.digits).toEqual([7, 8, 9]);
    });

    it('does not read the entry digits or the bar rule as a contract', () => {
        const result = planStrategy('For Over 1, entry is 5 and 6 and they should not have the green or red bar');
        expect(result.clarifications).toEqual([]);
        expect(result.spec?.entry).toMatchObject({ strategy: 'over', barrier: 1 });
    });

    it('accounts for every clause of the prompt', () => {
        const { requirements } = planStrategy(ADVANCED);
        expect(requirements.length).toBeGreaterThan(3);
        expect(requirements.filter(item => item.status === 'unapplied')).toEqual([]);
    });

    it('shows a digit list together with the rule it belongs to', () => {
        const { requirements } = planStrategy(ADVANCED);
        expect(requirements.some(item => /^\d+$|^digits \d+$/.test(item.clause))).toBe(false);
        expect(requirements.some(item => item.clause.includes('10.3% frequency'))).toBe(true);
    });

    it('flags a clause it could not turn into a block instead of dropping it', () => {
        const { requirements } = planStrategy('Trade Over 1 on all markets and also sing a song about it');
        const missed = requirements.find(item => item.status === 'unapplied');
        expect(missed?.clause).toContain('sing a song');
    });

    it('marks an unsupported ask in the coverage list', () => {
        const { requirements } = planStrategy('Trade Over 1 on all markets using RSI');
        expect(requirements.some(item => item.status === 'unsupported')).toBe(true);
    });
});

describe('builder: the advanced conditions', () => {
    it('accepts each entry digit on its own', () => {
        const workspace = buildWorkspace(plan(ADVANCED));
        const compares = blocksOf(workspace).filter(block => block.type === 'logic_compare' && block.fields?.OP === 'EQ');
        expect(compares.length).toBeGreaterThanOrEqual(4); // 2 digits × (scan + confirmation)
    });

    it('builds one frequency block per digit and one bar-neutral block per digit', () => {
        const workspace = buildWorkspace(plan(ADVANCED));
        const frequencies = blocksOf(workspace).filter(block => block.type === 'digits_frequency').map(block => block.fields?.DIGIT);
        const bars = blocksOf(workspace).filter(block => block.type === 'digits_bar_neutral').map(block => block.fields?.DIGIT);
        expect(frequencies.sort()).toEqual(['0', '0', '1', '1']); // scan + confirmation
        expect(bars.sort()).toEqual(['5', '5', '6', '6']);
        blocksOf(workspace)
            .filter(block => block.type === 'digits_bar_neutral')
            .forEach(block => expect(block.values?.SAMPLE?.[0].fields?.NUM).toBe(500));
    });

    it('validates the advanced bot', () => {
        const result = generateBot(ADVANCED, { registry });
        expect({ ok: result.ok, errors: result.bot?.validation.errors }).toEqual({ ok: true, errors: [] });
    });

    it('still builds a spec saved with the old single frequency filter', () => {
        const legacy = {
            ...createSpec({ strategy: 'over', barrier: 1, multi: true }),
            filters: { window: 100, frequency: { digit: 3, operator: 'below', percent: 9 }, streakAtMost: null },
        } as unknown as StrategySpec;
        expect(normalizeSpec(legacy).filters.frequencies).toEqual([{ digit: 3, operator: 'below', percent: 9 }]);
        expect(blocksOf(buildWorkspace(legacy)).some(block => block.type === 'digits_frequency')).toBe(true);
    });
});

describe('add a bot to another', () => {
    const over = (): StrategySpec => plan('Trade Over 1 on all volatility markets');
    const under = (): StrategySpec => plan('Trade Under 8 on all volatility markets');

    it('adds the second bot as the second entry rule of the first', () => {
        const outcome = combineSpecs(over(), under());
        expect(outcome.ok).toBe(true);
        expect(outcome.spec?.secondLeg).toMatchObject({ strategy: 'under', barrier: 8 });
        expect(outcome.spec?.entry).toMatchObject({ strategy: 'over', barrier: 1 });
        expect(outcome.message).toMatch(/second rule/);
    });

    it('builds and validates a bot with both legs buying their own contract', () => {
        const combined = combineSpecs(over(), under()).spec as StrategySpec;
        const assembled = assemble(combined, registry);
        expect(assembled.ok).toBe(true);
        if (assembled.ok === false) return;

        const blocks = blocksOf(assembled.bot.workspace);
        const purchases = blocks.filter(block => block.type === 'purchase').map(block => block.fields?.PURCHASE_LIST);
        expect(purchases.sort()).toEqual(['DIGITOVER', 'DIGITUNDER']);
        expect(blocks.find(block => block.type === 'trade_definition_contracttype')?.fields?.TYPE_LIST).toBe('both');
        // The barrier of the leg that trades next is carried in a variable read at each loop start.
        const options = blocks.find(block => block.type === 'trade_definition_tradeoptions');
        expect(options?.values?.PREDICTION?.[0].type).toBe('variables_get');
        expect(blocks.filter(block => block.type === 'variables_set' && block.fields?.VAR === 'architect:leg').length).toBeGreaterThan(1);
    });

    it('keeps each leg\'s own digits and filters', () => {
        const secondary = plan('Trade Under 8 on all markets, entry is 8 and 9, digits 0 below 10%');
        const combined = combineSpecs(over(), secondary).spec as StrategySpec;
        expect(combined.secondLeg?.digits).toEqual([8, 9]);
        expect(combined.secondLeg?.filters.frequencies).toEqual([{ digit: 0, operator: 'below', percent: 10 }]);
        expect(combined.entry.digits).toEqual([]);
    });

    it('refuses two bots that need different trade types', () => {
        const outcome = combineSpecs(over(), plan('Trade even digits on all volatility markets'));
        expect(outcome.ok).toBe(false);
        expect(outcome.message).toMatch(/Trade type/);
    });

    it('refuses bots on different single markets', () => {
        const outcome = combineSpecs(plan('Trade Over 1 on R_100'), plan('Trade Over 2 on R_50'));
        expect(outcome.ok).toBe(false);
        expect(outcome.message).toMatch(/one market/i);
    });

    it('refuses a bot that does not trade', () => {
        const outcome = combineSpecs(over(), plan('Observation only: Over 1 on all markets'));
        expect(outcome.ok).toBe(false);
        expect(outcome.message).toMatch(/Only trading bots/);
    });

    it('refuses to add a third rule', () => {
        const twice = combineSpecs(over(), under()).spec as StrategySpec;
        expect(combineSpecs(twice, plan('Trade Over 3 on all markets')).ok).toBe(false);
    });
});
