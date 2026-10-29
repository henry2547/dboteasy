/**
 * Every Free Bots template is only loadable if it survives the app's own
 * pre-flight inspection, so these tests run `inspectFreeBotXml` — the exact
 * function `use-free-bot-loader` calls before anything reaches the workspace —
 * against the shipped assets.
 *
 * The known block types are read from the block sources under
 * `src/external/bot-skeleton/scratch/blocks/`, not listed here, so a template
 * that starts using a block the Builder does not register fails the test.
 */

import fs from 'fs';
import path from 'path';

// rsbuild inlines `src/xml/*.xml` as raw strings (raw-loader); jest has no such
// loader, so every asset is mocked here — each assertion reads the real file
// from disk instead.
jest.mock('@/xml/over1_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over1_two_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_two_high_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/over2_three_low_digits.xml', () => '', { virtual: true });
jest.mock('@/xml/over2_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/over3_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under7_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under6_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under7_rare_nine.xml', () => '', { virtual: true });
jest.mock('@/xml/even_odd_window.xml', () => '', { virtual: true });
jest.mock('@/xml/parity_recovery_bot.xml', () => '', { virtual: true });

import { applyMarketToXml, inspectFreeBotXml } from '../bot-xml';
import { FREE_BOT_TEMPLATES, type FreeBotTemplate } from '../templates';

const repo_root = path.resolve(__dirname, '../../../..');
const blocks_root = path.join(repo_root, 'src/external/bot-skeleton/scratch/blocks');

function registeredBlockTypes(): Set<string> {
    const types = new Set<string>();

    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) {
                const source = fs.readFileSync(full, 'utf8');
                for (const match of source.matchAll(/window\.Blockly\.Blocks\.([A-Za-z0-9_]+)\s*=/g)) {
                    types.add(match[1]);
                }
            }
        }
    };

    walk(blocks_root);

    // The observer blocks are registered from a runtime catalogue (`obs_…` types are derived from
    // ids), so they cannot be read off `window.Blockly.Blocks = …` assignments — take them from the
    // catalogue the Builder itself registers from.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const catalog = require('@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog');
    (catalog.BLOCKS as { type: string }[]).forEach(spec => types.add(spec.type));

    return types;
}

/** The eleven groups the Bot Builder palette shows: four observer groups and seven engine categories. */
const PALETTE_GROUPS = [
    'observer_digit_frequency',
    'observer_pattern_parity',
    'observer_control',
    'observer_entry_monitoring',
    'digits',
    'market_intelligence',
    'risk_management',
    'strategy_learning',
    'trading_execution',
    'bot_control',
    'session_reporting',
];

/**
 * The block types each flat engine category of the palette lists, read from the palette source so a
 * block that moves category moves with the test instead of leaving a stale copy here.
 */
