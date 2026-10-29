/**
 * Integration tests that instantiate every block in a real Blockly workspace and generate
 * JavaScript, so a missing generator surfaces as the exact error a user sees on Run —
 * `JavaScript generator does not know how to generate code for block type "…"`.
 *
 * The lighter `observer-generation.test.js` checks that a `forBlock` function exists for every
 * catalogue entry; this file goes further and drives the real generator end-to-end, including
 * connected block sequences and incomplete workspaces.
 */
import * as BlocklyModule from 'blockly';
import * as BlocklyJavaScript from 'blockly/javascript';
import { BLOCKS, GROUPS } from '../../../scratch/blocks/Observer/observer-catalog';

// Set up window.Blockly the same way loadBlockly does, so the block-definition side-effects
// register on the same generator instance that workspaceToCode uses.
beforeAll(() => {
    const Blockly = BlocklyModule.default;
    window.Blockly = Blockly;
    window.Blockly.Colours = { Base: { colour: '#ccc', colourSecondary: '#aaa', colourTertiary: '#999' } };
    window.Blockly.Categories = { Digits: 'Digits' };
    window.Blockly.OUTPUT_SHAPE_HEXAGONAL = 1;
    window.Blockly.OUTPUT_SHAPE_ROUND = 2;
    const gen = new window.Blockly.Generator('code');
    window.Blockly.JavaScript = { ...BlocklyJavaScript, ...gen };
    window.Blockly.JavaScript.javascriptGenerator = BlocklyJavaScript.javascriptGenerator;

    // Load every block definition and generator registration.
    // eslint-disable-next-line no-restricted-syntax
    require('../../../scratch/blocks');
});

const generator = () => window.Blockly.JavaScript.javascriptGenerator;

describe('every observer block generates code in a real workspace', () => {
    BLOCKS.forEach(spec => {
        it(`generates code for ${spec.type}`, () => {
            const workspace = new BlocklyModule.Workspace();
            try {
                const block = workspace.newBlock(spec.type);
                (spec.fields ?? []).forEach(field => {
                    block.setFieldValue(String(field.value), field.name);
                });
                const code = generator().workspaceToCode(workspace);
                if (spec.output) {
                    // Value/condition blocks as bare top blocks may produce an empty string
                    // (Blockly ignores orphan value blocks), so verify the handler directly.
                    const result = generator().forBlock[spec.type](block, generator());
                    expect(Array.isArray(result)).toBe(true);
                } else {
                    expect(typeof code).toBe('string');
                }
                expect(code).not.toContain('does not know how to generate');
            } finally {
                workspace.dispose();
            }
        });
    });
});

