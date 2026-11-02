/**
 * The cold-run entry block is the whole observed setup in one block: the Over 1 / Under 8 leg only
 * runs while the losing pair stays cold and the newest digits all sit in it, and a settled loss
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

const fields = { PRIMARY: 'over_1', RUN: 3, PERCENT: 10.2, SAMPLE: 100, PARITY: 'both', REVERSAL: 2 };

describe('cold-run recovery block generation', () => {
    const generate = loadGenerator();

    it('reads the losing pair, its share and its red bar before buying Over 1', () => {
        const code = generate(blockWith(fields));

        expect(code).toContain("Bot.areLastDigitsInSet(3, '0_1')");
        expect(code).toContain('Bot.areDigitSharesBelow([0, 1], 10.2, 100)');
        expect(code).toContain('Bot.isDigitNotCold(0, 100)');
        expect(code).toContain('Bot.isDigitNotCold(1, 100)');
        expect(code).toContain("Bot.purchase('DIGITOVER', { barrier: 1 })");
    });

    it('waits on the 8/9 pair for the Under 8 leg', () => {
        const code = generate(blockWith({ ...fields, PRIMARY: 'under_8' }));

        expect(code).toContain("Bot.areLastDigitsInSet(3, '8_9')");
        expect(code).toContain('Bot.areDigitSharesBelow([8, 9], 10.2, 100)');
        expect(code).toContain('Bot.isDigitNotCold(8, 100)');
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
        expect(() => generate(blockWith({ ...fields, RUN: 1 }))).toThrow();
        expect(() => generate(blockWith({ ...fields, RUN: 101 }))).toThrow();
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
        cold_run = true,
        shares_ok = true,
        bars_ok = true,
        risk = true,
    } = {}) => ({
        sessionHasOpenContract: jest.fn(() => open),
        sessionLastResult: jest.fn(() => result),
        eoParityReversal: jest.fn(() => reversal),
        areLastDigitsInSet: jest.fn(() => cold_run),
        areDigitSharesBelow: jest.fn(() => shares_ok),
        isDigitNotCold: jest.fn(() => bars_ok),
        riskCanTrade: jest.fn(() => risk),
        getLastDigit: jest.fn(() => 1),
        sessionJournal: jest.fn(),
        purchase: jest.fn(),
    });

    it('buys Over 1 when the pair stays cold and the run is confirmed', () => {
        const bot = createBot();
        run(fields, bot);

        expect(bot.purchase).toHaveBeenCalledWith('DIGITOVER', { barrier: 1 });
        expect(bot.sessionJournal).not.toHaveBeenCalled();
    });

    it.each([
        ['the run is broken', { cold_run: false }],
        ['a losing digit is no longer cold', { shares_ok: false }],
        ['a losing digit carries the red bar', { bars_ok: false }],
        ['the risk guard blocks the trade', { risk: false }],
    ])('waits instead of buying when %s', (_reason, overrides) => {
        const bot = createBot(overrides);
        run(fields, bot);

        expect(bot.purchase).not.toHaveBeenCalled();
        expect(bot.sessionJournal).toHaveBeenCalled();
    });

    it('buys the opposite parity of the last digits after a loss', () => {
        const bot = createBot({ result: 'loss', reversal: 'ODD' });
        run(fields, bot);

        expect(bot.eoParityReversal).toHaveBeenCalledWith(2, 'both');
        expect(bot.purchase).toHaveBeenCalledWith('DIGITODD');
        expect(bot.areLastDigitsInSet).not.toHaveBeenCalled();
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
