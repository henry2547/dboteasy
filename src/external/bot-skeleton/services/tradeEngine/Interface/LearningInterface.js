/**
 * The strategy-learning surface the generated program talks to.
 *
 * Every entry is a synchronous read (or a state change) of numbers this session really recorded, so
 * a block can sit inside an ordinary condition without suspending the interpreter.
 */
const getLearningInterface = tradeEngine => ({
    learnSetStrategy: name => tradeEngine.setLearningStrategy(name),
    learnHitRate: name => tradeEngine.learnHitRate(name),
    learnSampleSize: name => tradeEngine.learnSampleSize(name),
    learnStreak: (name, kind) => tradeEngine.learnStreak(name, kind),
    learnBestStrategy: (criterion, min_sample) => tradeEngine.learnBestStrategy(criterion, min_sample),
    learnCompare: (a, b, min_sample) => tradeEngine.learnCompare(a, b, min_sample),
    learnReport: () => tradeEngine.learnReport(),
    learnReset: () => tradeEngine.resetLearning(),
});

export default getLearningInterface;
