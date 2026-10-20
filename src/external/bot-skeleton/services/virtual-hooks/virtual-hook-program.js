/**
 * Reads the Virtual Hook language off the Blockly workspace.
 *
 * The runtime must not depend on Blockly (it also runs in tests and keeps executing while the
 * canvas is closed), so this module flattens the hook blocks and their statement chains into
 * plain nodes once per run. Nothing here evaluates code: it only describes the canvas.
 *
 * Validation runs at the same time, because every definition is needed before the first tick:
 * - a hook name is required and must be unique;
 * - the event must be one the runtime raises;
 * - a listener must point at a registered hook;
 * - a listener may not hold a purchase (hooks never buy on their own) or a block the runtime
 *   cannot execute.
 */
import { VIRTUAL_HOOK_EVENTS } from './virtual-hook-types';
import { STATEMENT_TYPES, VALUE_TYPES } from './virtual-hook-executor';

/** Blocks that must never run inside a hook listener. */
export const FORBIDDEN_IN_LISTENER = new Set(['purchase', 'sell_at_market']);

/** Observer blocks are handed back to the observer runtime, which already evaluates them. */
const isObserverBlock = type => typeof type === 'string' && type.startsWith('obs_');

const fieldsOf = block => {
    const fields = {};
    (block.inputList ?? []).forEach(input => {
        (input.fieldRow ?? []).forEach(field => {
            if (field.name) fields[field.name] = block.getFieldValue(field.name);
        });
    });
    return fields;
};

const inputsOf = block => {
    const inputs = {};
    (block.inputList ?? []).forEach(input => {
        if (!input.name) return;
        const target = block.getInputTargetBlock?.(input.name);
        if (target) inputs[input.name] = target.id;
    });
    return inputs;
};

const nodeOf = block => ({
    id: block.id,
    type: block.type,
    fields: fieldsOf(block),
    inputs: inputsOf(block),
    next: block.getNextBlock?.()?.id ?? null,
});

export const normaliseHookName = value => String(value ?? '').trim();

/** Turn the fields of a `vhook_condition` block into the runtime's condition config. */
export const conditionOfBlock = node => {
    if (!node || node.type !== 'vhook_condition') return null;
    const fields = node.fields ?? {};
    const digits = parseDigitList(fields.SET);
    const sequence = parseDigitList(fields.SEQUENCE);
    return {
        type: fields.CONDITION ?? 'last_digit_equals',
        digit: fields.DIGIT === undefined || fields.DIGIT === 'any' ? undefined : Number(fields.DIGIT),
        digits,
        count: Number(fields.COUNT) || 2,
        sequence,
        threshold: fields.THRESHOLD === undefined ? undefined : Number(fields.THRESHOLD),
        sample: Number(fields.SAMPLE) || 100,
    };
};

export const parseDigitList = value =>
    String(value ?? '')
        .split(/[^0-9]+/)
        .filter(part => part.length === 1)
        .map(Number);

/** Collect the ids reachable from a statement chain (statements and their value inputs). */
const collectChain = (startId, blocks, seen = new Set()) => {
    const ids = [];
    let id = startId;
    while (id && !seen.has(id)) {
        const node = blocks.get(id);
        if (!node) break;
        seen.add(id);
        ids.push(id);
        Object.values(node.inputs).forEach(inputId => {
            if (inputId) ids.push(...collectChainOfInput(inputId, blocks, seen));
        });
        id = node.next;
    }
    return ids;
};

const collectChainOfInput = (inputId, blocks, seen) => {
    const ids = [];
    const node = blocks.get(inputId);
    if (!node || seen.has(inputId)) return ids;
    seen.add(inputId);
    ids.push(inputId);
    Object.values(node.inputs).forEach(childId => {
        if (childId) ids.push(...collectChainOfInput(childId, blocks, seen));
    });
    return ids;
};

/**
 * @param {object} workspace a Blockly workspace
 * @returns {import('./virtual-hook-types').VirtualHookProgram}
 */
