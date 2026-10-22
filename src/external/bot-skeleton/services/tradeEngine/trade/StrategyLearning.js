/**
 * Strategy learning for the Bot Builder: the runtime behind the "Strategy Learning" blocks.
 *
 * It records what settled contracts actually did, grouped by the label the program selected, from
 * the same settlement the statistics panel books. Nothing is simulated: a strategy with too few
 * settled trades is reported as too small a sample, never as a winner.
 */
import { observer as globalObserver } from '../../../utils/observer';
import {
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
} from '../utils/strategy-learning';

const journal = (message, className = 'info') => globalObserver.emit('ui.log.notify', { className, message });

/** A blank name in a block means "the strategy currently being learned". */
const resolveName = (state, name) => (String(name ?? '').trim() ? name : state.active);

export default Engine =>
    class StrategyLearning extends Engine {
        constructor() {
            super();
            this.learning_state = createLearningState();
            globalObserver.register('statistics.clear', this.resetLearning.bind(this));
        }

        getLearningState() {
            if (!this.learning_state) this.learning_state = createLearningState();
            return this.learning_state;
        }

        /** The snapshot the blocks read — real session values only. */
        learningSnapshot(name) {
            const state = this.getLearningState();
            const active = resolveName(state, name);
            const stats = strategyStats(state, active);
            return {
                ...stats,
                name: active,
                hit_rate: hitRate(stats),
                sample: sampleSize(stats),
            };
        }

        /** Labels every following settlement with a strategy name. */
        setLearningStrategy(name) {
            this.learning_state = labelStrategy(this.getLearningState(), name);
            const active = this.learning_state.active;
            journal(`Learning: settled trades now count for “${active}”.`);
            return active;
        }

        /** Called by the settlement path with the profit the engine actually booked. */
        recordLearningSettlement({ profit } = {}) {
            this.learning_state = recordLearningOutcome(this.getLearningState(), { profit });
        }

        learnHitRate(name) {
            const state = this.getLearningState();
            return hitRate(strategyStats(state, resolveName(state, name)));
        }

        learnSampleSize(name) {
            const state = this.getLearningState();
            return sampleSize(strategyStats(state, resolveName(state, name)));
        }

        learnStreak(name, kind) {
            const state = this.getLearningState();
            return currentStreak(strategyStats(state, resolveName(state, name)), kind);
        }

        learnBestStrategy(criterion, min_sample) {
            return bestStrategy(this.getLearningState(), { criterion, min_sample });
        }

        learnCompare(a, b, min_sample) {
            return compareStrategies(this.getLearningState(), a, b, min_sample);
        }

        learnReport() {
            return learningSummary(this.getLearningState());
        }

        resetLearning() {
            this.learning_state = createLearningState();
        }
    };
