/**
 * The Digits category is one family of contracts, so a bot may buy more than the pair its trade
 * type names — the Over 1 / Under 8 bot that switches to Even/Odd after a loss does exactly that.
 * These tests hold that together: the Purchase block offers every digit contract, and the Trade
 * parameters block subscribes a proposal for each one the canvas can buy.
 */
const ORDER_ATOMIC = 0;

const loadDigitBlocks = () => {
    const forBlock = {};
    window.Blockly = {
        Blocks: {},
        Colours: {
            Base: { colour: '#ff0000', colourSecondary: '#ee0000', colourTertiary: '#dd0000' },
        },
        Categories: { Digits: 'Digits' },
        JavaScript: { javascriptGenerator: { forBlock, ORDER_ATOMIC } },
        OUTPUT_SHAPE_HEXAGONAL: 2,
    };
    jest.isolateModules(() => {
        require('../blocks/Digits');
    });
    return forBlock;
};

/** A field-reading stand-in for the parity block, so the generator can be called without Blockly. */
const parityRunBlock = fields => ({ getFieldValue: name => fields[name] });

describe('digit contract types', () => {
    const { isDigitTradeType, getPurchaseContractTypeOptions, digitPurchaseTypes } = require('../shared');

    it('recognises the three digit trade types', () => {
        expect(['overunder', 'evenodd', 'matchesdiffers'].every(isDigitTradeType)).toBe(true);
        expect(isDigitTradeType('callput')).toBe(false);
        expect(isDigitTradeType('')).toBe(false);
    });

    it('offers every digit contract in the Purchase block, the trade type own pair first', () => {
        const values = getPurchaseContractTypeOptions('both', 'overunder').map(option => option[1]);

        expect(values.slice(0, 2)).toEqual(['DIGITOVER', 'DIGITUNDER']);
        expect(values).toEqual(
            expect.arrayContaining(['DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER'])
        );
        expect(values).toHaveLength(6);
    });

    it('leaves a non-digit trade type on its own pair', () => {
        expect(getPurchaseContractTypeOptions('both', 'callput').map(option => option[1])).toEqual(['CALL', 'PUT']);
    });

    it('subscribes a proposal for the pair plus every digit contract the canvas can buy', () => {
        const { digitContractTypesForTrade } = require('../shared');
        const workspace = {
            getAllBlocks: () => [
                { type: 'purchase', getFieldValue: () => 'DIGITODD' },
                { type: 'purchase', getFieldValue: () => 'DIGITEVEN' },
            ],
        };

        expect(digitContractTypesForTrade(['DIGITOVER', 'DIGITUNDER'], 'overunder', workspace)).toEqual([
            'DIGITOVER',
            'DIGITUNDER',
            'DIGITODD',
            'DIGITEVEN',
        ]);
        // A non-digit bot keeps exactly what its trade type says.
        expect(digitContractTypesForTrade(['CALL', 'PUT'], 'callput', workspace)).toEqual(['CALL', 'PUT']);
    });

    it('collects the digit contracts the canvas Purchase blocks can buy', () => {
        const workspace = {
            getAllBlocks: () => [
                { type: 'purchase', getFieldValue: () => 'DIGITODD' },
                { type: 'purchase', getFieldValue: () => 'DIGITOVER' },
                { type: 'purchase', getFieldValue: () => 'CALL' },
                { type: 'trade_definition', getFieldValue: () => 'DIGITEVEN' },
            ],
        };

        expect(digitPurchaseTypes(workspace).sort()).toEqual(['DIGITODD', 'DIGITOVER']);
        expect(digitPurchaseTypes(undefined)).toEqual([]);
    });
});

describe('digit parity run block', () => {
    const forBlock = loadDigitBlocks();

    it('registers the block and its generator', () => {
        expect(window.Blockly.Blocks.digits_parity_run).toBeDefined();
        expect(typeof forBlock.digits_parity_run).toBe('function');
    });

    it('generates the pair rule with the count and the parity the user picked', () => {
        const [code, precedence] = forBlock.digits_parity_run(parityRunBlock({ COUNT: 2, PARITY: 'even' }));

        expect(code).toBe("Bot.isDigitParityRun('even', 2)");
        expect(precedence).toBe(ORDER_ATOMIC);
    });
});
