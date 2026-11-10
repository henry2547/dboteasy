import {
    DEFAULT_BOT_INPUT,
    GENERATED_BOT_STORAGE_KEY,
    MAX_BOT_STAKE,
    botName,
    clearGeneratedBot,
    generateBot,
    loadGeneratedBot,
    saveGeneratedBot,
} from '../bot-generator';

describe('generateBot', () => {
    it('builds one bot from the chosen settings', () => {
        const bot = generateBot({ direction: 'fall', strategyId: 'breakout', stake: 2, durationTicks: 3 });

        expect(bot.direction).toBe('fall');
        expect(bot.strategyId).toBe('breakout');
        expect(bot.stake).toBe(2);
        expect(bot.durationTicks).toBe(3);
        expect(bot.name).toBe(botName('fall', 'breakout'));
        expect(bot.id).toMatch(/^rf-bot-/);
    });

    it('defaults to Rise and keeps the stake to two decimals', () => {
        const bot = generateBot({ ...DEFAULT_BOT_INPUT, stake: 0.355 });

        expect(bot.direction).toBe('rise');
        expect(bot.stake).toBe(0.36);
    });

    it('clamps the stake and the duration to what the engine accepts', () => {
        const tiny = generateBot({ ...DEFAULT_BOT_INPUT, stake: 0, durationTicks: 0 });
        const huge = generateBot({ ...DEFAULT_BOT_INPUT, stake: 5_000, durationTicks: 9_999 });

        expect(tiny.stake).toBeGreaterThan(0);
        expect(tiny.durationTicks).toBe(1);
        expect(huge.stake).toBe(MAX_BOT_STAKE);
        expect(huge.durationTicks).toBe(300);
    });

    it('falls back to the default stake when the field is empty', () => {
        const bot = generateBot({ ...DEFAULT_BOT_INPUT, stake: Number.NaN });

        expect(bot.stake).toBe(DEFAULT_BOT_INPUT.stake);
    });
});

describe('generated bot storage', () => {
    beforeEach(() => window.localStorage.clear());

    it('keeps exactly one bot', () => {
        const first = generateBot(DEFAULT_BOT_INPUT);
        const second = generateBot({ ...DEFAULT_BOT_INPUT, direction: 'fall' });

        saveGeneratedBot(first);
        saveGeneratedBot(second);

        expect(loadGeneratedBot()?.id).toBe(second.id);
        expect(loadGeneratedBot()?.direction).toBe('fall');
    });

    it('ignores a corrupt record instead of throwing', () => {
        window.localStorage.setItem(GENERATED_BOT_STORAGE_KEY, '{not json');

        expect(loadGeneratedBot()).toBeNull();
    });

    it('clears the stored bot', () => {
        saveGeneratedBot(generateBot(DEFAULT_BOT_INPUT));
        clearGeneratedBot();

        expect(loadGeneratedBot()).toBeNull();
    });
});
