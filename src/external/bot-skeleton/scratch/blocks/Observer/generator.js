/**
 * JavaScript generators for the observer blocks.
 *
 * These generators do not re-implement the observation language — `services/observer/` owns it and
 * reads the blocks off the canvas. They generate the call that hands a block back to that runtime,
 * so a block placed inside the ordinary generated program is evaluated where the program reaches
 * it instead of being ignored:
 *
 * - a value block (condition, number, string or digit list) generates an expression the interpreter
 *   evaluates — `Bot.observerCondition(id)` / `Bot.observerValue(id, fallback)`;
 * - a statement block generates `Bot.observerStatement(id)`, which runs it (and the sequence it
 *   holds) through the runtime;
 * - an event block ("When …") and any block inside a canvas-driven observer program keep a comment:
 *   the runtime dispatches those on the genuine tick stream, so generating them here would run them
 *   twice.
 *
 * Without a generator for a block type `Run` failed with
 * `JavaScript generator does not know how to generate code for block type "obs_…"`.
 */
import { BLOCKS, SPEC } from './observer-catalog';

/** What a value block gives back before it has genuine data behind it. */
const NEUTRAL_VALUE = {
    Number: '0',
    String: "''",
    Digits: '[]',
};

const generator = window.Blockly.JavaScript.javascriptGenerator;

const literal = value => JSON.stringify(String(value));

/** A block the observer runtime drives itself: an event hat, or a free-standing observer program. */
const canvasDriven = block => {
    const root = block.getRootBlock?.() ?? block;
    return root === block || SPEC.has(root.type);
};

BLOCKS.forEach(spec => {
    generator.forBlock[spec.type] = block => {
        if (spec.output === 'Condition') return [`Bot.observerCondition(${literal(block.id)})`, generator.ORDER_ATOMIC];
        if (spec.output) {
            const fallback = NEUTRAL_VALUE[spec.output] ?? 'null';
            return [`Bot.observerValue(${literal(block.id)}, ${fallback})`, generator.ORDER_ATOMIC];
        }
        if (spec.event || canvasDriven(block)) {
            return `/* ${spec.label} — evaluated by the observer on every genuine tick */\n`;
        }
        return `Bot.observerStatement(${literal(block.id)});\n`;
    };
});