function enginePaletteGroups(): Map<string, Set<string>> {
    const source = fs.readFileSync(
        path.join(repo_root, 'src/pages/bot-builder/toolbox/toolbox-items.tsx'),
        'utf8'
    );
    const groups = new Map<string, Set<string>>();

    source
        .split(/<Category id='/)
        .slice(1)
        .forEach(section => {
            const id = section.slice(0, section.indexOf("'"));
            const types = new Set(Array.from(section.matchAll(/<Block type='([a-z0-9_]+)'/g), match => match[1]));
            if (types.size && PALETTE_GROUPS.includes(id)) groups.set(id, types);
        });

    return groups;
}

const assetOf = (template: FreeBotTemplate) =>
    fs.readFileSync(path.join(repo_root, 'src/xml', template.asset), 'utf8');

describe('Free Bots templates', () => {
    const known = registeredBlockTypes();
    const isKnown = (type: string) => known.has(type);

    it('reads the block registry from the Builder sources', () => {
        expect(known.has('last_digit')).toBe(true);
        expect(known.has('trade_definition_tradeoptions')).toBe(true);
        expect(known.size).toBeGreaterThan(50);
    });

    it.each(FREE_BOT_TEMPLATES)('$name passes the loader inspection', template => {
        const report = inspectFreeBotXml(assetOf(template), template, isKnown);

        expect(report.errors).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.settings.symbol).toBe(template.defaultMarket);
        expect(report.settings.tradeTypeCategory).toBe('digits');
        expect(report.settings.tradeType).toBe(template.tradeType ?? 'overunder');
        expect(report.settings.contractType).toBe(template.contractType);
        expect(report.variables.some(name => name.startsWith('freebot:'))).toBe(true);

        if (template.parityRecovery) {
            // Parity recovery: both legs read their barrier from the block, so the trade options
            // carry no prediction at all.
            expect(report.settings.prediction).toBeNull();
            expect(report.checks.find(check => check.id === 'entry-condition')?.passed).toBe(true);
        } else if (template.entryParity) {
            // Even/Odd: gated by parity, so no barrier digit at all.
            expect(report.settings.prediction).toBeNull();
            expect(report.settings.entryParity).toBe(template.entryParity);
        } else {
            expect(report.settings.prediction).toBe(String(template.prediction));
            expect(report.settings.entryOperator).toBe(template.entryOperator);
            expect(report.settings.triggerDigit).toBe(String(template.triggerDigit));
        }
    });

    it.each(FREE_BOT_TEMPLATES)('$name states its purchase and restart conditions', template => {
        expect(template.buyCondition.length).toBeGreaterThan(20);
        expect(template.restartCondition.length).toBeGreaterThan(20);
    });

    it('the single Even/Odd bot buys both parities with the Even/Odd strategy blocks', () => {
        const parityTemplates = FREE_BOT_TEMPLATES.filter(template => !!template.entryParity);

        expect(parityTemplates.map(template => template.id)).toEqual(['even_odd_window']);
        parityTemplates.forEach(template => {
            const report = inspectFreeBotXml(assetOf(template), template, isKnown);
            expect(report.ok).toBe(true);
            expect(report.blockTypes).toEqual(
                expect.arrayContaining([
                    'eo_configure',
                    'eo_monitor_ticks',
                    'eo_signal_direction',
                    'eo_buy_even',
                    'eo_buy_odd',
                    'eo_one_entry_per_signal',
                ])
            );
            expect(report.settings.entryParity).toBe('both');
            expect(report.settings.prediction).toBeNull();
            expect(report.settings.contractType).toBe('both');
            expect(report.settings.tradeType).toBe('evenodd');
            expect(report.checks.find(check => check.id === 'even-odd-window')?.passed).toBe(true);
        });
    });

    it('the parity-recovery bot lets a settled loss reach its Even/Odd leg', () => {
        const template = FREE_BOT_TEMPLATES.find(item => item.id === 'over1_parity_recovery')!;
        const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');

        const block = doc.querySelector('block[type="before_purchase"] block[type="digits_parity_recovery"]');
        expect(block).not.toBeNull();
        expect(block!.querySelector('field[name="RUN"]')?.textContent).toBe('2');
        expect(block!.querySelector('field[name="PARITY"]')?.textContent).toBe('both');
        // The reversal is read synchronously from the live digits, so the block carries no scan sample.
        expect(block!.querySelector('field[name="TICKS"]')).toBeNull();

        // The reversal buys the OPPOSITE of a run of same-parity digits, so a gate that only accepts
        // "parity switched" could never reach it: the gate has to let a settled loss through too.
        const recovering = doc.querySelector(
            'block[type="before_purchase"] block[id="freebot-pr-observer-recovering"]'
        );
        expect(recovering).not.toBeNull();
        expect(recovering!.querySelector('block[type="exec_last_result"]')).not.toBeNull();
        expect(recovering!.querySelector('block[type="text"] field[name="TEXT"]')?.textContent).toBe('loss');
        expect(
            doc.querySelector(
                'block[type="before_purchase"] block[id="freebot-pr-observer-parity-or-recovery"] field[name="OP"]'
            )?.textContent
        ).toBe('OR');
    });

    it('never nests an ordinary block inside an observer condition', () => {
        // The observer runtime evaluates a condition from observer blocks only: `readProgram` keeps
        // just the blocks its catalogue knows, so any other block reached through a `value` socket
        // answers Inconclusive, which `Bot.observerCondition` reports as false. A plain OR glued
        // into an `obs_and` therefore made the whole gate — and the parity-recovery entry it guards —
        // unreachable, however correct the recovery logic behind it was.
        const operandsOf = (block: Element): Element[] =>
            Array.from(block.children)
                .filter(child => child.localName === 'value')
                .flatMap(value => Array.from(value.children).filter(child => child.localName === 'block'));

        FREE_BOT_TEMPLATES.forEach(template => {
            const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');
            Array.from(doc.querySelectorAll('block')).forEach(block => {
                const type = block.getAttribute('type') ?? '';
                if (!type.startsWith('obs_')) return;
                operandsOf(block).forEach(operand => {
                    expect({ template: template.id, operand: operand.getAttribute('type') }).toEqual({
                        template: template.id,
                        operand: expect.stringMatching(/^obs_/),
                    });
                });
            });
        });

        // The loss OR is combined with the observer conditions by an ordinary AND, so the generated
        // program evaluates it while the observer keeps judging its own conditions.
        const doc = new DOMParser().parseFromString(
            assetOf(FREE_BOT_TEMPLATES.find(item => item.id === 'over1_parity_recovery')!),
            'application/xml'
        );
        const gate = doc.querySelector('block[id="freebot-pr-observer-gate-and"]');
        expect(gate?.querySelector('field[name="OP"]')?.textContent).toBe('AND');
        const loss_or = gate?.querySelector('block[id="freebot-pr-observer-parity-or-recovery"]') ?? null;
        expect(loss_or).not.toBeNull();
        expect(loss_or!.closest('block[type^="obs_"]')).toBeNull();
    });

    it('the observer-gated templates really carry observer blocks', () => {
        const gated = FREE_BOT_TEMPLATES.filter(template =>
            /Read Digit N Ticks Ago|Check Minimum Sample Size/.test(template.blocksUsed)
        );

        expect(gated.length).toBeGreaterThanOrEqual(3);
        gated.forEach(template => {
            const report = inspectFreeBotXml(assetOf(template), template, isKnown);
            expect(report.blockTypes.some(type => type.startsWith('obs_'))).toBe(true);
            expect(report.unsupportedTypes).toEqual([]);
        });
    });

    it('every observer-gated template gates on all four block groups', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const catalog = require('@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog');
        const specOf = new Map<string, { category: string }>(
            (catalog.BLOCKS as { type: string; category: string }[]).map(spec => [spec.type, spec])
        );
        const groupOfCategory = catalog.GROUP_OF_CATEGORY as Map<string, { id: string }>;
        const allGroups = (catalog.GROUPS as { id: string }[]).map(group => group.id).sort();

        const gated = FREE_BOT_TEMPLATES.filter(template =>
            /Read Digit N Ticks Ago|Check Minimum Sample Size/.test(template.blocksUsed)
        );

        expect(gated.length).toBeGreaterThanOrEqual(3);
        gated.forEach(template => {
            const report = inspectFreeBotXml(assetOf(template), template, isKnown);
            const groups = new Set(
                report.blockTypes
                    .map(type => specOf.get(type)?.category)
                    .filter((category): category is string => !!category)
                    .map(category => groupOfCategory.get(category)?.id)
                    .filter((id): id is string => !!id)
            );
            // A gate is only "from all groups" when every palette group really contributes a block.
            expect([...groups].sort()).toEqual(allGroups);
        });
    });

    it.each(FREE_BOT_TEMPLATES)('$name draws on every palette group', template => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const catalog = require('@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog');
        const group_of_category = catalog.GROUP_OF_CATEGORY as Map<string, { id: string }>;

        const group_types = new Map<string, Set<string>>();
        const add = (group: string, type: string) => group_types.set(group, (group_types.get(group) ?? new Set()).add(type));
        (catalog.BLOCKS as { type: string; category: string }[]).forEach(spec => {
            const group = group_of_category.get(spec.category)?.id;
            if (group) add(group, spec.type);
        });
        enginePaletteGroups().forEach((types, group) => types.forEach(type => add(group, type)));

        const report = inspectFreeBotXml(assetOf(template), template, isKnown);
        const used = new Set(report.blockTypes);
        // Every template must reach into all eleven palette groups — the four observer groups plus the
        // Digits, Market intelligence, Risk management, Strategy learning, Trading & execution, Bot
        // control and Reporting categories — so the card's "Blocks used" list cannot drift from the XML.
        const missing = PALETTE_GROUPS.filter(group => {
            const types = group_types.get(group);
            return !!types && ![...types].some(type => used.has(type));
        });

        expect(missing).toEqual([]);
    });

    it('the two-leg template buys both contracts and sets its own barrier', () => {
        const template = FREE_BOT_TEMPLATES.find(item => item.id === 'over1_under6_recovery')!;
        const report = inspectFreeBotXml(assetOf(template), template, isKnown);

        expect(report.ok).toBe(true);
        expect(report.settings.contractType).toBe('both');
        expect(report.settings.purchases).toEqual(['DIGITOVER', 'DIGITUNDER']);
        // The barrier lives in a variable, so the workspace reports a block, not the primary digit.
        expect(report.settings.dynamicPrediction).toBe(true);
        expect(report.settings.prediction).toBe('1');
        expect(report.blockTypes).toEqual(
            expect.arrayContaining(['digits_high_run', 'digits_shares_below', 'digits_bar_neutral'])
        );
        expect(report.checks.find(check => check.id === 'recovery-leg')?.passed).toBe(true);
    });

    it('the recovery leg only counts digits above 6', () => {
        const template = FREE_BOT_TEMPLATES.find(item => item.id === 'over1_under6_recovery')!;
        const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');
        const gate = doc.querySelector('block[id="freebot-o1u6-rec-high-run"]')!;

        // 7, 8 and 9 are the digits that qualify: the block reads "above 6", so a 9 counts like 7
        // and 8 and a 6 breaks the wait. The run length stays the seeded `freebot:runs`.
        expect(gate.querySelector('field[name="MODE"]')?.textContent).toBe('above');
        expect(gate.querySelector('field[name="DIGIT"]')?.textContent).toBe('6');
        expect(
            gate.querySelector('value[name="COUNT"] block[type="variables_get"] field[name="VAR"]')?.textContent
        ).toBe('freebot:runs');
    });

    it('counts only the blocks Blockly will hold on the canvas', () => {
        // 93 real blocks + 20 shadows − 2 shadows replaced by a real block in
        // the same input = 111. This exact number is what the loader compares
        // the live workspace against, so a stale canvas cannot look valid.
        const report = inspectFreeBotXml(assetOf(FREE_BOT_TEMPLATES[0]), FREE_BOT_TEMPLATES[0], isKnown);
        expect(report.blockCount).toBe(111);
    });

    it('every Over/Under template keeps the losing digits cold', () => {
        // The published Over/Under setups enter only while the digits the contract loses to sit
        // below the fair 10.3% share — Over 1 waits for digits 0 and 1, Under 8 for 8 and 9.
        const cold_digits: Record<string, number[]> = {
            over1_entry_every_time: [0, 1],
            over2_entry_every_time: [0, 1, 2],
            over3_entry_every_time: [0, 1, 2, 3],
            under6_entry_every_time: [6, 7, 8, 9],
            under7_entry_every_time: [7, 8, 9],
            under8_entry_every_time: [8, 9],
            over1_two_low_digits: [0, 1],
            under8_two_high_digits: [8, 9],
            over2_three_low_digits: [0, 1, 2],
        };

        Object.entries(cold_digits).forEach(([id, digits]) => {
            const template = FREE_BOT_TEMPLATES.find(item => item.id === id)!;
            const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');
            const gates = [...doc.querySelectorAll('block[type="logic_compare"]')].filter(compare =>
                compare.querySelector('field[name="OP"]')?.textContent === 'LT'
            );

            const field_of = (scope: Element, name: string) =>
                [...scope.getElementsByTagName('field')].find(item => item.getAttribute('name') === name);

            expect(gates).toHaveLength(digits.length);
            digits.forEach((digit, index) => {
                const input = [...gates[index].children].find(
                    child => child.tagName === 'value' && child.getAttribute('name') === 'A'
                )!;
                const frequency = [...input.children].find(
                    child => child.tagName === 'block' && child.getAttribute('type') === 'digits_frequency'
                )!;

                const limit = [...gates[index].children].find(
                    child => child.tagName === 'value' && child.getAttribute('name') === 'B'
                )!;

                expect(field_of(frequency, 'DIGIT')?.textContent).toBe(String(digit));
                expect(field_of(limit, 'NUM')?.textContent).toBe('10.3');
            });
            // The trigger comparison itself is untouched — the cold filter is an extra guard.
            expect(template.entryOperator).not.toBeNull();
        });
    });

    it.each(FREE_BOT_TEMPLATES)('$name keeps "Trade again" as the last block of its stack', template => {
        const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');
        const trade_again = Array.from(doc.querySelectorAll('block[type="trade_again"]'));

        expect(trade_again).toHaveLength(1);
        // `trade_again` has no next connection at all (`setNextStatement(false)`), so a block chain
        // hung off its `<next>` aborts the whole import after the first part of after_purchase loaded:
        // the Bot Builder reports "XML file contains unsupported elements. Please check or modify
        // file." and every after-purchase block stays unrendered. Anything the settlement has to
        // journal therefore goes BEFORE `trade_again` in the same statement.
        trade_again.forEach(block => expect(block.querySelector('next')).toBeNull());
    });

    it.each(FREE_BOT_TEMPLATES)('$name declares every branch its IF blocks use', template => {
        const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');

        // Blockly only creates the inputs a `controls_if` mutation declares, and it skips an input
        // it cannot find without failing the load: an `ELSE` (or `ELSEIF`) statement on a block whose
        // mutation does not declare it is dropped silently, so the canvas holds fewer blocks than the
        // template and the loader reports stale blocks instead of loading the bot.
        Array.from(doc.querySelectorAll('block[type="controls_if"]')).forEach(block => {
            const mutation = block.querySelector('mutation');
            const elseif_count = Number(mutation?.getAttribute('elseif') ?? 0);
            const declared = new Set(['IF0', 'DO0']);
            for (let index = 1; index <= elseif_count; index++) {
                declared.add(`IF${index}`);
                declared.add(`DO${index}`);
            }
            if (mutation?.getAttribute('else') === '1') declared.add('ELSE');

            const used = Array.from(block.children)
                .filter(child => child.tagName === 'value' || child.tagName === 'statement')
                .map(child => child.getAttribute('name'));

            expect(used.filter(name => !declared.has(name as string))).toEqual([]);
        });
    });

    it('the recovery bot reads 10.3% on the rare digits and waits for three high digits', () => {
        const template = FREE_BOT_TEMPLATES.find(item => item.id === 'over1_under6_recovery')!;
        const doc = new DOMParser().parseFromString(assetOf(template), 'application/xml');
        const percent_of = (selector: string) => doc.querySelector(selector)?.textContent?.trim();

        // Over 1 waits for digit 0 and digit 1 under 10.3% of the last 1000 ticks ...
        expect(percent_of('block[id="freebot-o1u6-observer-rare-one"] field[name="PERCENT"]')).toBe('10.3');
        expect(percent_of('block[id="freebot-o1u6-p1-shares"] value[name="PERCENT"] field[name="NUM"]')).toBe('10.3');
        // ... and the Under 6 recovery waits for three ticks in a row above 6 (7, 8 or 9).
        expect(percent_of('block[id="freebot-o1u6-init-num-runs"] field[name="NUM"]')).toBe('3');
        expect(percent_of('block[id="freebot-o1u6-rec-high-run"] field[name="MODE"]')).toBe('above');
        expect(percent_of('block[id="freebot-o1u6-rec-high-run"] field[name="DIGIT"]')).toBe('6');
    });

    it.each(FREE_BOT_TEMPLATES)('$name keeps its logic when the market is swapped', template => {
        const patched = applyMarketToXml(assetOf(template), {
            symbol: 'R_100',
            market: 'synthetic_index',
            submarket: 'random_index',
        });

        expect(patched.error).toBeNull();
        expect(patched.changed).toContain('SYMBOL_LIST');

        const report = inspectFreeBotXml(patched.xml, template, isKnown);
        expect(report.errors).toEqual([]);
        expect(report.settings.symbol).toBe('R_100');
        expect(report.settings.contractType).toBe(template.contractType);
        expect(report.settings.prediction).toBe(template.prediction === null ? null : String(template.prediction));
    });
});
