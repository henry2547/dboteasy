/**
 * The two-leg recovery block drives the engine's contract-family switch and its parity-reversal
 * entry.
 *
 * Its first leg buys an Over/Under contract from a bot whose trade definition is Even/Odd, so the
 * barrier has to travel with the purchase — otherwise the engine has a contract type but no barrier
 * and Deriv rejects the buy. Its second leg prepares ONCE for the loss (market scan + reversal
 * window) and then buys the reversal of the last digits. These tests pin the generated call, not the
 * trade itself (Run is login-gated).
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

const fields = { PRIMARY: 'over_1', PARITY: 'both', RUN: 2, TICKS: 100 };

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

    it('prepares the recovery once per loss, with the reversal digits it was configured with', () => {
        const code = generate(blockWith({ ...fields, RUN: 3, PARITY: 'odd', TICKS: 250 }));
        expect(code).toContain("Bot.eoRecoveryPrepare({ run: 3, direction: 'odd', ticks: 250 })");
        // The prep is the gate for the entry, so a prepared-but-waiting window never buys blind.
        expect(code).toContain('Bot.eoSignalDirection() === \'EVEN\'');
        expect(code.match(/Bot\.marketScanBestParity/g)).toBeNull();
    });

    it('refuses an unusable sample size or run length', () => {
        expect(() => generate(blockWith({ ...fields, TICKS: 0 }))).toThrow();
        expect(() => generate(blockWith({ ...fields, RUN: 1 }))).toThrow();
    });
});
