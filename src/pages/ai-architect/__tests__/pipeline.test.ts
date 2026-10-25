/**
 * The AI Bot Architect pipeline: prompt -> spec -> block tree -> XML -> validation.
 *
 * Deterministic tests only. They use a probe in which every catalog block is registered, so they
 * exercise the planner, builder and validator rather than a browser's Blockly.
 */
import { allBlocks, buildBotXml, buildWorkspace } from '../builder';
import { assemble, generateBot, refineBot } from '../pipeline';
import { createSpec, planStrategy } from '../planner';
import { buildRegistry, CAPABILITY_CATALOG, fixedProbe, FORBIDDEN_BLOCKS } from '../registry';
import { validateWorkspace } from '../validator';
import type { BuiltWorkspace, StrategySpec } from '../types';

const types = CAPABILITY_CATALOG.map(entry => entry.type);
const registry = buildRegistry(fixedProbe(types));

const EXAMPLE =
    'Build a bot that scans all supported volatility markets, analyzes the last 100 digits, waits for an Over 1 setup, records the setup in Virtual Hook, observes the next tick, and only then allows a trade if all risk checks pass.';

const blockTypesOf = (workspace: BuiltWorkspace) => allBlocks(workspace).map(block => block.type);
const check = (report: ReturnType<typeof validateWorkspace>, id: string) => report.checks.find(item => item.id === id);