describe('connected block sequences generate code', () => {
    it('generates an Over 1 pattern sequence (pair -> confirmation -> emit -> barrier)', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const pair = workspace.newBlock('obs_pair');
            pair.setFieldValue('00 / 11', 'PAIRS');
            const confirmation = workspace.newBlock('obs_confirmation');
            confirmation.setFieldValue('0', 'DIGIT');
            const emit = workspace.newBlock('obs_emit_setup');
            const barrier = workspace.newBlock('obs_barrier_outcome');
            barrier.setFieldValue('Over 1', 'RULE');

            tick.getInput('DO').connection.connect(pair.previousConnection);
            pair.nextConnection.connect(confirmation.previousConnection);
            confirmation.nextConnection.connect(emit.previousConnection);
            emit.nextConnection.connect(barrier.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
            expect(code).toContain('evaluated by the observer');
        } finally {
            workspace.dispose();
        }
    });

    it('generates an Under 8 pattern sequence', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const pair = workspace.newBlock('obs_pair');
            pair.setFieldValue('88 / 99', 'PAIRS');
            const confirmation = workspace.newBlock('obs_confirmation');
            confirmation.setFieldValue('9', 'DIGIT');
            const emit = workspace.newBlock('obs_emit_setup');
            const barrier = workspace.newBlock('obs_barrier_outcome');
            barrier.setFieldValue('Under 8', 'RULE');

            tick.getInput('DO').connection.connect(pair.previousConnection);
            pair.nextConnection.connect(confirmation.previousConnection);
            confirmation.nextConnection.connect(emit.previousConnection);
            emit.nextConnection.connect(barrier.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates an Even/Odd parity pattern sequence', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const pattern = workspace.newBlock('obs_parity_pattern');
            pattern.setFieldValue('Even', 'INITIAL');
            pattern.setFieldValue('3', 'N');
            pattern.setFieldValue('Odd', 'CONFIRM');
            pattern.setFieldValue('Even', 'TARGET');
            const emit = workspace.newBlock('obs_emit_parity');

            tick.getInput('DO').connection.connect(pattern.previousConnection);
            pattern.nextConnection.connect(emit.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates a frequency comparison sequence', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const ifBlock = workspace.newBlock('obs_if');
            const compare = workspace.newBlock('obs_freq_above');
            compare.setFieldValue('5', 'DIGIT');
            compare.setFieldValue('12', 'PERCENT');
            const note = workspace.newBlock('obs_note');
            note.setFieldValue('Frequency high', 'TEXT');

            // A frequency comparison is a condition, so it hangs off the IF condition socket.
            tick.getInput('DO').connection.connect(ifBlock.previousConnection);
            ifBlock.getInput('CONDITION').connection.connect(compare.outputConnection);
            ifBlock.getInput('DO').connection.connect(note.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates a streak detection sequence', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const ifBlock = workspace.newBlock('obs_if');
            const streak = workspace.newBlock('obs_streak_minimum');
            streak.setFieldValue('3', 'N');
            const note = workspace.newBlock('obs_note');
            note.setFieldValue('Streak detected', 'TEXT');

            tick.getInput('DO').connection.connect(ifBlock.previousConnection);
            ifBlock.getInput('CONDITION').connection.connect(streak.outputConnection);
            ifBlock.getInput('DO').connection.connect(note.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates a digit transition sequence', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const ifBlock = workspace.newBlock('obs_if');
            const transition = workspace.newBlock('obs_digit_transition');
            transition.setFieldValue('2', 'DIGIT');
            transition.setFieldValue('3', 'TO');
            const note = workspace.newBlock('obs_note');
            note.setFieldValue('Transition 2 to 3', 'TEXT');

            tick.getInput('DO').connection.connect(ifBlock.previousConnection);
            ifBlock.getInput('CONDITION').connection.connect(transition.outputConnection);
            ifBlock.getInput('DO').connection.connect(note.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates an IF condition wrapping an observer value block', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const tick = workspace.newBlock('obs_on_tick');
            const ifBlock = workspace.newBlock('obs_if');
            const condition = workspace.newBlock('obs_even');
            const note = workspace.newBlock('obs_note');
            note.setFieldValue('Even digit', 'TEXT');

            tick.getInput('DO').connection.connect(ifBlock.previousConnection);
            ifBlock.getInput('CONDITION').connection.connect(condition.outputConnection);
            ifBlock.getInput('DO').connection.connect(note.previousConnection);

            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });
});

describe('Digits blocks generate code', () => {
    const digitsBlocks = [
        'digits_over_under',
        'digits_even_odd',
        'digits_matches_differs',
        'digits_frequency',
        'digits_frequency_count',
        'digits_hot_cold',
        'digits_streak',
        'digits_parity_run',
    ];

    digitsBlocks.forEach(type => {
        it(`generates code for ${type}`, () => {
            const workspace = new BlocklyModule.Workspace();
            try {
                const block = workspace.newBlock(type);
                const handler = generator().forBlock[type];
                expect(typeof handler).toBe('function');
                const result = handler(block, generator());
                expect(result).toBeDefined();
            } finally {
                workspace.dispose();
            }
        });
    });
});

describe('incomplete and invalid workspaces', () => {
    it('generates code for a block with missing field values without crashing', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            workspace.newBlock('obs_frequency');
            const code = generator().workspaceToCode(workspace);
            expect(typeof code).toBe('string');
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates code for a statement block with no body connected', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            workspace.newBlock('obs_on_tick');
            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });

    it('generates code for a value block with no input connected', () => {
        const workspace = new BlocklyModule.Workspace();
        try {
            const setVar = workspace.newBlock('obs_set_variable');
            setVar.setFieldValue('counter', 'NAME');
            const code = generator().workspaceToCode(workspace);
            expect(code).not.toContain('does not know how to generate');
        } finally {
            workspace.dispose();
        }
    });
});

describe('every toolbox group is covered', () => {
    GROUPS.forEach(group => {
        it(`group ${group.id} has blocks and all generate`, () => {
            const types = BLOCKS.filter(spec => group.categories.includes(spec.category)).map(spec => spec.type);
            expect(types.length).toBeGreaterThan(0);
            types.forEach(type => {
                expect(typeof generator().forBlock[type]).toBe('function');
            });
        });
    });
});
