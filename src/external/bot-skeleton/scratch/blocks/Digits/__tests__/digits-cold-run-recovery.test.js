/**
 * The pair entry block is the whole observed setup in one block: the Over 1 / Under 8 leg only runs
 * while the losing pair stays cold and its pair is confirmed on a later tick, and a settled loss
 * switches to the Even/Odd reversal of the newest digits. These tests pin the generated call and the
 * decision the engine makes from it.
 */
const loadGenerator = () => {
    window.Blockly = {
        Blocks: {},
        Categories: { Digits: 'Digits' },
        Colours: { Base: { colour: '#000', colourSecondary: '#111', colourTertiary: '#222' } },
        JavaScript: { javascriptGenerator: { forBlock: {} } },
    };
    jest.isolateModules(() => {
        require('../digits_cold_run_recovery');
    });
    return window.Blockly.JavaScript.javascriptGenerator.forBlock.digits_cold_run_recovery;
};

const blockWith = fields => ({
    getFieldValue: name => fields[name],
});

const fields = { PRIMARY: 'over_1', PERCENT: 10.2, SAMPLE: 100, PARITY: 'both', REVERSAL: 2 };

describe('cold-run recovery block generation', () => {
    const generate = loadGenerator();

    it('reads the confirmed losing pair, its adaptive share and its red bar before buying Over 1', () => {
        const code = generate(blockWith(fields));

        expect(code).toContain("Bot.isPairConfirmed('0_1')");
        // The ceiling is re-read from the live window on every trade loop instead of being fixed.
        expect(code).toContain('Bot.areDigitSharesBelow([0, 1], Bot.adaptiveColdShare(10.2, 100), 100)');
        expect(code).toContain('Bot.isDigitCold(0, 100) || Bot.isDigitCold(1, 100)');
        expect(code).not.toContain('Bot.isDigitNotCold');
        expect(code).toContain("Bot.purchase('DIGITOVER', { barrier: 1 })");
    });

    it('waits on the 8/9 pair with a red bar on either digit for the Under 8 leg', () => {
        const code = generate(blockWith({ ...fields, PRIMARY: 'under_8' }));

        expect(code).toContain("Bot.isPairConfirmed('8_9')");
        expect(code).toContain('Bot.areDigitSharesBelow([8, 9], Bot.adaptiveColdShare(10.2, 100), 100)');
        expect(code).toContain('Bot.isDigitCold(8, 100) || Bot.isDigitCold(9, 100)');
        expect(code).toContain("Bot.purchase('DIGITUNDER', { barrier: 8 })");
    });

    it('never doubles an open contract and recovers only after a loss', () => {
        const code = generate(blockWith(fields));

        expect(code).toContain('Bot.sessionHasOpenContract()');
        expect(code).toContain("Bot.sessionLastResult() === 'loss'");
        expect(code).toContain("Bot.eoParityReversal(2, 'both') === 'ODD'");
        expect(code).toContain("Bot.eoParityReversal(2, 'both') === 'EVEN'");
    });

    it('keeps one decimal on the cold share', () => {
        // Blockly treats `precision` as the rounding step, so a step of 1 would turn 10.2 into 10.
        const definition = window.Blockly.Blocks.digits_cold_run_recovery.definition();
        expect(definition.args1[0]).toMatchObject({ name: 'PERCENT', value: 10.2, precision: 0.1 });
    });

    it('refuses unusable numbers', () => {
        expect(() => generate(blockWith({ ...fields, REVERSAL: 1 }))).toThrow();
        expect(() => generate(blockWith({ ...fields, PERCENT: 0 }))).toThrow();
        expect(() => generate(blockWith({ ...fields, SAMPLE: 0 }))).toThrow();
    });
});

describe('cold-run program decisions', () => {
    const generate = loadGenerator();
    const run = (fields_override, bot) => new Function('Bot', generate(blockWith(fields_override)))(bot);

    const createBot = ({
        open = false,
        result = '',
        reversal = 'NO SIGNAL',
        pair_confirmed = true,
        shares_ok = true,
        red_bar = true,
        ceiling = 8.4,
        risk = true,
    } = {}) => ({
        sessionHasOpenContract: jest.fn(() => open),
        sessionLastResult: jest.fn(() => result),
        eoParityReversal: jest.fn(() => reversal),
        isPairConfirmed: jest.fn(() => pair_confirmed),
        areDigitSharesBelow: jest.fn(() => shares_ok),
        adaptiveColdShare: jest.fn(() => ceiling),
        isDigitCold: jest.fn(() => red_bar),
        riskCanTrade: jest.fn(() => risk),
        getLastDigit: jest.fn(() => 1),
        sessionJournal: jest.fn(),
        entryCheckFailed: jest.fn(),
        purchase: jest.fn(),
    });

    it('buys Over 1 when the pair is confirmed and one losing digit carries the red bar', () => {
        const bot = createBot();
        run(fields, bot);

        expect(bot.purchase).toHaveBeenCalledWith('DIGITOVER', { barrier: 1 });
        expect(bot.sessionJournal).not.toHaveBeenCalled();
    });

    it.each([
        ['the pair is not confirmed', { pair_confirmed: false }],
        ['a losing digit is no longer cold', { shares_ok: false }],
        ['neither losing digit carries the red bar', { red_bar: false }],
        ['the adaptive ceiling could not be read', { ceiling: null, shares_ok: false }],
        ['the risk guard blocks the trade', { risk: false }],
    ])('waits instead of buying when %s', (_reason, overrides) => {
        const bot = createBot(overrides);
        run(fields, bot);

        expect(bot.purchase).not.toHaveBeenCalled();
        expect(bot.sessionJournal).toHaveBeenCalled();
        // Every wait is also a failed entry check, so the run stops after 3 of them in a row.
        expect(bot.entryCheckFailed).toHaveBeenCalled();
    });

    it('buys the opposite parity of the last digits after a loss', () => {
        const bot = createBot({ result: 'loss', reversal: 'ODD' });
        run(fields, bot);

        expect(bot.eoParityReversal).toHaveBeenCalledWith(2, 'both');
        expect(bot.purchase).toHaveBeenCalledWith('DIGITODD');
        expect(bot.isPairConfirmed).not.toHaveBeenCalled();
    });

    it('buys EVEN when the last digits were all odd', () => {
        const bot = createBot({ result: 'loss', reversal: 'EVEN' });
        run(fields, bot);

        expect(bot.purchase).toHaveBeenCalledWith('DIGITEVEN');
    });

    it('never trades while a contract is open', () => {
        const bot = createBot({ open: true, result: 'loss', reversal: 'ODD' });
        run(fields, bot);

        expect(bot.eoParityReversal).not.toHaveBeenCalled();
        expect(bot.purchase).not.toHaveBeenCalled();
    });
});
