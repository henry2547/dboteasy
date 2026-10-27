/**
 * The two-leg recovery block drives the engine's contract-family switch.
 *
 * Its first leg buys an Over/Under contract from a bot whose trade definition is Even/Odd, so the
 * barrier has to travel with the purchase — otherwise the engine has a contract type but no barrier
 * and Deriv rejects the buy. These tests pin the generated call, not the trade itself (Run is
 * login-gated).
 */
const loadGenerator = () => {
    window.Blockly = {
        Blocks: {},
        JavaScript: { javascriptGenerator: { forBlock: {} } },
    };
    jest.isolateModules(() => {
        require('../digits_parity_recovery');
    });
    return window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_parity_recovery;
};

const blockWith = fields => ({
    getFieldValue: name => fields[name],
});

const fields = { PRIMARY: 'over_1', PARITY: 'both', TICKS: 100, PERCENT: 55 };

describe('parity recovery block generation', () => {
    const generate = loadGenerator();

    it.each([
        ['over_1', 'DIGITOVER', 1],
        ['under_8', 'DIGITUNDER', 8],
    ])('buys the %s leg with its own barrier', (primary, contract, barrier) => {
        const code = generate(blockWith({ ...fields, PRIMARY: primary }));
        expect(code).toContain(`Bot.purchase('${contract}', { barrier: ${barrier} })`);
    });

    it('never doubles an open contract and recovers only after a loss', () => {
        const code = generate(blockWith(fields));
        expect(code).toContain('Bot.sessionHasOpenContract()');
        expect(code).toContain("Bot.sessionLastResult() === 'lost'");
        expect(code).toContain('Bot.eoBuyEven()');
        expect(code).toContain('Bot.eoBuyOdd()');
    });

    it('refuses an unusable sample size', () => {
        expect(() => generate(blockWith({ ...fields, TICKS: 0 }))).toThrow();
    });
});
