/**
 * Executes a Virtual Hook listener chain.
 *
 * The chain is walked as plain canvas data with a hard step budget — no `eval`, no generated
 * JavaScript, the same approach the observer runtime already uses. Only the blocks listed here
 * are executable inside a listener; `virtual-hook-program.js` refuses a workspace that carries
 * anything else, so an unsupported block is named before the run instead of failing silently.
 *
 * A listener can read and write variables, branch, write journal lines and trigger other hooks.
 * It cannot buy: the purchase blocks are rejected at validation time and the runtime has no
 * purchase call at all.
 */
import { evaluateVirtualHookCondition } from './virtual-hook-conditions';

export const MAX_SEQUENCE_STEPS = 100;
export const MAX_VALUE_DEPTH = 20;
export const MAX_REPEAT = 20;

export const VALUE_TYPES = new Set([
    'logic_boolean',
    'logic_compare',
    'logic_operation',
    'logic_negate',
    'logic_null',
    'math_number',
    'math_arithmetic',
    'math_single',
    'math_round',
    'math_modulo',
    'text',
    'text_join',
    'variables_get',
    'vhook_condition',
    'vhook_result',
]);

export const STATEMENT_TYPES = new Set([
    'controls_if',
    'controls_repeat_ext',
    'variables_set',
    'math_change',
    'text_print',
    'notify',
    'timeout',
    'vhook_trigger',
]);

const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

const truthy = value => Boolean(value);

/**
 * @param {string} startId first block of the listener body
 * @param {object} tools runtime services, see virtual-hook-manager.js
 */
export const runHookSequence = async (startId, tools) => {
    const budget = { steps: 0, values: 0 };
    return walkSequence(startId, tools, budget);
};

const walkSequence = async (startId, tools, budget) => {
    let id = startId;
    while (id) {
        if (tools.isCancelled()) return { stopped: 'cancelled', steps: budget.steps };
        if (budget.steps >= MAX_SEQUENCE_STEPS) {
            tools.journal(
                `Hook "${tools.hookName}" stopped at its ${MAX_SEQUENCE_STEPS}-step bound; the listener contains an unbounded loop.`,
                'error'
            );
            return { stopped: 'bounded', steps: budget.steps };
        }
        const node = tools.blocks.get(id);
        if (!node) return { stopped: 'missing', steps: budget.steps };
        budget.steps += 1;

        const flow = await runStatement(node, tools, budget);
        if (flow === 'stop') return { stopped: 'stop', steps: budget.steps };
        id = node.next;
    }
    return { stopped: null, steps: budget.steps };
};

const runStatement = async (node, tools, budget) => {
    tools.onStep(node.type, `Executed ${node.type} (${node.id})`);

    switch (node.type) {
        case 'controls_if': {
            // Blockly numbers its if/else inputs IF0/DO0, IF1/DO1, … .
            for (let index = 0; index < 10; index += 1) {
                const conditionId = node.inputs[`IF${index}`];
                if (!conditionId) break;
                if (truthy(evaluateValue(conditionId, tools, budget))) {
                    return walkSequenceAndContinue(node.inputs[`DO${index}`], tools, budget, node);
                }
            }
            const elseId = node.inputs.ELSE;
            if (elseId) return walkSequenceAndContinue(elseId, tools, budget, node);
            return null;
        }
        case 'controls_repeat_ext': {
            const times = Math.min(MAX_REPEAT, Math.max(0, Math.floor(number(evaluateValue(node.inputs.TIMES, tools, budget)))));
            const body = node.inputs.DO;
            for (let iteration = 0; iteration < times; iteration += 1) {
                const outcome = await walkSequence(body, tools, budget);
                if (outcome.stopped) return 'stop';
            }
            return null;
        }
        case 'variables_set':
            tools.variables.set(node.fields.VAR, evaluateValue(node.inputs.VALUE, tools, budget));
            return null;
        case 'math_change': {
            const name = node.fields.VAR;
            const delta = number(evaluateValue(node.inputs.DELTA, tools, budget));
            tools.variables.set(name, number(tools.variables.get(name)) + delta);
            return null;
        }
        case 'text_print': {
            const value = evaluateValue(node.inputs.TEXT, tools, budget);
            tools.journal(String(value ?? ''));
            return null;
        }
        case 'notify': {
            const value = evaluateValue(node.inputs.MESSAGE, tools, budget);
            tools.journal(String(value ?? ''));
            return null;
        }
        case 'timeout': {
            const inputId = node.inputs.VALUE ?? node.inputs.TIME ?? node.inputs.MS ?? node.inputs.DURATION;
            const ms = Math.max(0, Math.min(5000, number(evaluateValue(inputId, tools, budget))));
            await tools.sleep(ms);
            return tools.isCancelled() ? 'stop' : null;
        }
        case 'vhook_trigger': {
            const name = String(node.fields.NAME ?? '').trim();
            tools.trigger(name);
            return null;
        }
        default:
            if (typeof node.type === 'string' && node.type.startsWith('obs_')) {
                tools.observer?.runStatement?.(node.id);
                return null;
            }
            tools.journal(`Hook "${tools.hookName}": "${node.type}" cannot be executed here.`, 'error');
            return null;
    }
};

