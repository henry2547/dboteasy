/**
 * Strategy learning as pure arithmetic: every figure comes from settled contracts grouped by the
 * label the program chose, and too small a sample is never turned into a winner.
 */
import {
    DEFAULT_STRATEGY,
    bestStrategy,
    compareStrategies,
    createLearningState,
    currentStreak,
    hitRate,
    labelStrategy,
    learningSummary,
    recordLearningOutcome,
    sampleSize,
    strategyStats,
} from '../strategy-learning';

const settle = (state, outcomes) => outcomes.reduce((next, profit) => recordLearningOutcome(next, { profit }), state);

describe('strategy learning arithmetic', () => {
    it('starts with an untouched default strategy', () => {
        const state = createLearningState();
        expect(state.active).toBe(DEFAULT_STRATEGY);

        const stats = strategyStats(state, DEFAULT_STRATEGY);
        expect(stats.trades).toBe(0);
        expect(hitRate(stats)).toBe(0);
        expect(sampleSize(stats)).toBe(0);
        expect(learningSummary(state)).toContain('no settled contracts');
    });

    it('attributes settlements to the labelled strategy and ignores other labels', () => {
        let state = labelStrategy(createLearningState(), 'breakout');
        state = settle(state, [1.5, -1, 2]);

        const breakout = strategyStats(state, 'breakout');
        expect(breakout.trades).toBe(3);
        expect(breakout.wins).toBe(2);
        expect(breakout.losses).toBe(1);
        expect(hitRate(breakout)).toBeCloseTo(66.666, 2);
        expect(breakout.profit).toBeCloseTo(2.5, 2);

        expect(strategyStats(state, DEFAULT_STRATEGY).trades).toBe(0);
        expect(strategyStats(state, 'unknown').trades).toBe(0);
    });

    it('counts a zero-profit settlement as a loss, like the statistics panel', () => {
        let state = labelStrategy(createLearningState(), 'flat');
        state = settle(state, [0]);

        const stats = strategyStats(state, 'flat');
        expect(stats.losses).toBe(1);
        expect(stats.wins).toBe(0);
    });

    it('signs the streak: positive while winning, negative while losing', () => {
        let state = labelStrategy(createLearningState(), 'streaky');
        state = settle(state, [1, 1, 1]);
        expect(currentStreak(strategyStats(state, 'streaky'), 'wins')).toBe(3);
        expect(currentStreak(strategyStats(state, 'streaky'), 'losses')).toBe(0);

        state = settle(state, [-1, -1]);
        expect(currentStreak(strategyStats(state, 'streaky'), 'wins')).toBe(0);
        expect(currentStreak(strategyStats(state, 'streaky'), 'losses')).toBe(2);
    });

    it('never declares a strategy best before it reaches the minimum sample', () => {
        let state = labelStrategy(createLearningState(), 'small');
        state = settle(state, [1, 1, 1]);
        state = labelStrategy(state, 'big');
        state = settle(state, [1, -1, -1, -1]);

        // 'small' has 3 settled trades at 100% and 'big' 4 at 25%, so requiring 5 leaves nothing
        // to name even though one strategy looks perfect on its tiny sample.
        expect(bestStrategy(state, { criterion: 'hit_rate', min_sample: 4 })).toBe('big');
        expect(bestStrategy(state, { criterion: 'hit_rate', min_sample: 5 })).toBe('');
    });

    it('ranks by profit when asked and breaks ties by sample size', () => {
        let state = labelStrategy(createLearningState(), 'a');
        state = settle(state, [-2, 1]);
        state = labelStrategy(state, 'b');
        state = settle(state, [5, -1]);

        expect(bestStrategy(state, { criterion: 'profit', min_sample: 2 })).toBe('b');

        let tied = labelStrategy(createLearningState(), 'short');
        tied = settle(tied, [1]);
        tied = labelStrategy(tied, 'long');
        tied = settle(tied, [1, 1]);

        expect(bestStrategy(tied, { criterion: 'hit_rate', min_sample: 1 })).toBe('long');
    });

    it('compares hit rates only when both strategies have enough evidence', () => {
        let state = labelStrategy(createLearningState(), 'good');
        state = settle(state, [1, 1, -1]);
        state = labelStrategy(state, 'bad');
        state = settle(state, [-1, -1, 1]);

        expect(compareStrategies(state, 'good', 'bad', 3)).toBe(true);
        expect(compareStrategies(state, 'bad', 'good', 3)).toBe(false);
        // Too little evidence fails closed, even though the ratio favours 'good'.
        expect(compareStrategies(state, 'good', 'bad', 4)).toBe(false);
    });

    it('reports every strategy that settled a trade, and nothing that did not', () => {
        let state = labelStrategy(createLearningState(), 'one');
        state = settle(state, [1]);
        state = labelStrategy(state, 'two');
        state = settle(state, [-1]);

        const summary = learningSummary(state);
        expect(summary).toContain('one — 1 trade(s), 1W/0L');
        expect(summary).toContain('two — 1 trade(s), 0W/1L');
        expect(summary).not.toContain(DEFAULT_STRATEGY);
    });

    it('treats a blank label as the default strategy', () => {
        let state = labelStrategy(createLearningState(), '   ');
        expect(state.active).toBe(DEFAULT_STRATEGY);
        state = settle(state, [1]);
        expect(strategyStats(state, '  ').trades).toBe(1);
    });
});
