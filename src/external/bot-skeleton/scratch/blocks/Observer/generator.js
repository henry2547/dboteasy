/**
 * JavaScript generators for the observer blocks.
 *
 * The observer language describes market observation, not trading: it has no runtime in the Bot
 * Builder, so a bot containing one of these blocks used to fail to run with
 * `JavaScript generator does not know how to generate code for block type "obs_…"`.
 *
 * Each block therefore registers an inert placeholder. A value block (a condition, number, string
 * or digit list) generates a neutral literal, and a statement block — together with the sequence
 * it holds — generates a comment only. The block stays on the canvas and the generated program
 * stays valid, but an observer block never takes part in it.
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
