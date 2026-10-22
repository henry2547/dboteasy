/**
 * The saved AI bot library.
 *
 * Bots live in this browser's localStorage under one key. The app has no backend and no database,
 * so there is nothing shared to leak: a bot is only ever readable by the browser profile that saved
 * it. Each save keeps a version history so an earlier version can be restored, and XML that is
 * imported is re-checked against the registry before it is accepted, never trusted because it
 * parsed.
 */

import { buildRegistry, type Registry } from './registry';
import type { ExecutionMode, SavedBot, SavedBotVersion, StrategySpec, ValidationReport } from './types';

export const LIBRARY_KEY = 'ai_architect_library';
export const MAX_SAVED_BOTS = 50;
export const MAX_VERSIONS = 10;

interface Storage_ {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

const defaultStorage = (): Storage_ | null => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
};

const newId = (): string => `aab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function validationLabel(report: ValidationReport): SavedBot['validation'] {
    if (!report.ok) return 'invalid';
    return report.warnings.length ? 'warnings' : 'valid';
}

export class BotLibrary {
    constructor(private readonly storage: Storage_ | null = defaultStorage()) {}

    list(): SavedBot[] {
        if (!this.storage) return [];
        try {
            const parsed = JSON.parse(this.storage.getItem(LIBRARY_KEY) ?? '[]') as unknown;
            if (!Array.isArray(parsed)) return [];
            return (parsed as SavedBot[])
                .filter(bot => bot && typeof bot.id === 'string' && typeof bot.xml === 'string' && bot.spec)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        } catch {
            // A corrupt value is treated as an empty library rather than crashing the page.
            return [];
        }
    }

    get(id: string): SavedBot | undefined {
        return this.list().find(bot => bot.id === id);
    }

    private write(bots: SavedBot[]): { ok: boolean; error?: string } {
        if (!this.storage) return { ok: false, error: 'This browser has no local storage, so the library cannot be saved.' };
        try {
            this.storage.setItem(LIBRARY_KEY, JSON.stringify(bots.slice(0, MAX_SAVED_BOTS)));
            return { ok: true };
        } catch (error) {
            return { ok: false, error: `The library could not be saved: ${(error as Error).message}` };
        }
    }

    /** Saves a new bot, or a new version of `id` when it already exists. */
    save(input: {
        id?: string;
        name: string;
        prompt: string;
        spec: StrategySpec;
        xml: string;
        validation: ValidationReport;
        blockTypes: string[];
    }): { ok: boolean; bot?: SavedBot; error?: string } {
        const bots = this.list();
        const now = new Date().toISOString();
        const existing = input.id ? bots.find(bot => bot.id === input.id) : undefined;

        let bot: SavedBot;
        if (existing) {
            const snapshot: SavedBotVersion = { version: existing.version, savedAt: existing.updatedAt, prompt: existing.prompt, spec: existing.spec, xml: existing.xml };
            bot = {
                ...existing,
                name: input.name,
                prompt: input.prompt,
                spec: input.spec,
                xml: input.xml,
                version: existing.version + 1,
                updatedAt: now,
                blockTypes: input.blockTypes,
                validation: validationLabel(input.validation),
                mode: input.spec.mode,
                risk: input.spec.risk,
                history: [snapshot, ...existing.history].slice(0, MAX_VERSIONS),
            };
        } else {
            bot = {
                id: newId(),
                name: input.name,
                prompt: input.prompt,
                spec: input.spec,
                xml: input.xml,
                version: 1,
                createdAt: now,
                updatedAt: now,
                blockTypes: input.blockTypes,
                validation: validationLabel(input.validation),
                mode: input.spec.mode as ExecutionMode,
                risk: input.spec.risk,
                history: [],
            };
        }

        const result = this.write([bot, ...bots.filter(candidate => candidate.id !== bot.id)]);
        return result.ok ? { ok: true, bot } : { ok: false, error: result.error };
    }

    rename(id: string, name: string): { ok: boolean; error?: string } {
        const trimmed = name.trim();
        if (!trimmed) return { ok: false, error: 'A bot needs a name.' };
        const bots = this.list();
        const target = bots.find(bot => bot.id === id);
        if (!target) return { ok: false, error: 'That bot is no longer in the library.' };
        return this.write(bots.map(bot => (bot.id === id ? { ...bot, name: trimmed, updatedAt: new Date().toISOString() } : bot)));
    }

    duplicate(id: string): { ok: boolean; bot?: SavedBot; error?: string } {
        const bots = this.list();
        const source = bots.find(bot => bot.id === id);
        if (!source) return { ok: false, error: 'That bot is no longer in the library.' };
        const now = new Date().toISOString();
        const copy: SavedBot = { ...source, id: newId(), name: `${source.name} (copy)`, version: 1, createdAt: now, updatedAt: now, history: [] };
        const result = this.write([copy, ...bots]);
        return result.ok ? { ok: true, bot: copy } : { ok: false, error: result.error };
    }

    remove(id: string): { ok: boolean; error?: string } {
        return this.write(this.list().filter(bot => bot.id !== id));
    }

    /** Restores an earlier version as a NEW latest version, so no history is lost. */
    restore(id: string, version: number): { ok: boolean; bot?: SavedBot; error?: string } {
        const bots = this.list();
        const target = bots.find(bot => bot.id === id);
        const old = target?.history.find(entry => entry.version === version);
        if (!target || !old) return { ok: false, error: 'That version is not available.' };
        const snapshot: SavedBotVersion = { version: target.version, savedAt: target.updatedAt, prompt: target.prompt, spec: target.spec, xml: target.xml };
        const restored: SavedBot = {
            ...target,
            prompt: old.prompt,
            spec: old.spec,
            xml: old.xml,
            mode: old.spec.mode,
            risk: old.spec.risk,
            version: target.version + 1,
            updatedAt: new Date().toISOString(),
            history: [snapshot, ...target.history].slice(0, MAX_VERSIONS),
        };
        const result = this.write([restored, ...bots.filter(bot => bot.id !== id)]);
        return result.ok ? { ok: true, bot: restored } : { ok: false, error: result.error };
    }
}

// ── Importing workspace XML ─────────────────────────────────────────────────────────────────────

export interface XmlInspection {
    ok: boolean;
    errors: string[];
    blockTypes: string[];
    unsupportedTypes: string[];
    blockCount: number;
    /** Block types in the file that look like a trade (Purchase). Shown to the user before loading. */
    canTrade: boolean;
}

/** Reads imported XML and checks every block type against the registry's source of truth. */
export function inspectImportedXml(xml: string, registry: Registry = buildRegistry(), isRegistered?: (type: string) => boolean): XmlInspection {
    const errors: string[] = [];
    let doc: Document;
    try {
        doc = new DOMParser().parseFromString(xml, 'application/xml');
    } catch (error) {
        return { ok: false, errors: [`The file could not be read: ${(error as Error).message}`], blockTypes: [], unsupportedTypes: [], blockCount: 0, canTrade: false };
    }
    if (doc.getElementsByTagName('parsererror').length) {
        return { ok: false, errors: ['The file is not valid XML.'], blockTypes: [], unsupportedTypes: [], blockCount: 0, canTrade: false };
    }
    if (doc.documentElement.tagName.toLowerCase() !== 'xml') errors.push('The file is not Blockly workspace XML (expected an <xml> root).');

    const elements = [...doc.querySelectorAll('block, shadow')];
    const blockTypes = [...new Set(elements.map(element => element.getAttribute('type') ?? '').filter(Boolean))];
    if (!elements.length) errors.push('The file contains no blocks.');

    const known = (type: string) => (isRegistered ? isRegistered(type) : registry.probe.isRegistered(type));
    const unsupportedTypes = blockTypes.filter(type => !known(type));
    if (unsupportedTypes.length) errors.push(`Unknown block type(s): ${unsupportedTypes.join(', ')}.`);

    return {
        ok: errors.length === 0,
        errors,
        blockTypes,
        unsupportedTypes,
        blockCount: elements.length,
        canTrade: blockTypes.includes('purchase'),
    };
}

export const botLibrary = new BotLibrary();
