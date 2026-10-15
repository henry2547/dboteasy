/**
 * Every custom block in the app generates code.
 *
 * `Run` used to fail with `JavaScript generator does not know how to generate code for block type`
 * whenever a block was on the canvas with no generator, so these tests hold the two halves together:
 * the observer palette registers one generator per catalogue block, and every block defined anywhere
 * under `scratch/blocks` has a `forBlock` registration somewhere in the bot skeleton.
 */
import fs from 'fs';
import path from 'path';
import { BLOCKS } from '../../../scratch/blocks/Observer/observer-catalog';

const ORDER_ATOMIC = 0;

/** Loads the observer generators against a stub generator, without needing a real Blockly. */
const loadObserverGenerators = () => {
    const forBlock = {};
    window.Blockly = { JavaScript: { javascriptGenerator: { forBlock, ORDER_ATOMIC } } };
    jest.isolateModules(() => {
        require('../../../scratch/blocks/Observer/generator');
    });
    return forBlock;
};

const blockFor = (spec, root) => ({
    id: `id_${spec.type}`,
    type: spec.type,
    getRootBlock: () => root ?? { type: 'trade_definition_market' },
});

const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
        return /\.(js|ts)$/.test(entry.name) ? [full] : [];
    });

describe('observer block code generation', () => {
    const forBlock = loadObserverGenerators();

    it('registers a generator for every block the palette offers', () => {
        const missing = BLOCKS.filter(spec => typeof forBlock[spec.type] !== 'function').map(spec => spec.type);
        expect(missing).toEqual([]);
        expect(BLOCKS.length).toBeGreaterThan(100);
    });

    it('generates a condition as a call the observer runtime evaluates', () => {
        BLOCKS.filter(spec => spec.output === 'Condition').forEach(spec => {
            const code = forBlock[spec.type](blockFor(spec));
            expect(Array.isArray(code)).toBe(true);
            expect(code[0]).toBe(`Bot.observerCondition(${JSON.stringify(`id_${spec.type}`)})`);
            expect(code[1]).toBe(ORDER_ATOMIC);
        });
    });

    it('generates a value with a neutral fallback, never a constant of its own', () => {
        const fallbacks = { Number: '0', String: "''", Digits: '[]' };
        BLOCKS.filter(spec => spec.output && spec.output !== 'Condition').forEach(spec => {
            const [code, precedence] = forBlock[spec.type](blockFor(spec));
            expect(code).toBe(`Bot.observerValue(${JSON.stringify(`id_${spec.type}`)}, ${fallbacks[spec.output]})`);
            expect(precedence).toBe(ORDER_ATOMIC);
        });
    });

    it('generates a statement block the generated program reaches as a runtime call', () => {
        BLOCKS.filter(spec => !spec.output && !spec.event).forEach(spec => {
            const code = forBlock[spec.type](blockFor(spec));
            expect(code).toBe(`Bot.observerStatement(${JSON.stringify(`id_${spec.type}`)});\n`);
        });
    });

    it('leaves the tick-driven program to the runtime instead of generating it twice', () => {
        const event_hats = BLOCKS.filter(spec => spec.event);
        expect(event_hats.length).toBeGreaterThan(0);
        event_hats.forEach(spec => {
            const code = forBlock[spec.type](blockFor(spec));
            expect(code).toContain('evaluated by the observer on every genuine tick');
        });

        // A free-standing observer statement is driven by the tick stream too, so it emits a comment.
        const free_standing = BLOCKS.find(spec => spec.type === 'obs_note');
        const code = forBlock[free_standing.type](blockFor(free_standing, blockFor(free_standing)));
        expect(code).toContain('evaluated by the observer on every genuine tick');
    });
});

describe('custom blocks across the app', () => {
    const skeleton = path.join(__dirname, '../../..');

    it('gives every block defined in the block tree a JavaScript generator', () => {
        const defined = new Map();
        const generated = new Set();

        walk(path.join(skeleton, 'scratch/blocks')).forEach(file => {
            const source = fs.readFileSync(file, 'utf8');
            const relative = path.relative(skeleton, file);
            for (const match of source.matchAll(
                /window\.Blockly\.Blocks(?:\[['"]([\w.]+)['"]\]|\.([\w$]+))\s*=/g
            ))
                defined.set(match[1] ?? match[2], relative);
            for (const match of source.matchAll(
                /Blockly\.common\.defineBlocks\w*\(\s*(?:window\.)?Blockly\.Blocks\s*,?\s*\{([\s\S]*?)\n\}\)/g
            ))
                for (const key of match[1].matchAll(/^\s*([\w$]+)\s*:/gm)) defined.set(key[1], relative);
        });

        walk(skeleton).forEach(file => {
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(
                /window\.Blockly\.JavaScript\.javascriptGenerator\.forBlock(?:\[['"]([\w.]+)['"]\]|\.([\w$]+))\s*=/g
            ))
                generated.add(match[1] ?? match[2]);
        });

        expect(defined.size).toBeGreaterThan(100);
        const missing = [...defined.entries()].filter(([type]) => !generated.has(type));
        expect(missing).toEqual([]);
    });
});
