/**
 * The saved AI bot library: save, versioning, rename, duplicate, restore, delete and XML import.
 * Uses an in-memory storage, so no browser is needed.
 */
import { BotLibrary, inspectImportedXml, LIBRARY_KEY, MAX_VERSIONS } from '../library';
import { generateBot } from '../pipeline';
import { buildRegistry, CAPABILITY_CATALOG, fixedProbe } from '../registry';

const registry = buildRegistry(fixedProbe(CAPABILITY_CATALOG.map(entry => entry.type)));

const memoryStorage = () => {
    const data: Record<string, string> = {};
    return {
        data,
        getItem: (key: string) => (key in data ? data[key] : null),
        setItem: (key: string, value: string) => {
            data[key] = value;
        },
    };
};

const PROMPT = 'Build an Over 1 digit bot that scans volatility markets and trades with demo stake 1.';

function makeInput(name = 'My bot') {
    const result = generateBot(PROMPT, { registry });
    if (!result.ok || !result.bot) throw new Error(`fixture bot failed: ${result.message}`);
    const { bot } = result;
    return {
        name,
        prompt: PROMPT,
        spec: bot.spec,
        xml: bot.xml,
        validation: bot.validation,
        blockTypes: bot.validation.blockTypes,
    };
}

describe('BotLibrary', () => {
    it('starts empty and treats corrupt storage as empty', () => {
        const storage = memoryStorage();
        const library = new BotLibrary(storage);
        expect(library.list()).toEqual([]);
        storage.setItem(LIBRARY_KEY, '{not json');
        expect(library.list()).toEqual([]);
    });

    it('reports a missing storage instead of throwing', () => {
        const library = new BotLibrary(null);
        expect(library.list()).toEqual([]);
        const result = library.save(makeInput());
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/local storage/i);
    });

    it('saves a new bot as version 1 and persists it', () => {
        const storage = memoryStorage();
        const library = new BotLibrary(storage);
        const saved = library.save(makeInput('First'));
        expect(saved.ok).toBe(true);
        expect(saved.bot?.version).toBe(1);
        expect(saved.bot?.history).toEqual([]);
        expect(new BotLibrary(storage).list().map(bot => bot.name)).toEqual(['First']);
    });

    it('saving an existing id adds a version and keeps the old one in history', () => {
        const library = new BotLibrary(memoryStorage());
        const first = library.save(makeInput('First')).bot!;
        const second = library.save({ ...makeInput('First v2'), id: first.id }).bot!;
        expect(second.id).toBe(first.id);
        expect(second.version).toBe(2);
        expect(second.history.map(entry => entry.version)).toEqual([1]);
        expect(library.list()).toHaveLength(1);
    });

    it('caps the version history', () => {
        const library = new BotLibrary(memoryStorage());
        const first = library.save(makeInput()).bot!;
        for (let i = 0; i < MAX_VERSIONS + 5; i += 1) library.save({ ...makeInput(), id: first.id });
        expect(library.get(first.id)!.history.length).toBe(MAX_VERSIONS);
    });

    it('renames with trimming and refuses an empty or unknown name', () => {
        const library = new BotLibrary(memoryStorage());
        const bot = library.save(makeInput('Old')).bot!;
        expect(library.rename(bot.id, '  New name  ').ok).toBe(true);
        expect(library.get(bot.id)!.name).toBe('New name');
        expect(library.rename(bot.id, '   ').ok).toBe(false);
        expect(library.get(bot.id)!.name).toBe('New name');
        expect(library.rename('missing', 'x').ok).toBe(false);
    });

    it('duplicates as an independent copy at version 1', () => {
        const library = new BotLibrary(memoryStorage());
        const bot = library.save(makeInput('Original')).bot!;
        const copy = library.duplicate(bot.id).bot!;
        expect(copy.id).not.toBe(bot.id);
        expect(copy.name).toBe('Original (copy)');
        expect(copy.version).toBe(1);
        expect(copy.xml).toBe(bot.xml);
        expect(library.list()).toHaveLength(2);
    });

    it('restores an earlier version as a new latest version without losing history', () => {
        const library = new BotLibrary(memoryStorage());
        const first = library.save(makeInput()).bot!;
        const v2 = library.save({ ...makeInput(), id: first.id, xml: '<xml>changed</xml>' }).bot!;
        expect(v2.xml).toBe('<xml>changed</xml>');
        const restored = library.restore(first.id, 1).bot!;
        expect(restored.xml).toBe(first.xml);
        expect(restored.version).toBe(3);
        expect(restored.history.map(entry => entry.version)).toEqual([2, 1]);
        expect(library.restore(first.id, 99).ok).toBe(false);
    });

    it('removes a bot', () => {
        const library = new BotLibrary(memoryStorage());
        const a = library.save(makeInput('A')).bot!;
        library.save(makeInput('B'));
        expect(library.remove(a.id).ok).toBe(true);
        expect(library.list().map(bot => bot.name)).toEqual(['B']);
    });

    it('exports the exact XML that was saved', () => {
        const library = new BotLibrary(memoryStorage());
        const input = makeInput();
        const bot = library.save(input).bot!;
        expect(library.get(bot.id)!.xml).toBe(input.xml);
        expect(inspectImportedXml(library.get(bot.id)!.xml, registry).ok).toBe(true);
    });
});

describe('inspectImportedXml', () => {
    it('accepts XML made of registered blocks', () => {
        const { xml } = makeInput();
        const report = inspectImportedXml(xml, registry);
        expect(report.errors).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.canTrade).toBe(true);
    });

    it('rejects text that is not XML', () => {
        expect(inspectImportedXml('hello', registry).ok).toBe(false);
    });

    it('rejects an unknown block type by name', () => {
        const report = inspectImportedXml('<xml><block type="made_up_block"></block></xml>', registry);
        expect(report.ok).toBe(false);
        expect(report.unsupportedTypes).toEqual(['made_up_block']);
    });

    it('rejects a file with no blocks', () => {
        expect(inspectImportedXml('<xml></xml>', registry).ok).toBe(false);
    });
});