const walkSequenceAndContinue = async (startId, tools, budget, node) => {
    const outcome = await walkSequence(startId, tools, budget);
    // A nested stop only ends the containing statement chain, never the whole listener.
    return outcome.stopped === 'stop' || outcome.stopped === 'cancelled' ? 'stop' : null;
};

const evaluateValue = (blockId, tools, budget, depth = 0) => {
    if (!blockId) return null;
    if (depth > MAX_VALUE_DEPTH) return null;
    if (budget.values > MAX_SEQUENCE_STEPS * 4) return null;
    budget.values += 1;
    const node = tools.blocks.get(blockId);
    if (!node) return null;
    const next = id => evaluateValue(id, tools, budget, depth + 1);

    switch (node.type) {
        case 'logic_boolean':
            return String(node.fields.BOOL).toUpperCase() === 'TRUE';
        case 'logic_null':
            return null;
        case 'math_number':
        case 'math_whole_number':
            return Number(node.fields.NUM) || 0;
        case 'text':
            return String(node.fields.TEXT ?? '');
        case 'variables_get':
            return tools.variables.get(node.fields.VAR) ?? 0;
        case 'logic_negate':
            return !truthy(next(node.inputs.BOOL));
        case 'logic_operation': {
            const a = truthy(next(node.inputs.A));
            const b = truthy(next(node.inputs.B));
            return String(node.fields.OP).toUpperCase() === 'AND' ? a && b : a || b;
        }
        case 'logic_compare': {
            const a = next(node.inputs.A);
            const b = next(node.inputs.B);
            switch (String(node.fields.OP).toUpperCase()) {
                case 'EQ':
                    return a === b;
                case 'NEQ':
                    return a !== b;
                case 'LT':
                    return number(a) < number(b);
                case 'LTE':
                    return number(a) <= number(b);
                case 'GT':
                    return number(a) > number(b);
                case 'GTE':
                    return number(a) >= number(b);
                default:
                    return false;
            }
        }
        case 'math_arithmetic': {
            const a = number(next(node.inputs.A));
            const b = number(next(node.inputs.B));
            switch (String(node.fields.OP).toUpperCase()) {
                case 'ADD':
                    return a + b;
                case 'MINUS':
                    return a - b;
                case 'MULTIPLY':
                    return a * b;
                case 'DIVIDE':
                    return b === 0 ? 0 : a / b;
                case 'POWER':
                    return a ** b;
                default:
                    return 0;
            }
        }
        case 'math_single': {
            const a = number(next(node.inputs.NUM));
            return String(node.fields.OP).toUpperCase() === 'ABS' ? Math.abs(a) : Math.sqrt(Math.max(0, a));
        }
        case 'math_round': {
            const a = number(next(node.inputs.NUM));
            const op = String(node.fields.OP).toUpperCase();
            return op === 'ROUNDUP' ? Math.ceil(a) : op === 'ROUNDDOWN' ? Math.floor(a) : Math.round(a);
        }
        case 'math_modulo': {
            const a = number(next(node.inputs.DIVIDEND));
            const b = number(next(node.inputs.DIVISOR));
            return b === 0 ? 0 : a % b;
        }
        case 'text_join': {
            const pieces = [];
            for (let index = 0; index < 10; index += 1) {
                const id = node.inputs[`ADD${index}`];
                if (!id) break;
                pieces.push(String(next(id) ?? ''));
            }
            return pieces.join('');
        }
        case 'vhook_condition':
            return evaluateVirtualHookCondition(tools.conditionConfig(node), tools.context).passed;
        case 'vhook_result':
            return tools.result(node.fields.FIELD);
        default:
            if (typeof node.type === 'string' && node.type.startsWith('obs_')) {
                return tools.observer?.valueOfBlock?.(node.id, null) ?? null;
            }
            tools.journal(`Hook "${tools.hookName}": "${node.type}" has no value in this version.`, 'error');
            return null;
    }
};
