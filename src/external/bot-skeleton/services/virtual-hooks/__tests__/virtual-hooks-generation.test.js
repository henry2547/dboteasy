/**
 * Virtual Hook block registration and code generation.
 *
 * The blocks are loaded against a stub Blockly so registration can be checked without the real
 * canvas. Every block must generate code: without a generator the interpreter reports
 * `JavaScript generator does not know how to generate code for block type "vhook_…"`.
 */
jest.mock('../../../scratch/utils', () => ({ modifyContextMenu: jest.fn() }));

const loadBlocks = () => {
    const forBlock = {};
    window.Blockly = {
        Blocks: {},
        JavaScript: {
            javascriptGenerator: {
                forBlock,
                ORDER_ATOMIC: 0,
                valueToCode: () => "''",
            },
        },
        OUTPUT_SHAPE_HEXAGONAL: 1,
        OUTPUT_SHAPE_ROUND: 2,
        Colours: {},
    };
    jest.isolateModules(() => {
        require('../../../scratch/blocks/VirtualHooks');
    });
    return forBlock;
};

const fakeBlock = (overrides = {}) => ({
    id: 'block_id',
    type: 'vhook_trigger',
    getFieldValue: () => 'entry',
    getRootBlock() {
        return { type: 'trade_definition_market' };
    },
    ...overrides,
});

describe('virtual hook blocks', () => {
    const forBlock = loadBlocks();
    const TYPES = ['vhook_register', 'vhook_listener', 'vhook_condition', 'vhook_trigger', 'vhook_result'];

    it('registers every block in the palette', () => {
        TYPES.forEach(type => expect(window.Blockly.Blocks[type]).toBeDefined());
    });

    it('has a generator for every block', () => {
        const missing = TYPES.filter(type => typeof forBlock[type] !== 'function');
        expect(missing).toEqual([]);
    });

    it('hands a condition to the runtime, which is what gates purchase conditions', () => {
        const code = forBlock.vhook_condition(fakeBlock({ type: 'vhook_condition' }));
        expect(code).toEqual(["Bot.vhookCondition('block_id')", 0]);
    });

    it('hands a result and a trigger to the runtime', () => {
        expect(forBlock.vhook_result(fakeBlock({ type: 'vhook_result' }))).toEqual([
            "Bot.vhookResult('block_id', 'entry')",
            0,
        ]);
        expect(forBlock.vhook_trigger(fakeBlock())).toBe("Bot.vhookTrigger('entry', '');\n");
    });

    it('keeps canvas-driven registrations and listeners out of the generated program', () => {
        expect(forBlock.vhook_register(fakeBlock())).toMatch(/runtime/);
        expect(forBlock.vhook_listener(fakeBlock())).toMatch(/runtime/);
    });
});