describe('planner: prompt -> strategy specification', () => {
    it('reads the example prompt into the right concepts, kept separate', () => {
        const { spec, clarifications } = planStrategy(EXAMPLE);
        expect(clarifications).toEqual([]);
        expect(spec).not.toBeNull();
        expect(spec?.market.scope).toBe('all');
        expect(spec?.entry).toMatchObject({ strategy: 'over', barrier: 1, trigger: 'last_digit_entry' });
        expect(spec?.filters.window).toBe(100);
        expect(spec?.observation.virtualHook).toBe(true);
        expect(spec?.mode).toBe('demo_trading');
        expect(spec?.account).toBe('demo');
    });

    it('does not confuse the entry barrier with the analysis window or a filter', () => {
        const { spec } = planStrategy('Scan all volatility markets, check the last 250 digits, Over 2, only when digit 0 is below 10%.');
        expect(spec?.entry.barrier).toBe(2);
        expect(spec?.filters.window).toBe(250);
        expect(spec?.filters.frequencies).toEqual([{ digit: 0, operator: 'below', percent: 10 }]);
    });

    it('never reads a percentage filter as a second contract', () => {
        for (const phrase of ['digit 0 is below 10%', 'digit 3 above 12.5%', 'digit 9 under 8%']) {
            const result = planStrategy(`Scan all markets, Over 1, only when ${phrase}`);
            expect(result.clarifications).toEqual([]);
            expect(result.spec?.entry).toMatchObject({ strategy: 'over', barrier: 1 });
        }
    });

    it('does not read the history window as a barrier', () => {
        const { spec } = planStrategy('Scan all markets, check the last 100 digits, Under 8');
        expect(spec?.entry).toMatchObject({ strategy: 'under', barrier: 8 });
        expect(spec?.filters.window).toBe(100);
    });

    it('reads Under 8, Even, Odd, Matches and Differs', () => {
        expect(planStrategy('Trade Under 8 on one market').spec?.entry).toMatchObject({ strategy: 'under', barrier: 8 });
        expect(planStrategy('Trade even digits on all markets').spec?.entry).toMatchObject({ strategy: 'even', barrier: null });
        expect(planStrategy('Trade odd digits on all markets').spec?.entry).toMatchObject({ strategy: 'odd', barrier: null });
        expect(planStrategy('Buy matches 5 on all markets').spec?.entry).toMatchObject({ strategy: 'matches', barrier: 5 });
        expect(planStrategy('Buy differs 3 on all markets').spec?.entry).toMatchObject({ strategy: 'differs', barrier: 3 });
    });

    it('asks a question when no contract is named, and builds nothing', () => {
        const result = planStrategy('Please build me a profitable bot for all volatility markets');
        expect(result.spec).toBeNull();
        expect(result.clarifications[0].id).toBe('contract');
        expect(result.clarifications[0].options.length).toBeGreaterThan(1);
    });

    it('asks which contract when the request names conflicting ones', () => {
        const result = planStrategy('Trade Over 1 and also Under 8 on all markets');
        expect(result.spec).toBeNull();
        expect(result.clarifications[0].id).toBe('contract_conflict');
    });

    it('asks again when the barrier is outside the contract range', () => {
        const result = planStrategy('Trade Over 9 on all markets');
        expect(result.spec).toBeNull();
        expect(result.clarifications[0].id).toBe('barrier_range');
    });

    it('lists every default it applied instead of inventing silently', () => {
        const { defaults } = planStrategy('Trade Over 1 on all volatility markets');
        const fields = defaults.map(item => item.field);
        expect(fields).toEqual(expect.arrayContaining(['Analysis window', 'Stake', 'Take profit', 'Stop loss', 'Max consecutive losses']));
        defaults.forEach(item => expect(item.reason.length).toBeGreaterThan(0));
    });

    it('keeps values the user gave and does not default them', () => {
        const { spec, defaults } = planStrategy('Trade Over 1 on all markets with stake 2, stop after 4 consecutive losses, take profit 8, stop loss 15');
        expect(spec?.risk).toMatchObject({ stake: 2, maxConsecutiveLosses: 4, takeProfit: 8, stopLoss: 15 });
        const fields = defaults.map(item => item.field);
        expect(fields).not.toContain('Stake');
        expect(fields).not.toContain('Max consecutive losses');
    });

    it('clamps an out-of-range window and says so', () => {
        const { spec, defaults } = planStrategy('Trade Over 1 on all markets using the last 99999 ticks');
        expect(spec?.filters.window).toBe(1000);
        expect(defaults.find(item => item.field === 'Analysis window')?.reason).toContain('outside');
    });

    it('detects observation-only and signal-only requests', () => {
        expect(planStrategy('Observation only: scan all markets for Over 1 and record the setup').spec?.mode).toBe('observation');
        expect(planStrategy('Signal only, scan all markets for Under 8').spec?.mode).toBe('signal');
    });

    it('defaults a pure learning request to observation, not trading', () => {
        const { spec } = planStrategy('Scan all markets for Over 1, record the setup in Virtual Hook and observe the next tick');
        expect(spec?.observation.virtualHook).toBe(true);
    });

    it('reports unsupported asks rather than substituting a different rule', () => {
        const result = planStrategy('Trade Over 1 on all markets using RSI, guaranteed profit, on my real account');
        expect(result.spec).not.toBeNull();
        expect(result.unsupported.join(' ')).toMatch(/Indicator-based/);
        expect(result.unsupported.join(' ')).toMatch(/guarantee/);
        expect(result.unsupported.join(' ')).toMatch(/Real trading is never selected/);
    });

    it('never selects a real account at build time', () => {
        expect(planStrategy('Trade Over 1 on all markets on my real account').spec?.account).toBe('demo');
    });

    it('treats a very short request as needing a description', () => {
        expect(planStrategy('bot').clarifications[0].id).toBe('describe');
    });
});

