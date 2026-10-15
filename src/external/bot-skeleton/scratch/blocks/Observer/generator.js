/**
 * JavaScript generators for the observer blocks.
 *
 * The observer program is NOT executed by the generated JavaScript: `services/observer/` reads the
 * blocks straight off the canvas and evaluates them on genuine ticks (journal + entry gate). The
 * generated program only asks the runtime, once per trade cycle, whether an entry was signalled —
 * see `generateCode` in `scratch/dbot.js`.
 *
 * These generators therefore stay inert, and that is deliberate: without them `Run` failed with
 * `JavaScript generator does not know how to generate code for block type "obs_…"`, and a strategy
 * that merely contains an observer block must still compile. A value block (a condition, number,
 * string or digit list) emits a neutral literal, a statement block — together with the sequence it
 * holds — emits a comment only.
 */
import { BLOCKS } from './observer-catalog';

/** Neutral literal per output socket, so an inert value block can never signal a condition. */
const INERT_VALUE = {
    Condition: 'false',
    Number: '0',
    String: "''",
    Digits: '[]',
};

const generator = window.Blockly.JavaScript.javascriptGenerator;

BLOCKS.forEach(spec => {
    if (spec.output) {
        generator.forBlock[spec.type] = () => [INERT_VALUE[spec.output] ?? 'null', generator.ORDER_ATOMIC];
        return;
    }
    generator.forBlock[spec.type] = () => `/* ${spec.label} — observer block, not executed */\n`;
});
