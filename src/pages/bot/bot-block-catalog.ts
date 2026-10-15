/**
 * Everything the Bot tab needs to know about the blocks it can put on the canvas.
 *
 * The palette structure is read from the Bot Builder toolbox itself (`ToolboxItems()`), so the tab
 * lists exactly the blocks the palette holds — the trading categories, the Digits blocks and the
 * four observer ("bot blocks") groups — and can never drift from it. Names and the choices inside
 * the option menus come from the registered Blockly definitions, so the tab shows the same labels
 * and the same dropdown choices the canvas does.
 */
import { BLOCKS as OBSERVER_BLOCKS } from '@/external/bot-skeleton/scratch/blocks/Observer/observer-catalog';
import { ToolboxItems } from '@/pages/bot-builder/toolbox/toolbox-items';

export type TBotBlockOption = { label: string; value: string };

export type TBotBlockField = {
    name: string;
    label: string;
    kind: 'select' | 'number' | 'text';
    options?: TBotBlockOption[];
    value: string;
};

export type TBotBlockFields = {
    fields: TBotBlockField[];
    /** A dropdown whose choices only exist on the canvas (live market data) — it is set there. */
    has_live_fields: boolean;
};

export type TBotCatalogGroup = {
    name: string;
    blocks: { type: string; label: string }[];
};

const blockly = (): any => (window as any).Blockly;

const OBSERVER_BY_TYPE = new Map<string, any>(OBSERVER_BLOCKS.map((spec: any) => [spec.type, spec]));

/** The least we can show for a field we have no name for: its own identifier, made readable. */
const humanise = (value: string): string =>
    value
        .toLowerCase()
        .replace(/_?list$/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/^./, character => character.toUpperCase());

/* ------------------------------------------------------------- palette structure */

let toolbox_document: Document | null | undefined;
let template_cache: Map<string, Element> | null = null;
let group_cache: TBotCatalogGroup[] | null = null;
const field_cache = new Map<string, TBotBlockFields>();

const parseToolbox = (): Document | null => {
    if (toolbox_document !== undefined) return toolbox_document;
    try {
        const parsed = new DOMParser().parseFromString(ToolboxItems(), 'text/xml');
        toolbox_document = parsed.querySelector('parsererror') ? null : parsed;
    } catch {
        toolbox_document = null;
    }
    return toolbox_document;
};

/** The palette's own template for a block: its default fields, sockets and mutations. */
const getTemplates = (): Map<string, Element> => {
    if (template_cache) return template_cache;
    const templates = new Map<string, Element>();
    const document_ = parseToolbox();
    if (document_) {
        Array.from(document_.getElementsByTagName('block')).forEach(element => {
            const type = element.getAttribute('type');
            if (type && !templates.has(type)) templates.set(type, element);
        });
    }
    template_cache = templates;
    return templates;
};

export const getBlockTemplate = (type: string): Element | null => {
    const template = getTemplates().get(type);
    return template ? (template.cloneNode(true) as Element) : null;
};

export const getBlockLabel = (type: string): string => {
    const observer = OBSERVER_BY_TYPE.get(type);
    if (observer?.label) return observer.label;

    const definition = blockly()?.Blocks?.[type];
    try {
        if (definition && typeof definition.meta === 'function') {
            const meta = definition.meta();
            if (meta?.display_name) return meta.display_name;
        }
    } catch {
        /* a block whose meta cannot be read still shows up, under its own name */
    }
    return humanise(type);
};

/** The palette as the Bot tab's block menu: one entry per category that holds blocks. */
export const getCatalogGroups = (): TBotCatalogGroup[] => {
    if (group_cache) return group_cache;

    const groups: TBotCatalogGroup[] = [];
    const document_ = parseToolbox();
    const seen = new Set<string>();

    const walk = (parent: Element) => {
        Array.from(parent.children).forEach(child => {
            if (child.tagName.toLowerCase() !== 'category') return;

            const types: string[] = [];
            // Every block the category holds, the ones nested inside a template (the Trade
            // parameters chain — market, trade type, duration) included, each offered once.
            Array.from(child.querySelectorAll('block')).forEach(entry => {
                const type = entry.getAttribute('type');
                if (type && !seen.has(type)) {
                    seen.add(type);
                    types.push(type);
                }
            });

            if (types.length) {
                groups.push({
                    name: child.getAttribute('name') || child.getAttribute('id') || '',
                    blocks: types.map(type => ({ type, label: getBlockLabel(type) })),
                });
            }
            walk(child);
        });
    };

    if (document_) walk(document_.documentElement);
    group_cache = groups;
    return groups;
};

/* ------------------------------------------------------------- option menus */