describe('builder: spec -> registered blocks', () => {
    const plan = (prompt: string): StrategySpec => planStrategy(prompt).spec as StrategySpec;

    it('uses only registered block types', () => {
        const workspace = buildWorkspace(plan(EXAMPLE));
        const unknown = blockTypesOf(workspace).filter(type => !registry.get(type));
        expect(unknown).toEqual([]);
    });

    it('builds the example bot with every stage the brief lists', () => {
        const used = new Set(blockTypesOf(buildWorkspace(plan(EXAMPLE))));
        [
            'trade_definition',
            'market_discover_eligible',
            'switch_active_market',
            'digits_frequency',
            'report_journal',
            'obs_configure_over',
            'obs_evaluate_over',
            'risk_can_trade',
            'purchase',
            'after_purchase',
        ].forEach(type => {
            if (type === 'digits_frequency') return; // only present when a frequency filter is requested
            expect(used.has(type)).toBe(true);
        });
    });

    it('seeds the stake in the trade definition run-once statement', () => {
        const workspace = buildWorkspace(plan(EXAMPLE));
        const definition = workspace.roots.find(root => root.type === 'trade_definition');
        const init = definition?.statements?.INITIALIZATION ?? [];
        const sets = allBlocks({ roots: init, variables: [] }).filter(block => block.type === 'variables_set').map(block => block.fields?.VAR);
        expect(sets).toContain('architect:stake');
    });

    it('puts the entry condition in the scan AND the confirmation', () => {
        const workspace = buildWorkspace(plan(EXAMPLE));
        const blocks = allBlocks(workspace);
        const switchBlock = blocks.find(block => block.type === 'switch_active_market');
        expect(switchBlock?.values?.CONDITION).toHaveLength(1);
        expect(blocks.filter(block => block.type === 'last_digit').length).toBeGreaterThanOrEqual(2);
    });

    it('does not scan for a single-market bot', () => {
        const used = blockTypesOf(buildWorkspace(plan('Trade Over 1 on R_100')));
        expect(used).not.toContain('switch_active_market');
        expect(used).not.toContain('market_discover_eligible');
        const definition = buildWorkspace(plan('Trade Over 1 on R_100')).roots[0];
        expect(JSON.stringify(definition)).toContain('R_100');
    });

    it('adds the frequency filter on the requested window', () => {
        const workspace = buildWorkspace(plan('Scan all markets, Over 1, last 250 digits, digit 0 below 10%'));
        const frequency = allBlocks(workspace).find(block => block.type === 'digits_frequency');
        expect(frequency?.fields?.DIGIT).toBe('0');
        expect(frequency?.values?.SAMPLE?.[0].fields?.NUM).toBe(250);
    });

    it('writes well-formed XML with the engine blocks nested where the engine reads them', () => {
        const { xml } = buildBotXml(plan(EXAMPLE));
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
        const before = doc.querySelector('block[type="before_purchase"]');
        expect(before?.querySelector('block[type="switch_active_market"]')).not.toBeNull();
        expect(before?.querySelector('block[type="purchase"]')).not.toBeNull();
        expect(doc.querySelector('block[type="trade_definition"] > statement[name="INITIALIZATION"]')).not.toBeNull();
    });

    it('escapes user text so a prompt cannot break out of the XML', () => {
        const spec = plan(EXAMPLE);
        spec.observation.strategyLabel = 'Over "1" <script>&';
        const { xml } = buildBotXml(spec);
        expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
        expect(xml).not.toContain('<script>');
    });

    it('is deterministic', () => {
        expect(buildBotXml(plan(EXAMPLE)).xml).toBe(buildBotXml(plan(EXAMPLE)).xml);
    });
});

