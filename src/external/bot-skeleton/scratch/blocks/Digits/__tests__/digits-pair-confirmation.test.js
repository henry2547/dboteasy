/**
 * The two pair blocks added for the Over 1 / Under 8 setup: the confirmed-pair pattern read and the
 * whole cold-pair entry condition as one Boolean gate.
 */
const loadBlocks = () => {
    window.Blockly = {
        Blocks: {},
        Categories: { Digits: 'Digits' },
        Colours: { Base: { colour: '#000', colourSecondary: '#111', colourTertiary: '#222' } },
        OUTPUT_SHAPE_HEXAGONAL: 3,
        OUTPUT_SHAPE_ROUND: 1,
        JavaScript: {
            javascriptGenerator: {
                forBlock: {},
                // The sockets of the block under test, returned as the number they carry.
                valueToCode: (block, name) => block.sockets?.[name] ?? '',
            },
        },
    };
    jest.isolateModules(() => {
        require('../digits_pair_confirmation');
        require('../digits_cold_pair_entry');
    });
    return window.Blockly.JavaScript.javascriptGenerator.forBlock;
};

const blockWith = (fields, sockets = {}) => ({
    getFieldValue: name => fields[name],
    sockets,
});

describe('pair confirmation block', () => {
    const generators = loadBlocks();

    it('reads the confirmed pair of the set it carries', () => {
        expect(generators.digits_pair_confirmation(blockWith({ SET: '0_1' }))[0]).toBe(
            "Bot.isPairConfirmed('0_1')"
        );
        expect(generators.digits_pair_confirmation(blockWith({ SET: '8_9' }))[0]).toBe(
            "Bot.isPairConfirmed('8_9')"
        );
        expect(generators.digits_pair_confirmation(blockWith({ SET: 'nonsense' }))[0]).toBe(
            "Bot.isPairConfirmed('0_1')"
        );
    });
});

describe('cold pair setup block', () => {
    const generators = loadBlocks();

    it('builds the Over 1 condition from the pair, the shares and the red bar', () => {
        const [code] = generators.digits_cold_pair_entry(blockWith({ PRIMARY: 'over_1' }, { PERCENT: '10.2' }));

        expect(code).toContain("Bot.isPairConfirmed('0_1')");
        expect(code).toContain('Bot.areDigitSharesBelow([0, 1], 10.2, 100)');
        expect(code).toContain('Bot.isDigitNotCold(0, 100)');
        expect(code).toContain('Bot.isDigitNotCold(1, 100)');
    });

    it('builds the Under 8 condition from the 8/9 pair', () => {
        const [code] = generators.digits_cold_pair_entry(blockWith({ PRIMARY: 'under_8' }, { PERCENT: '10' }));

        expect(code).toContain("Bot.isPairConfirmed('8_9')");
        expect(code).toContain('Bot.areDigitSharesBelow([8, 9], 10, 100)');
        expect(code).toContain('Bot.isDigitNotCold(8, 100)');
        expect(code).toContain('Bot.isDigitNotCold(9, 100)');
    });

    it('refuses an unusable share', () => {
        expect(() => generators.digits_cold_pair_entry(blockWith({ PRIMARY: 'over_1' }, { PERCENT: '0' }))).toThrow();
        expect(() =>
            generators.digits_cold_pair_entry(blockWith({ PRIMARY: 'over_1' }, { PERCENT: '101' }))
        ).toThrow();
    });
});
