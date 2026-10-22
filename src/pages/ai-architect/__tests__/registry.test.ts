/**
 * The registry may only describe blocks that are really defined in this application.
 *
 * These tests read the real block source files (the same technique the observer generation tests
 * use) so a typo or an invented block id in the catalog fails here, long before it reaches a user.
 */
import fs from 'fs';
import path from 'path';
import { BLOCKS as OBSERVER_BLOCKS } from '@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog';
import { buildRegistry, CAPABILITY_CATALOG, fixedProbe, FORBIDDEN_BLOCKS, TRADE_CAPABLE_BLOCKS } from '../registry';

const BLOCKS_ROOT = path.join(__dirname, '../../../external/bot-skeleton/scratch/blocks');

const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.js$/.test(entry.name) ? [full] : [];
    });

const sources = walk(BLOCKS_ROOT).map(file => fs.readFileSync(file, 'utf8'));

const definedBlocks = new Set<string>();
const generatedBlocks = new Set<string>();
for (const source of sources) {
    for (const match of source.matchAll(/Blockly\.Blocks(?:\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])\s*=/g)) definedBlocks.add(match[1] ?? match[2]);
    for (const match of source.matchAll(/forBlock(?:\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])\s*=/g)) generatedBlocks.add(match[1] ?? match[2]);
}
// The observer palette registers every catalog block (and its generator) in a loop.
OBSERVER_BLOCKS.forEach((spec: { type: string }) => {
    definedBlocks.add(spec.type);
    generatedBlocks.add(spec.type);
});

describe('capability catalog', () => {
    it('has unique block types', () => {
        const types = CAPABILITY_CATALOG.map(entry => entry.type);
        expect(new Set(types).size).toBe(types.length);
    });

    it('describes only blocks that are defined in the application', () => {
        const invented = CAPABILITY_CATALOG.map(entry => entry.type).filter(type => !definedBlocks.has(type));
        expect(invented).toEqual([]);
    });

    it('describes only blocks that have a JavaScript generator', () => {
        const unrunnable = CAPABILITY_CATALOG.map(entry => entry.type).filter(type => !generatedBlocks.has(type));
        expect(unrunnable).toEqual([]);
    });

    it('lists every field and input with a name, and dropdowns with values', () => {
        for (const entry of CAPABILITY_CATALOG) {
            for (const field of entry.fields) {
                expect(field.name).toBeTruthy();
                if (field.kind === 'dropdown') expect(field.values?.length).toBeGreaterThan(0);
            }
            for (const input of entry.inputs) {
                expect(input.name).toBeTruthy();
                expect(input.accepts.length).toBeGreaterThan(0);
            }
        }
    });

    it('classifies each block by shape and execution', () => {
        for (const entry of CAPABILITY_CATALOG) {
            expect(['statement', 'value', 'hat', 'container']).toContain(entry.shape);
            expect(['executable', 'observational', 'informational', 'control-flow']).toContain(entry.execution);
            if (entry.shape === 'value') expect(entry.output).not.toBeNull();
        }
    });

    it('matches the observer catalog for the observer blocks it uses', () => {
        for (const entry of CAPABILITY_CATALOG.filter(candidate => candidate.type.startsWith('obs_'))) {
            const spec = (OBSERVER_BLOCKS as { type: string; fields: { name: string }[]; inputs: Record<string, string>; body?: boolean }[]).find(block => block.type === entry.type);
            expect(spec).toBeDefined();
            expect(entry.fields.map(field => field.name).sort()).toEqual((spec?.fields ?? []).map(field => field.name).sort());
            const valueInputs = Object.keys(spec?.inputs ?? {});
            expect(entry.inputs.filter(input => input.kind === 'value').map(input => input.name).sort()).toEqual(valueInputs.sort());
            expect(entry.inputs.some(input => input.kind === 'statement' && input.name === 'DO')).toBe(!!spec?.body);
        }
    });

    it('lists every gate-raising observer block as forbidden', () => {
        const gateOps = new Set(['entry', 'entry_any', 'pattern_emit']);
        const gateTypes = (OBSERVER_BLOCKS as { type: string; op: string }[]).filter(block => gateOps.has(block.op)).map(block => block.type);
        expect(gateTypes.length).toBeGreaterThan(0);
        for (const type of gateTypes) expect(Object.keys(FORBIDDEN_BLOCKS)).toContain(type);
    });

    it('treats Purchase and Trade again as the trade-capable blocks', () => {
        expect([...TRADE_CAPABLE_BLOCKS]).toEqual(['purchase', 'trade_again']);
    });
});

describe('buildRegistry', () => {
    const everything = CAPABILITY_CATALOG.map(entry => entry.type);

    it('marks every block supported when it is registered and has a generator', () => {
        const registry = buildRegistry(fixedProbe(everything));
        expect(registry.unsupportedEntries()).toEqual([]);
        expect(registry.supportedTypes().length).toBe(everything.length);
    });

    it('marks a block unsupported when Blockly has not registered it', () => {
        const registry = buildRegistry(fixedProbe(everything.filter(type => type !== 'switch_active_market')));
        expect(registry.supported('switch_active_market')).toBeUndefined();
        expect(registry.get('switch_active_market')?.reason).toContain('not registered');
    });

    it('marks a block unsupported when it appears in the palette but has no generator', () => {
        const registry = buildRegistry(fixedProbe(everything, ['risk_can_trade']));
        expect(registry.supported('risk_can_trade')).toBeUndefined();
        expect(registry.get('risk_can_trade')?.reason).toContain('no JavaScript generator');
    });

    it('marks everything unsupported when Blockly is not loaded, instead of guessing', () => {
        const registry = buildRegistry({ loaded: false, isRegistered: () => false, hasGenerator: () => false });
        expect(registry.supportedTypes()).toEqual([]);
        expect(registry.get('purchase')?.reason).toContain('not loaded');
    });

    it('never returns an unknown block as supported', () => {
        const registry = buildRegistry(fixedProbe(everything));
        expect(registry.supported('definitely_not_a_block')).toBeUndefined();
        expect(registry.get('definitely_not_a_block')).toBeUndefined();
    });
});