describe('validator', () => {
    it('passes the example bot', () => {
        const result = generateBot(EXAMPLE, { registry });
        expect(result.ok).toBe(true);
        expect(result.bot?.validation.errors).toEqual([]);
    });

    it('passes every contract family', () => {
        ['Over 1', 'Over 2', 'Under 8', 'Under 7', 'Even', 'Odd', 'Matches 5', 'Differs 4'].forEach(contract => {
            const result = generateBot(`Scan all volatility markets and trade ${contract}`, { registry });
            expect({ contract, ok: result.ok, errors: result.bot?.validation.errors }).toEqual({ contract, ok: true, errors: [] });
        });
    });

    it('rejects a block type that is not in the registry', () => {
        const workspace = buildWorkspace(createSpec());
        workspace.roots[1].statements!.BEFOREPURCHASE_STACK.push({ id: 'x', type: 'invented_block' });
        const report = validateWorkspace(workspace, registry);
        expect(report.ok).toBe(false);
        expect(check(report, 'registered')?.detail).toContain('invented_block');
        expect(report.unsupportedTypes).toContain('invented_block');
    });

    it('rejects a block that is registered but has no generator', () => {
        const narrow = buildRegistry(fixedProbe(types, ['switch_active_market']));
        const result = generateBot(EXAMPLE, { registry: narrow });
        expect(result.ok).toBe(false);
        expect(result.failedAt).toBe('validate');
        expect(check(result.bot!.validation, 'executable')?.detail).toContain('no JavaScript generator');
    });

    it('rejects a dropdown value that is not allowed', () => {
        const workspace = buildWorkspace(createSpec());
        const contract = allBlocks(workspace).find(block => block.type === 'trade_definition_contracttype')!;
        contract.fields = { TYPE_LIST: 'DIGITMAYBE' };
        expect(check(validateWorkspace(workspace, registry), 'fields')?.level).toBe('error');
    });

    it('rejects a field that does not exist', () => {
        const workspace = buildWorkspace(createSpec());
        allBlocks(workspace).find(block => block.type === 'purchase')!.fields = { WRONG: '1' };
        expect(check(validateWorkspace(workspace, registry), 'fields')?.detail).toContain('no field "WRONG"');
    });

    it('rejects a missing required input', () => {
        const workspace = buildWorkspace(createSpec({ multi: true }));
        const scan = allBlocks(workspace).find(block => block.type === 'switch_active_market')!;
        delete scan.values!.CONDITION;
        const report = validateWorkspace(workspace, registry);
        expect(check(report, 'inputs')?.level).toBe('error');
        expect(check(report, 'inputs')?.detail).toContain('CONDITION');
    });

    it('rejects an incompatible connection', () => {
        const workspace = buildWorkspace(createSpec({ multi: true }));
        const scan = allBlocks(workspace).find(block => block.type === 'switch_active_market')!;
        scan.values!.CONDITION = [{ id: 'n', type: 'math_number', fields: { NUM: 1 } }];
        expect(check(validateWorkspace(workspace, registry), 'sockets')?.level).toBe('error');
    });

    it('rejects a value block placed in a statement stack', () => {
        const workspace = buildWorkspace(createSpec());
        workspace.roots[1].statements!.BEFOREPURCHASE_STACK.push({ id: 'v', type: 'last_digit' });
        expect(check(validateWorkspace(workspace, registry), 'chains')?.level).toBe('error');
    });

    it('rejects a second purchase-conditions stack as a duplicate loop', () => {
        const workspace = buildWorkspace(createSpec());
        workspace.roots.push({ ...workspace.roots[1], id: 'dup' });
        expect(check(validateWorkspace(workspace, registry), 'duplicate-loops')?.level).toBe('error');
    });

    it('rejects two scans', () => {
        const spec = createSpec({ multi: true });
        const workspace = buildWorkspace(spec);
        const stack = workspace.roots[1].statements!.BEFOREPURCHASE_STACK[0].statements!.DO0;
        stack.unshift({ ...allBlocks(workspace).find(block => block.type === 'switch_active_market')!, id: 'second-scan' });
        expect(check(validateWorkspace(workspace, registry, { spec }), 'scan-loop')?.level).toBe('error');
    });

    it('rejects a scan that the stop flag does not guard', () => {
        const spec = createSpec({ multi: true });
        const workspace = buildWorkspace(spec);
        const guard = workspace.roots[1].statements!.BEFOREPURCHASE_STACK[0];
        workspace.roots[1].statements!.BEFOREPURCHASE_STACK = guard.statements!.DO0;
        expect(check(validateWorkspace(workspace, registry, { spec }), 'scan-loop')?.detail).toContain('stop');
    });

    it('rejects a scan and confirmation that disagree about the entry rule', () => {
        const spec = createSpec({ multi: true, strategy: 'over', barrier: 1 });
        const workspace = buildWorkspace(spec);
        // The confirmation is the `if` that DIRECTLY holds the purchase (the outer one is the stop guard).
        const confirm = allBlocks(workspace).find(block => block.type === 'controls_if' && block.statements?.DO0?.some(inner => inner.type === 'purchase'))!;
        const compare = allBlocks({ roots: confirm.values!.IF0, variables: [] }).find(block => block.type === 'logic_compare')!;
        compare.fields = { OP: 'GTE' };
        expect(check(validateWorkspace(workspace, registry, { spec }), 'market-consistency')?.level).toBe('error');
    });

    it('rejects a stake variable that is read but never seeded at start', () => {
        const workspace = buildWorkspace(createSpec());
        workspace.roots[0].statements!.INITIALIZATION = [];
        expect(check(validateWorkspace(workspace, registry), 'stake-at-start')?.level).toBe('error');
    });

    it('rejects a missing trade definition', () => {
        const workspace = buildWorkspace(createSpec());
        workspace.roots = workspace.roots.filter(root => root.type !== 'trade_definition');
        expect(check(validateWorkspace(workspace, registry), 'roots')?.level).toBe('error');
    });

    it.each(Object.keys(FORBIDDEN_BLOCKS))('rejects the gate-raising block %s', type => {
        const workspace = buildWorkspace(createSpec());
        workspace.roots[1].statements!.BEFOREPURCHASE_STACK.push({ id: 'g', type });
        expect(check(validateWorkspace(workspace, registry), 'forbidden')?.level).toBe('error');
    });

    it('requires the risk guard on the purchase of a trading bot', () => {
        const spec = createSpec({ multi: true, mode: 'demo_trading' });
        const workspace = buildWorkspace(spec);
        const guardBlocks = allBlocks(workspace).filter(block => block.type === 'risk_can_trade');
        guardBlocks.forEach(block => {
            block.type = 'logic_boolean';
            block.fields = { BOOL: 'TRUE' };
        });
        expect(check(validateWorkspace(workspace, registry, { spec }), 'risk-guard')?.level).toBe('error');
    });

    it('requires exactly one purchase in a trading bot', () => {
        const spec = createSpec({ mode: 'demo_trading' });
        const workspace = buildWorkspace(spec);
        const stack = allBlocks(workspace).find(block => block.type === 'controls_if' && block.statements?.DO0?.some(inner => inner.type === 'purchase'))!;
        stack.statements!.DO0 = [];
        expect(check(validateWorkspace(workspace, registry, { spec }), 'purchase')?.level).toBe('error');
    });
});