export const getBlockFields = (type: string): TBotBlockFields => {
    if (!type) return { fields: [], has_live_fields: false };
    const cached = field_cache.get(type);
    if (cached) return cached;

    const fields = OBSERVER_BY_TYPE.has(type) ? observerFields(type) : canvasFields(type);
    field_cache.set(type, fields);
    return fields;
};

/** Observer blocks carry their fields as data, so their menus need no canvas at all. */
const observerFields = (type: string): TBotBlockFields => {
    const spec = OBSERVER_BY_TYPE.get(type);
    const fields: TBotBlockField[] = (spec?.fields ?? []).map((field: any) => {
        if (field.kind === 'select') {
            // The palette builds these dropdowns as [choice, choice], so the label is the value.
            const options = (field.choices ?? []).map((choice: string) => ({
                label: String(choice),
                value: String(choice),
            }));
            return {
                name: field.name,
                label: field.label,
                kind: 'select' as const,
                options,
                value: String(field.value ?? options[0]?.value ?? ''),
            };
        }
        return {
            name: field.name,
            label: field.label,
            kind: field.kind === 'number' ? ('number' as const) : ('text' as const),
            value: String(field.value ?? ''),
        };
    });
    return { fields, has_live_fields: false };
};

const isLabelField = (field: any): boolean =>
    typeof blockly()?.FieldLabel === 'function' && field instanceof blockly().FieldLabel;

const fieldText = (field: any): string => {
    try {
        if (typeof field.getText === 'function') return String(field.getText() ?? '');
        if (typeof field.getText_ === 'function') return String(field.getText_() ?? '');
    } catch {
        /* a field that cannot render its own text adds nothing to the label */
    }
    return '';
};

const isDropdown = (field: any): boolean =>
    Array.isArray(field.menuGenerator_) || typeof field.getOptions === 'function';

/** The choices of a dropdown field, or null when it has none yet (they arrive live on the canvas). */
const readOptions = (field: any): TBotBlockOption[] | null => {
    let raw: any = null;
    try {
        if (typeof field.getOptions === 'function') raw = field.getOptions(false);
    } catch {
        raw = null;
    }
    if (!Array.isArray(raw) && Array.isArray(field.menuGenerator_)) raw = field.menuGenerator_;
    if (!Array.isArray(raw)) return null;

    const options = raw
        .map(entry => {
            if (Array.isArray(entry)) return { label: String(entry[0] ?? ''), value: String(entry[1] ?? entry[0] ?? '') };
            return { label: String(entry?.text ?? entry?.label ?? ''), value: String(entry?.value ?? '') };
        })
        .filter(option => option.label !== '' && option.value !== '');

    // One choice is no choice: those dropdowns are filled in from live market data on the canvas.
    return options.length > 1 ? options : null;
};

/**
 * The fields of an ordinary palette block, read off a throwaway headless workspace so the menus
 * show exactly what the block offers. A block whose definition cannot be instantiated simply
 * brings no options from here and is finished on the canvas instead.
 */
const canvasFields = (type: string): TBotBlockFields => {
    const definition = blockly()?.Blocks?.[type];
    if (!definition || typeof definition.init !== 'function' || typeof blockly()?.Workspace !== 'function') {
        return { fields: [], has_live_fields: false };
    }

    let workspace: any;
    try {
        workspace = new (blockly().Workspace)();
        const block = workspace.newBlock(type);
        const fields: TBotBlockField[] = [];
        let has_live_fields = false;

        (block.inputList ?? []).forEach((input: any) => {
            let label = '';
            (input.fieldRow ?? []).forEach((field: any) => {
                const text = fieldText(field);
                if (isLabelField(field)) {
                    label = text;
                    return;
                }
                if (!field.name) return;

                if (isDropdown(field)) {
                    const options = readOptions(field);
                    if (!options) {
                        has_live_fields = true;
                        label = '';
                        return;
                    }
                    fields.push({
                        name: field.name,
                        label: label || humanise(field.name),
                        kind: 'select',
                        options,
                        value: String(field.getValue?.() ?? options[0].value),
                    });
                } else {
                    const is_number =
                        typeof blockly()?.FieldNumber === 'function' && field instanceof blockly().FieldNumber;
                    fields.push({
                        name: field.name,
                        label: label || humanise(field.name),
                        kind: is_number ? 'number' : 'text',
                        value: String(field.getValue?.() ?? ''),
                    });
                }
                label = '';
            });
        });

        block.dispose(false);
        return { fields, has_live_fields };
    } catch {
        return { fields: [], has_live_fields: false };
    } finally {
        try {
            workspace?.dispose();
        } catch {
            /* a workspace that refuses to dispose must not break the tab */
        }
    }
};
