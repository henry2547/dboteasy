/**
 * The two Free Bots templates are only loadable if they survive the app's own
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
// loader, so the two assets are mocked here — every assertion reads the real
// file from disk instead.
jest.mock('@/xml/over1_entry_every_time.xml', () => '', { virtual: true });
jest.mock('@/xml/under8_entry_every_time.xml', () => '', { virtual: true });

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
    return types;
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
        expect(report.settings.tradeType).toBe('overunder');
        expect(report.settings.contractType).toBe(template.contractType);
        expect(report.settings.prediction).toBe(String(template.prediction));
        expect(report.settings.entryOperator).toBe(template.entryOperator);
        expect(report.settings.triggerDigit).toBe(String(template.triggerDigit));
        expect(report.variables.some(name => name.startsWith('freebot:'))).toBe(true);
    });

    it('counts only the blocks Blockly will hold on the canvas', () => {
        // 53 real blocks + 7 shadows − 1 shadow replaced by the stake's
        // `variables_get` = 59. This exact number is what the loader compares
        // the live workspace against, so a stale canvas cannot look valid.
        const report = inspectFreeBotXml(assetOf(FREE_BOT_TEMPLATES[0]), FREE_BOT_TEMPLATES[0], isKnown);
        expect(report.blockCount).toBe(59);
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
        expect(report.settings.prediction).toBe(String(template.prediction));
    });
});