describe('safety: no automatic trading', () => {
    const modes = ['observation', 'signal'] as const;

    it.each(modes)('a %s bot contains no Purchase or Trade again block and cannot buy', mode => {
        const spec = createSpec({ multi: true, mode, hook: true });
        const used = blockTypesOf(buildWorkspace(spec));
        expect(used).not.toContain('purchase');
        expect(used).not.toContain('trade_again');
        expect(used).not.toContain('after_purchase');
        expect(used).toContain('bot_stop');
        expect(assemble(spec, registry).ok).toBe(true);
    });

    it.each(modes)('the validator fails a %s bot that gains a purchase', mode => {
        const spec = createSpec({ multi: true, mode });
        const workspace = buildWorkspace(spec);
        workspace.roots[1].statements!.BEFOREPURCHASE_STACK.push({ id: 'p', type: 'purchase', fields: { PURCHASE_LIST: 'DIGITOVER' } });
        expect(check(validateWorkspace(workspace, registry, { spec }), 'no-trade')?.level).toBe('error');
    });

    it('never puts a gate-raising observer block in any generated bot', () => {
        const prompts = [EXAMPLE, 'Observation only: Over 1 on all markets with virtual hook', 'Signal only Under 8 all markets', 'Trade even on all markets'];
        for (const prompt of prompts) {
            const used = blockTypesOf(generateBot(prompt, { registry }).bot!.workspace);
            Object.keys(FORBIDDEN_BLOCKS).forEach(type => expect(used).not.toContain(type));
        }
    });

    it('keeps Demo as the only account the spec can carry', () => {
        expect(generateBot(EXAMPLE, { registry }).bot?.spec.account).toBe('demo');
    });

    it('does not claim a virtual observation is a purchased contract', () => {
        const { bot } = generateBot('Observation only: scan all markets for Over 1 with virtual hook', { registry });
        const text = JSON.stringify(bot?.workspace);
        expect(text).toMatch(/not a purchased contract/);
        expect(bot?.explanation.tradeBehaviour).toMatch(/never buys/);
    });
});

