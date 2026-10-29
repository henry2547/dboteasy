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

describe('parity recovery program after a settled loss', () => {
    const generate = loadGenerator();
    // The interpreter awaits the interface's async calls before the branch is evaluated, so a
    // boolean stands in for `Bot.eoRecoveryPrepare()` here.
    const run = (fields_override, bot) => new Function('Bot', generate(blockWith(fields_override)))(bot);

    const createBot = ({ open = false, result = 'lost', ready = true, signal = 'ODD', digit = 0 } = {}) => {
        const bot = {
            sessionHasOpenContract: jest.fn(() => open),
            sessionLastResult: jest.fn(() => result),
            eoRecoveryPrepare: jest.fn(() => ready),
            eoSignalDirection: jest.fn(() => signal),
            eoBuyEven: jest.fn(),
            eoBuyOdd: jest.fn(),
            getLastDigit: jest.fn(() => digit),
            riskCanTrade: jest.fn(() => true),
            purchase: jest.fn(),
        };
        return bot;
    };

    it('buys the reversal of the last digits after a loss', () => {
        const bot = createBot({ signal: 'ODD' });
        run(fields, bot);
        expect(bot.eoRecoveryPrepare).toHaveBeenCalledWith({ run: 2, direction: 'both', ticks: 100 });
        expect(bot.eoBuyOdd).toHaveBeenCalledTimes(1);
        expect(bot.eoBuyEven).not.toHaveBeenCalled();
        expect(bot.purchase).not.toHaveBeenCalled();
    });

    it('buys EVEN when the reversal reads the other side', () => {
        const bot = createBot({ signal: 'EVEN' });
        run(fields, bot);
        expect(bot.eoBuyEven).toHaveBeenCalledTimes(1);
        expect(bot.eoBuyOdd).not.toHaveBeenCalled();
    });

    it('waits without trading while the reversal window is not ready', () => {
        const bot = createBot({ ready: false, signal: 'NO SIGNAL' });
        run(fields, bot);
        expect(bot.eoBuyEven).not.toHaveBeenCalled();
        expect(bot.eoBuyOdd).not.toHaveBeenCalled();
    });

    it('never trades the recovery leg while a contract is open', () => {
        const bot = createBot({ open: true });
        run(fields, bot);
        expect(bot.eoRecoveryPrepare).not.toHaveBeenCalled();
        expect(bot.eoBuyOdd).not.toHaveBeenCalled();
        expect(bot.purchase).not.toHaveBeenCalled();
    });

    it('buys the primary Over 1 leg before any loss', () => {
        const bot = createBot({ result: null, digit: 5 });
        run(fields, bot);
        expect(bot.purchase).toHaveBeenCalledWith('DIGITOVER', { barrier: 1 });
        expect(bot.eoRecoveryPrepare).not.toHaveBeenCalled();
    });
});
