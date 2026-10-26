/**
 * The Bot Builder's Blocks menu, read as data.
 *
 * The Architect places blocks, so before it picks one it has to know what the Blocks menu really
 * offers. `ToolboxItems()` renders that palette to static markup — the same value the Bot Builder's
 * toolbox mounts — so parsing it gives the menu itself (every category, every nested category and
 * every block the user can drag from), never a list kept beside it that could drift.
 *
 * The index is used for two things:
 *
 *  - `menuBlocksNamedIn(text)` finds the menu blocks a prompt names ("use the Switch active market
 *    block"), so the Architect uses the block the user asked for instead of a block of its own
 *    choosing — and reports the ones it cannot place rather than ignoring them;
 *  - `blocksMenu()` gives every block the menu offers, with the name and the category it is shown
 *    under, which is how each named block is answered and reported.
 *
 * The name a block is matched and reported by is the name the menu shows: the capability registry's
 * display name, or the observer catalogue's label.
 */

import { BLOCKS as OBSERVER_BLOCKS } from '@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog';
import { ToolboxItems } from '@/pages/bot-builder/toolbox/toolbox-items';
import { CAPABILITY_CATALOG, CATEGORY_LABELS } from './registry';
import type { MenuBlock } from './types';

/** The name each block is known by in the menu. */
const MENU_LABELS = new Map<string, string>();
CAPABILITY_CATALOG.forEach(entry => MENU_LABELS.set(entry.type, entry.displayName));
(OBSERVER_BLOCKS as { type: string; label: string }[]).forEach(spec => {
    if (!MENU_LABELS.has(spec.type)) MENU_LABELS.set(spec.type, spec.label);
});

const menuLabel = (type: string): string =>
    MENU_LABELS.get(type) ??
    // A palette block the registry does not describe is still in the menu; name it by its own type.
    type.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

/**
 * The palette markup as the Blocks menu. A block the menu shows more than once — nested as an
 * example inside another block, for instance — is listed once, under the first category that shows
 * it. A block inside one of the four observer groups keeps the group it is browsed under.
 */
export function parseBlocksMenu(markup: string): MenuBlock[] {
    if (typeof DOMParser === 'undefined') return [];

    const document_ = new DOMParser().parseFromString(markup, 'text/xml');
    const root = document_.documentElement;
    if (!root || root.getElementsByTagName('parsererror').length) return [];

    const menu: MenuBlock[] = [];
    const seen = new Set<string>();

    const collect = (element: Element, group: string | null, category: string) => {
        const blocks = element.getElementsByTagName('block');
        for (let index = 0; index < blocks.length; index += 1) {
            const type = blocks[index].getAttribute('type');
            if (!type || seen.has(type)) continue;
            seen.add(type);
            menu.push({ type, label: menuLabel(type), category, group });
        }
    };

    const subcategories = (element: Element) => Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'category');

    for (const child of Array.from(root.children)) {
        if (child.tagName.toLowerCase() !== 'category') continue;
        const name = child.getAttribute('name') ?? '';
        // The four observer groups carry the group id; their nested categories are the menu sections.
        const group = (child.getAttribute('id') ?? '').startsWith('observer_') ? name : null;
        for (const nested of subcategories(child)) {
            collect(nested, group, nested.getAttribute('name') ?? name);
        }
        collect(child, group, name);
    }

    return menu;
}

/** The palette the Bot Builder mounts, read into the menu; the registry's view of it if that fails. */
function readPalette(): MenuBlock[] {
    try {
        const menu = parseBlocksMenu(ToolboxItems());
        return menu.length ? menu : catalogFallback();
    } catch {
        return catalogFallback();
    }
}

/** The registry's own view of the palette, used only when the menu markup cannot be read. */
function catalogFallback(): MenuBlock[] {
    return CAPABILITY_CATALOG.map(entry => ({
        type: entry.type,
        label: entry.displayName,
        category: CATEGORY_LABELS[entry.category] ?? entry.category,
        group: entry.category.startsWith('observer_') ? (CATEGORY_LABELS[entry.category] ?? entry.category) : null,
    }));
}

let cached: MenuBlock[] | null = null;

/** Every block the Blocks menu offers, read once per session. */
export function blocksMenu(): MenuBlock[] {
    cached = cached ?? readPalette();
    return cached;
}

// ── Reading a prompt for the blocks it names ────────────────────────────────────────────────────

/** Lower-case, punctuation-free text, so a menu name can be matched whatever the wording around it. */
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

/**
 * The names a menu block answers to: the label the menu shows, and its own type read as words
 * ("switch_active_market" -> "switch active market"). A one-word name shorter than ten characters
 * ("If", "Text", "Number") is too generic to be a request for that block, so it is not matched.
 */
function namesOf(block: MenuBlock): string[] {
    const names = [normalize(block.label), normalize(block.type)];
    return names.filter(name => name && (name.includes(' ') || name.length >= 10));
}

/** Every menu block the text names, in menu order. */
export function menuBlocksNamedIn(text: string): MenuBlock[] {
    const haystack = ` ${normalize(text)} `;
    return blocksMenu().filter(block => namesOf(block).some(name => haystack.includes(` ${name} `)));
}

/** The one menu block a single clause names, preferring the most specific (longest) name. */
export function menuBlockNamedIn(clause: string): MenuBlock | null {
    const named = menuBlocksNamedIn(clause);
    if (!named.length) return null;
    return [...named].sort((a, b) => normalize(b.label).length - normalize(a.label).length)[0];
}
