/**
 * The two cold-run reads the Over 1 / Under 8 setups are built from: the losing pair in a row
 * (0,0 · 0,1 · 1,1 · 1,0 and 8,8 · 8,9 · 9,9 · 9,8) and the "no red bar" guard. These tests pin the
 * generated engine calls; the maths behind them lives in `utils/__tests__/digit-analysis.test.js`.
 */
const loadGenerator = type => {
    window.Blockly = {
        Blocks: {},
        JavaScript: {
            javascriptGenerator: {
                forBlock: {},
                // An empty socket falls back to the block's own default (3 digits, 100 ticks).
                valueToCode: () => '',
                ORDER_ATOMIC: 0,
            },
        },
    };
    jest.isolateModules(() => {
        require(`../${type}`);
    });
    return window.Blockly.JavaScript.javascriptGenerator.forBlock[type];
};

const blockWith = fields => ({
    getFieldValue: name => fields[name],
});

describe('low / high digits in a row', () => {
    const generate = loadGenerator('digits_run_in_set');

    it('reads the 0/1 pair by default', () => {
        expect(generate(blockWith({ SET: '0_1' }))).toContain("Bot.areLastDigitsInSet(3, '0_1')");
    });

    it('reads the 8/9 pair for the Under 8 setup', () => {
        expect(generate(blockWith({ SET: '8_9' }))).toContain("Bot.areLastDigitsInSet(3, '8_9')");
    });

    it('falls back to the 0/1 pair for an unknown set', () => {
        expect(generate(blockWith({ SET: 'nonsense' }))).toContain("Bot.areLastDigitsInSet(3, '0_1')");
    });
});

describe('digit has no red bar', () => {
    const generate = loadGenerator('digits_no_red_bar');

    it('reads the digit and the window from the block', () => {
        expect(generate(blockWith({ DIGIT: '8' }))).toContain('Bot.isDigitNotCold(8, 100)');
    });
});