describe('Virtual Hook', () => {
    it('records the setup and arms a next-tick observation, in that order, only on a confirmed entry', () => {
        const { bot } = generateBot(EXAMPLE, { registry });
        const confirm = allBlocks(bot!.workspace).find(block => block.type === 'controls_if' && block.statements?.DO0?.some(inner => inner.type === 'report_journal'))!;
        const order = confirm.statements!.DO0.map(block => block.type);
        expect(order.indexOf('report_journal')).toBeLessThan(order.indexOf('obs_configure_over'));
        expect(order.indexOf('obs_configure_over')).toBeLessThan(order.indexOf('obs_evaluate_over'));
        expect(order.indexOf('obs_evaluate_over')).toBeLessThan(order.indexOf('purchase'));
    });

    it('sets the digit first for Matches and Differs', () => {
        const spec = createSpec({ strategy: 'matches', barrier: 5, multi: true, hook: true });
        const order = blockTypesOf(buildWorkspace(spec));
        expect(order.indexOf('obs_set_digit')).toBeLessThan(order.indexOf('obs_configure_matches'));
    });

    it('is absent unless the user asked for it', () => {
        const used = blockTypesOf(generateBot('Trade Over 1 on all markets', { registry }).bot!.workspace);
        expect(used.some(type => type.startsWith('obs_'))).toBe(false);
    });
});

