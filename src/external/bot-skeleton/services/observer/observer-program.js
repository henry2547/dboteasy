/**
 * Reads the observer blocks off the live Block Builder canvas.
 *
 * The observer language is evaluated by the runtime straight from the blocks (see
 * `observer-engine.js`), so this module is the only place that talks to Blockly: it turns the
 * workspace into a plain, frozen description — no Blockly objects leak into the engine, which is
 * what makes the evaluation testable and bounded.
 */
import { SPEC } from '../../scratch/blocks/Observer/observer-catalog';

/** A block that is disabled on the canvas is not part of the running program either. */
const isActive = block => (typeof block.isEnabled === 'function' ? block.isEnabled() : !block.disabled);

const connectionTarget = (block, name) => {
    const input = block.inputList?.find(item => item.name === name);
    return input?.connection?.targetBlock?.() ?? null;
};

const readFields = (block, spec) => {
    const fields = {};
    (spec.fields ?? []).forEach(field => {
        const raw = block.getFieldValue?.(field.name);
        fields[field.name] = field.kind === 'number' ? Number(raw) : String(raw ?? '');
    });
    return fields;
};

/**
 * @returns {{ blocks: Map<string, object>, events: Map<string, string[]>, entries: string[], roots: string[], has_entry_gate: boolean }}
 */
export const readProgram = workspace => {
    const blocks = new Map();
    const events = new Map();
    const entries = [];
    const roots = [];
    let gate = false;

    if (!workspace) return { blocks, events, entries, roots, has_entry_gate: gate };

    workspace.getAllBlocks(false).forEach(block => {
        const spec = SPEC.get(block.type);
        if (!spec || block.isShadow?.() || !isActive(block)) return;

        blocks.set(block.id, {
            id: block.id,
            type: block.type,
            op: spec.op,
            label: spec.label,
            event: spec.event ?? null,
            fields: readFields(block, spec),
            inputs: Object.fromEntries(
                Object.keys(spec.inputs ?? {}).map(name => [name, connectionTarget(block, name)?.id]).filter(([, id]) => id)
            ),
            body: connectionTarget(block, 'DO')?.id ?? null,
            else_body: connectionTarget(block, 'ELSE')?.id ?? null,
            next: block.getNextBlock?.()?.id ?? null,
        });

        if (spec.event) events.set(spec.event, [...(events.get(spec.event) ?? []), block.id]);
        if (spec.op === 'entry') entries.push(block.id);
        if (spec.op === 'pattern_emit') gate = true;
    });

    // A free-standing statement is still the program the canvas shows — an entry block, a reset or a
    // limit dragged straight onto the workspace — so the runtime runs it on every genuine tick too.
    workspace.getTopBlocks(false).forEach(block => {
        const spec = SPEC.get(block.type);
        if (!spec || spec.event || spec.output || block.isShadow?.() || !isActive(block)) return;
        roots.push(block.id);
    });

    return { blocks, events, entries, roots, has_entry_gate: gate || entries.length > 0 };
};

/**
 * The market of the workspace's existing trade setup, so an observer starts on the market the bot
 * actually trades. Empty string when the canvas holds no trade parameters yet.
 */
export const readTradeSetupSymbol = workspace => {
    const trade_definition = workspace?.getAllBlocks?.(false).find(block => block.type === 'trade_definition');
    return trade_definition?.getChildByType?.('trade_definition_market')?.getFieldValue?.('SYMBOL_LIST') ?? '';
};
