/**
 * The two-leg recovery block drives the engine's contract-family switch and its parity-reversal
 * entry.
 *
 * Its first leg buys an Over/Under contract from a bot whose trade definition is Even/Odd, so the
 * barrier has to travel with the purchase — otherwise the engine has a contract type but no barrier
 * and Deriv rejects the buy. Its second leg reads the reversal of the newest digits on every pass of
 * the trade loop and buys through the same purchase path. These tests pin the generated call, not
 * the trade itself (Run is login-gated).
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

const fields = { PRIMARY: 'over_1', PARITY: 'both', RUN: 2 };

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
        // The engine reports `win` / `loss`; a comparison against anything else never fires.
        expect(code).toContain("Bot.sessionLastResult() === 'loss'");
    });

    it('reads the reversal of the newest digits and buys that parity', () => {
        const code = generate(blockWith({ ...fields, RUN: 3, PARITY: 'odd' }));
        expect(code).toContain("Bot.eoParityReversal(3, 'odd') === 'ODD'");
        expect(code).toContain("Bot.eoParityReversal(3, 'odd') === 'EVEN'");
        expect(code).toContain("Bot.purchase('DIGITODD')");
        expect(code).toContain("Bot.purchase('DIGITEVEN')");
        // The recovery trades the market it is already on: no scan, no async preparation.
        expect(code).not.toContain('marketScanBestParity');
        expect(code).not.toContain('eoRecoveryPrepare');
    });

    it('refuses an unusable run length', () => {
        expect(() => generate(blockWith({ ...fields, RUN: 1 }))).toThrow();
        expect(() => generate(blockWith({ ...fields, RUN: 101 }))).toThrow();
        expect(() => generate(blockWith({ ...fields, RUN: 'abc' }))).toThrow();
    });
});

describe('parity recovery program after a settled loss', () => {
    const generate = loadGenerator();
    const run = (fields_override, bot) => new Function('Bot', generate(blockWith(fields_override)))(bot);

    const createBot = ({ open = false, result = 'loss', reversal = 'ODD', digit = 0 } = {}) => ({
        sessionHasOpenContract: jest.fn(() => open),
        sessionLastResult: jest.fn(() => result),
        eoParityReversal: jest.fn(() => reversal),
        getLastDigit: jest.fn(() => digit),
        riskCanTrade: jest.fn(() => true),
        purchase: jest.fn(),
    });

    it('buys ODD when the last two digits were both even', () => {
        const bot = createBot({ reversal: 'ODD' });
        run(fields, bot);
        expect(bot.eoParityReversal).toHaveBeenCalledWith(2, 'both');
        expect(bot.purchase).toHaveBeenCalledTimes(1);
        expect(bot.purchase).toHaveBeenCalledWith('DIGITODD');
    });

    it('buys EVEN when the last two digits were both odd', () => {
        const bot = createBot({ reversal: 'EVEN' });
        run(fields, bot);
        expect(bot.purchase).toHaveBeenCalledTimes(1);
        expect(bot.purchase).toHaveBeenCalledWith('DIGITEVEN');
    });

    it('waits without trading while the run is mixed', () => {
        const bot = createBot({ reversal: 'NO SIGNAL' });
        run(fields, bot);
        expect(bot.purchase).not.toHaveBeenCalled();
    });

    it('never trades the recovery leg while a contract is open', () => {
        const bot = createBot({ open: true });
        run(fields, bot);
        expect(bot.eoParityReversal).not.toHaveBeenCalled();
        expect(bot.purchase).not.toHaveBeenCalled();
    });

    it('buys the primary Over 1 leg before any loss', () => {
        const bot = createBot({ result: '', digit: 5 });
        run(fields, bot);
        expect(bot.purchase).toHaveBeenCalledWith('DIGITOVER', { barrier: 1 });
        expect(bot.eoParityReversal).not.toHaveBeenCalled();
    });

    it('does not buy the primary leg while the newest digit is 0 or 1', () => {
        const bot = createBot({ result: 'win', digit: 1 });
        run(fields, bot);
        expect(bot.purchase).not.toHaveBeenCalled();
    });
});
