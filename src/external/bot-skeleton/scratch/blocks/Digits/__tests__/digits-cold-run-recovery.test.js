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

    it('reads the confirmed losing pair and its adaptive share before buying Over 1', () => {
        const code = generate(blockWith(fields));

        // A live continuous entry trades without waiting for another pair; a fresh confirmation is
        // what the first trade (and every single-mode trade) needs.
        expect(code).toContain("(Bot.tradingModeEntryLive() || Bot.isPairConfirmed('0_1'))");
        // The ceiling is re-read from the live window on every trade loop instead of being fixed.
        expect(code).toContain('Bot.areDigitSharesAtOrBelow([0, 1], Bot.adaptiveColdShare(10.2, 100), 100)');
        // The red (coldest) bar is not part of the rule: a losing digit may carry it or not.
        expect(code).not.toContain('Bot.isDigitCold');
        expect(code).not.toContain('Bot.isDigitNotCold');
        expect(code).toContain("Bot.purchase('DIGITOVER', { barrier: 1 })");
    });

    it('waits on the 8/9 pair for the Under 8 leg', () => {
        const code = generate(blockWith({ ...fields, PRIMARY: 'under_8' }));

        expect(code).toContain("(Bot.tradingModeEntryLive() || Bot.isPairConfirmed('8_9'))");
        expect(code).toContain('Bot.areDigitSharesAtOrBelow([8, 9], Bot.adaptiveColdShare(10.2, 100), 100)');
        expect(code).not.toContain('Bot.isDigitCold');
        expect(code).toContain("Bot.purchase('DIGITUNDER', { barrier: 8 })");
    });

    it('never doubles an open contract and recovers only after a loss', () => {
        const code = generate(blockWith(fields));

        expect(code).toContain('Bot.sessionHasOpenContract()');
        expect(code).toContain("Bot.sessionLastResult() === 'loss'");
        expect(code).toContain("Bot.eoParityReversal(2, 'both') === 'ODD'");
        expect(code).toContain("Bot.eoParityReversal(2, 'both') === 'EVEN'");
        // The recovery buys are marked as their own entry, so a single-mode entry never holds them.
        expect(code).toContain("Bot.purchase('DIGITODD', { recovery: true })");
        expect(code).toContain("Bot.purchase('DIGITEVEN', { recovery: true })");
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
        entry_live = false,
        shares_ok = true,
        ceiling = 8.4,
        risk = true,
    } = {}) => ({
        sessionHasOpenContract: jest.fn(() => open),
        sessionLastResult: jest.fn(() => result),
        eoParityReversal: jest.fn(() => reversal),
        isPairConfirmed: jest.fn(() => pair_confirmed),
        tradingModeEntryLive: jest.fn(() => entry_live),
        areDigitSharesAtOrBelow: jest.fn(() => shares_ok),
        adaptiveColdShare: jest.fn(() => ceiling),
        riskCanTrade: jest.fn(() => risk),
        getLastDigit: jest.fn(() => 1),
        sessionJournal: jest.fn(),
        entryCheckFailed: jest.fn(),
        purchase: jest.fn(),
    });

    it('buys Over 1 when the pair is confirmed and both losing digits are at or below the ceiling', () => {
        const bot = createBot();
        run(fields, bot);

        expect(bot.purchase).toHaveBeenCalledWith('DIGITOVER', { barrier: 1 });
        expect(bot.sessionJournal).not.toHaveBeenCalled();
    });

    it('trades on a live continuous entry without waiting for another confirmed pair', () => {
        const bot = createBot({ pair_confirmed: false, entry_live: true });
        run(fields, bot);

        expect(bot.purchase).toHaveBeenCalledWith('DIGITOVER', { barrier: 1 });
        // The share ceiling still gates every trade of the live entry.
        expect(bot.areDigitSharesAtOrBelow).toHaveBeenCalled();
    });

    it('still waits on the ceiling inside a live entry', () => {
        const bot = createBot({ pair_confirmed: false, entry_live: true, shares_ok: false });
        run(fields, bot);

        expect(bot.purchase).not.toHaveBeenCalled();
    });

    it.each([
        ['the pair is not confirmed', { pair_confirmed: false }],
        ['a losing digit is above the share ceiling', { shares_ok: false }],
        ['the adaptive ceiling could not be read', { ceiling: null, shares_ok: false }],
        ['the risk guard blocks the trade', { risk: false }],
    ])('waits instead of buying when %s', (_reason, overrides) => {
        const bot = createBot(overrides);
        run(fields, bot);

        expect(bot.purchase).not.toHaveBeenCalled();
        expect(bot.sessionJournal).toHaveBeenCalled();
        // A wait is not a failed entry check: only the template's frequency-limit guard may stop the run.
        expect(bot.entryCheckFailed).not.toHaveBeenCalled();
    });

    it('buys the opposite parity of the last digits after a loss', () => {
        const bot = createBot({ result: 'loss', reversal: 'ODD' });
        run(fields, bot);

        expect(bot.eoParityReversal).toHaveBeenCalledWith(2, 'both');
        expect(bot.purchase).toHaveBeenCalledWith('DIGITODD', { recovery: true });
        expect(bot.isPairConfirmed).not.toHaveBeenCalled();
    });

    it('buys EVEN when the last digits were all odd', () => {
        const bot = createBot({ result: 'loss', reversal: 'EVEN' });
        run(fields, bot);

        expect(bot.purchase).toHaveBeenCalledWith('DIGITEVEN', { recovery: true });
    });

    it('never trades while a contract is open', () => {
        const bot = createBot({ open: true, result: 'loss', reversal: 'ODD' });
        run(fields, bot);

        expect(bot.eoParityReversal).not.toHaveBeenCalled();
        expect(bot.purchase).not.toHaveBeenCalled();
    });
});