export const readHookProgram = workspace => {
    const errors = [];
    const warnings = [];
    const definitions = [];
    const listeners = [];
    const blocks = new Map();

    const all = workspace?.getAllBlocks ? workspace.getAllBlocks(false) : [];
    const nodes = all.map(nodeOf);
    nodes.forEach(node => blocks.set(node.id, node));

    const hookBlocks = nodes.filter(node => typeof node.type === 'string' && node.type.startsWith('vhook_'));
    if (!hookBlocks.length) {
        return { definitions, listeners, blocks, errors, warnings, has_hook_blocks: false };
    }

    const supported_events = new Set(VIRTUAL_HOOK_EVENTS.map(event => event.value));
    const names = new Set();

    // Registration order on the canvas is the documented listener order for one hook.
    hookBlocks
        .filter(node => node.type === 'vhook_register')
        .forEach(node => {
            const name = normaliseHookName(node.fields.NAME);
            if (!name) {
                errors.push('A Register Virtual Hook block has no hook name; give it a unique name before running.');
                return;
            }
            if (!/^[A-Za-z0-9 _-]{1,40}$/.test(name)) {
                errors.push(
                    `Hook "${name}" has an invalid name; use up to 40 letters, digits, spaces, "-" or "_", and register it again.`
                );
                return;
            }
            if (names.has(name)) {
                errors.push(
                    `Hook "${name}" is registered more than once; the second registration is ignored so its events cannot run twice.`
                );
                return;
            }
            const event = node.fields.EVENT ?? 'tick';
            if (!supported_events.has(event)) {
                errors.push(`Hook "${name}" listens for unsupported event "${event}"; pick one of the listed events.`);
                return;
            }
            const conditionId = node.inputs.CONDITION ?? null;
            let condition = null;
            if (conditionId) {
                const conditionNode = blocks.get(conditionId);
                condition = conditionOfBlock(conditionNode);
                if (!condition) {
                    errors.push(
                        `Hook "${name}" has something other than a Virtual Hook Condition connected; only that block can configure a hook condition.`
                    );
                }
            }
            names.add(name);
            definitions.push({
                id: node.id,
                name,
                event,
                market: String(node.fields.MARKET ?? '').trim().toUpperCase(),
                enabled: String(node.fields.ENABLED ?? 'TRUE').toUpperCase() !== 'FALSE',
                priority: Number(node.fields.PRIORITY) || 10,
                concurrency: ['sequential', 'skip', 'queue'].includes(node.fields.CONCURRENCY)
                    ? node.fields.CONCURRENCY
                    : 'sequential',
                condition,
            });
        });

    const known = new Set(definitions.map(definition => definition.name));
    const seen_listeners = new Set();

    hookBlocks
        .filter(node => node.type === 'vhook_listener')
        .forEach((node, order) => {
            const name = normaliseHookName(node.fields.HOOK);
            if (!name) {
                errors.push('A "When Virtual Hook fires" block has no hook name; set it to a registered hook.');
                return;
            }
            if (!known.has(name)) {
                errors.push(
                    `Listener for hook "${name}" has no registration; add "Register Virtual Hook ${name}" or correct the listener's name.`
                );
                return;
            }
            if (seen_listeners.has(node.id)) return;
            seen_listeners.add(node.id);

            const body = node.inputs.DO ?? null;
            const chain = body ? collectChain(body, blocks) : [];
            chain.forEach(id => {
                const child = blocks.get(id);
                if (!child) return;
                if (FORBIDDEN_IN_LISTENER.has(child.type)) {
                    errors.push(
                        `Hook "${name}" contains a Purchase block; virtual hooks never buy on their own. Gate the Purchase block in Purchase conditions with a Virtual Hook Condition instead.`
                    );
                } else if (
                    !STATEMENT_TYPES.has(child.type) &&
                    !VALUE_TYPES.has(child.type) &&
                    !isObserverBlock(child.type)
                ) {
                    errors.push(
                        `Hook "${name}" uses "${child.type}", which the virtual hook runtime cannot execute; remove it or move that logic into the main strategy.`
                    );
                }
            });
            if (!body) warnings.push(`Hook "${name}" has a listener with no blocks attached; it will run nothing.`);

            listeners.push({ id: node.id, hook: name, body, order });
        });

    return { definitions, listeners, blocks, errors, warnings, has_hook_blocks: true };
};

export const chainLength = (startId, blocks) => (startId ? collectChain(startId, blocks, new Set()).length : 0);