describe('refinement', () => {
    const base = (): StrategySpec => planStrategy(EXAMPLE).spec as StrategySpec;

    it('changes only what the instruction names', () => {
        const before = base();
        const { refine } = refineBot(before, 'Change the historical window from 100 ticks to 250 ticks, add a market cooldown, and stop after five consecutive losses.', registry);
        expect(refine.spec.filters.window).toBe(250);
        expect(refine.spec.risk.maxConsecutiveLosses).toBe(5);
        expect(refine.spec.risk.cooldownCycles).toBeGreaterThan(0);
        expect(refine.spec.entry).toEqual(before.entry);
        expect(refine.spec.market).toEqual(before.market);
        expect(refine.spec.observation).toEqual(before.observation);
        expect(refine.spec.risk.stake).toBe(before.risk.stake);
        expect(refine.changes.map(change => change.field)).toEqual(expect.arrayContaining(['History window', 'Stop after consecutive losses', 'Market cooldown']));
    });

    it('reports no change when the instruction restates a value the bot already has', () => {
        const before = base();
        const { refine } = refineBot(before, 'Stop after three consecutive losses', registry);
        expect(before.risk.maxConsecutiveLosses).toBe(3);
        expect(refine.changes).toEqual([]);
        expect(refine.unrecognised).toEqual([]);
    });

    it('does not mutate the spec it was given', () => {
        const before = base();
        const snapshot = JSON.stringify(before);
        refineBot(before, 'Change the analysis window to 300 ticks', registry);
        expect(JSON.stringify(before)).toBe(snapshot);
    });

    it('rebuilds and revalidates the whole workspace after a change', () => {
        const outcome = refineBot(base(), 'Change the analysis window to 250 ticks and add digit 0 below 10%', registry);
        expect(outcome.result.ok).toBe(true);
        expect(outcome.result.ok && outcome.result.bot.validation.ok).toBe(true);
        const sample = allBlocks((outcome.result as { bot: { workspace: BuiltWorkspace } }).bot.workspace).find(block => block.type === 'digits_frequency');
        expect(sample?.values?.SAMPLE?.[0].fields?.NUM).toBe(250);
    });

    it('keeps the contract and markets when the window changes', () => {
        const next = refineBot(base(), 'Change the window to 250 ticks', registry).refine.spec;
        expect(next.entry.strategy).toBe('over');
        expect(next.entry.barrier).toBe(1);
        expect(next.market.scope).toBe('all');
    });

    it('can make a bot observation-only, which removes every purchase path', () => {
        const outcome = refineBot(base(), 'Make the bot observation-only', registry);
        expect(outcome.refine.spec.mode).toBe('observation');
        const used = blockTypesOf((outcome.result as { bot: { workspace: BuiltWorkspace } }).bot.workspace);
        expect(used).not.toContain('purchase');
        expect(used).not.toContain('trade_again');
    });

    it('adds and removes the Virtual Hook', () => {
        const plain = planStrategy('Trade Over 1 on all markets').spec as StrategySpec;
        const added = refineSpec_(plain, 'Add the Virtual Hook and record the next tick');
        expect(added.observation.virtualHook).toBe(true);
        expect(refineSpec_(added, 'Remove the virtual hook').observation.virtualHook).toBe(false);
    });

    it('removes a martingale by returning to flat staking', () => {
        const martingale = planStrategy('Trade Over 1 on all markets with martingale 2').spec as StrategySpec;
        expect(martingale.risk.multiplier).toBe(2);
        expect(refineSpec_(martingale, 'Remove the martingale progression').risk.multiplier).toBe(1);
    });

    it('reports a request no block can represent instead of approximating it', () => {
        const { refine } = refineBot(base(), 'Add an RSI filter and remove the stop loss', registry);
        expect(refine.unsupported.length).toBe(2);
        expect(refine.unsupported.join(' ')).toMatch(/RSI/);
        expect(refine.unsupported.join(' ')).toMatch(/cannot be removed/);
        expect(refine.changes).toEqual([]);
    });

    it('flags an instruction it does not recognise at all', () => {
        expect(refineBot(base(), 'Make it fancier please', registry).refine.unrecognised).toHaveLength(1);
    });

    it('re-validates, so a refinement that breaks the bot is not accepted silently', () => {
        const narrow = buildRegistry(fixedProbe(types, ['risk_can_trade']));
        const outcome = refineBot(base(), 'Change the window to 250 ticks', narrow);
        expect(outcome.result.ok).toBe(false);
    });
});

// Local helper: refine and return only the spec.
import { refineSpec as refineSpec_wrapper } from '../refiner';
function refineSpec_(spec: StrategySpec, instruction: string): StrategySpec {
    return refineSpec_wrapper(spec, instruction).spec;
}

describe('safe failure', () => {
    it('returns a clarification, not an exception, for an unusable prompt', () => {
        const result = generateBot('???', { registry });
        expect(result.ok).toBe(false);
        expect(result.failedAt).toBe('understand');
        expect(result.clarifications.length).toBeGreaterThan(0);
    });

    it('fails closed when Blockly is not loaded, naming the reason', () => {
        const unloaded = buildRegistry({ loaded: false, isRegistered: () => false, hasGenerator: () => false });
        const result = generateBot(EXAMPLE, { registry: unloaded });
        expect(result.ok).toBe(false);
        expect(result.bot?.validation.checks.find(item => item.id === 'executable')?.detail).toContain('not loaded');
    });

    it('turns a planner that throws into a build failure, not a crash', () => {
        const spec = createSpec();
        (spec.entry as { strategy: unknown }).strategy = 'nonsense';
        const result = assemble(spec, registry);
        expect(result.ok).toBe(false);
    });
});
