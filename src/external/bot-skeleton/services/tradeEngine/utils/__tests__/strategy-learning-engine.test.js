/**
 * The Strategy Learning runtime as the generated program sees it: the label the program sets
 * decides where the engine's real settlements are counted, and the reads answer from that record.
 * The mixin is exercised on its own — no socket, no login.
 */
import StrategyLearning from '../../trade/StrategyLearning';

const createEngine = () => {
    const Engine = StrategyLearning(
        class {
            constructor() {
                this.settled = [];
            }
        }
    );
    return new Engine();
};

describe('strategy learning runtime', () => {
    it('counts settlements under the default strategy until a label is set', () => {
        const engine = createEngine();
        engine.recordLearningSettlement({ profit: 2 });

        expect(engine.learnSampleSize('default')).toBe(1);
        expect(engine.learnHitRate('default')).toBe(100);
        expect(engine.learnReport()).toContain('default');
    });

    it('moves following settlements to the strategy the program labelled', () => {
        const engine = createEngine();
        engine.setLearningStrategy('over 2');

        engine.recordLearningSettlement({ profit: 1 });
        engine.recordLearningSettlement({ profit: -1 });

        expect(engine.learnSampleSize('over 2')).toBe(2);
        expect(engine.learnHitRate('over 2')).toBe(50);
        expect(engine.learnSampleSize('default')).toBe(0);
        expect(engine.learnReport()).toContain('over 2 — 2 trade(s), 1W/1L');
    });

    it('reads the active strategy when the block names none', () => {
        const engine = createEngine();
        engine.setLearningStrategy('under 8');
        engine.recordLearningSettlement({ profit: -1 });

        expect(engine.learnHitRate('')).toBe(0);
        expect(engine.learnSampleSize('')).toBe(1);
        expect(engine.learnStreak('', 'losses')).toBe(1);
        expect(engine.learnStreak('', 'wins')).toBe(0);
    });

    it('names the best strategy only once it has enough settled trades', () => {
        const engine = createEngine();
        engine.setLearningStrategy('a');
        engine.recordLearningSettlement({ profit: 1 });
        engine.setLearningStrategy('b');
        engine.recordLearningSettlement({ profit: -1 });

        expect(engine.learnBestStrategy('hit_rate', 1)).toBe('a');
        expect(engine.learnBestStrategy('hit_rate', 3)).toBe('');
    });

    it('compares two labelled strategies and fails closed on a small sample', () => {
        const engine = createEngine();
        engine.setLearningStrategy('good');
        engine.recordLearningSettlement({ profit: 1 });
        engine.recordLearningSettlement({ profit: 1 });
        engine.setLearningStrategy('bad');
        engine.recordLearningSettlement({ profit: -1 });
        engine.recordLearningSettlement({ profit: 1 });

        expect(engine.learnCompare('good', 'bad', 2)).toBe(true);
        expect(engine.learnCompare('bad', 'good', 2)).toBe(false);
        expect(engine.learnCompare('good', 'bad', 5)).toBe(false);
    });

    it('forgets every recorded strategy but starts a fresh default record', () => {
        const engine = createEngine();
        engine.setLearningStrategy('forget me');
        engine.recordLearningSettlement({ profit: 3 });

        engine.resetLearning();

        expect(engine.learnSampleSize('forget me')).toBe(0);
        expect(engine.learnSampleSize('default')).toBe(0);
        expect(engine.learnReport()).toContain('no settled contracts');
    });
});
