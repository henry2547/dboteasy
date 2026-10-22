/**
 * Strategy learning behind the "Strategy Learning" blocks.
 *
 * Every number is measured from contracts this session really settled. A trade is attributed to the
 * strategy label the program selected when it was bought, so hit rate, streaks and profit describe
 * what that labelled strategy did — never a simulated or predicted result. The functions are pure so
 * the rules are testable without a socket, and nothing here forecasts the next tick.
 */

export const DEFAULT_STRATEGY = 'default';

const money = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
};

/** A label is trimmed text; an empty label means the session's default strategy. */
const normalizedName = name => {
    const text = String(name ?? '').trim();
    return text || DEFAULT_STRATEGY;
};

/** An untouched strategy: nothing settled, no streak, no profit. */
const emptyStats = () => ({
    trades: 0,
    wins: 0,
    losses: 0,
    profit: 0,
    streak: 0,
    last_outcome: '',
});

/** A fresh session that only knows the default strategy. */
export const createLearningState = () => ({
    active: DEFAULT_STRATEGY,
    strategies: { [DEFAULT_STRATEGY]: emptyStats() },
});

/** Points the next settlement at a strategy label, creating its record when it is new. */
export const labelStrategy = (state, name) => {
    const active = normalizedName(name);
    const strategies = state.strategies[active] ? state.strategies : { ...state.strategies, [active]: emptyStats() };
    return { ...state, active, strategies };
};

/**
 * A contract settled with `profit`. Profit 0 counts as a loss, exactly like the statistics panel
 * (`win = profit > 0`). The streak is signed: positive is a run of wins, negative a run of losses.
 */
export const recordLearningOutcome = (state, { strategy, profit, won } = {}) => {
    const name = normalizedName(strategy ?? state.active);
    const prior = state.strategies[name] ?? emptyStats();
    const settled_profit = money(profit);
    const is_win = typeof won === 'boolean' ? won : settled_profit > 0;
    const streak = is_win ? Math.max(1, prior.streak + 1) : Math.min(-1, prior.streak - 1);

    return {
        ...state,
        strategies: {
            ...state.strategies,
            [name]: {
                trades: prior.trades + 1,
                wins: prior.wins + (is_win ? 1 : 0),
                losses: prior.losses + (is_win ? 0 : 1),
                profit: money(prior.profit + settled_profit),
                streak,
                last_outcome: is_win ? 'win' : 'loss',
            },
        },
    };
};

/** The record for one strategy — never undefined, so callers can read it directly. */
export const strategyStats = (state, name) => state.strategies[normalizedName(name)] ?? emptyStats();

/** Wins as a percentage of settled trades. A strategy with no trades reports 0, not a guess. */
export const hitRate = stats => (stats.trades ? (stats.wins / stats.trades) * 100 : 0);

/** How many trades this run has counted for a strategy. */
export const sampleSize = stats => stats.trades;

/** The current run's length for the requested kind: wins while winning, losses while losing. */
export const currentStreak = (stats, kind) => {
    const wants_losses = kind === 'losses';
    if (wants_losses) return stats.streak < 0 ? -stats.streak : 0;
    return stats.streak > 0 ? stats.streak : 0;
};

const minSample = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.floor(number);
};

/**
 * The strategy that did best by the chosen criterion among those with at least `min_sample`
 * settled trades. Answers '' when nothing qualifies — a strategy with too few trades is never
 * declared the best.
 */
export const bestStrategy = (state, { criterion = 'hit_rate', min_sample = 1 } = {}) => {
    const need = Math.max(1, minSample(min_sample));
    const score = stats => (criterion === 'profit' ? stats.profit : hitRate(stats));
    let best = '';
    let best_score = -Infinity;

    Object.entries(state.strategies).forEach(([name, stats]) => {
        if (stats.trades < need) return;
        const value = score(stats);
        const wins_tie = value === best_score && stats.trades > (state.strategies[best]?.trades ?? 0);
        if (value > best_score || wins_tie) {
            best = name;
            best_score = value;
        }
    });

    return best;
};

/**
 * True only when `a`'s hit rate is strictly higher than `b`'s and both have enough settled trades.
 * Missing samples answer false, so a comparison is never decided on too little evidence.
 */
export const compareStrategies = (state, a, b, min_sample = 1) => {
    const need = Math.max(1, minSample(min_sample));
    const first = strategyStats(state, a);
    const second = strategyStats(state, b);
    if (first.trades < need || second.trades < need) return false;
    return hitRate(first) > hitRate(second);
};

const describeStats = stats =>
    `${stats.trades} trade(s), ${stats.wins}W/${stats.losses}L, ${hitRate(stats).toFixed(1)}% hit rate, profit ${money(
        stats.profit
    ).toFixed(2)}`;

/**
 * One entry per strategy that has settled trades. A session that settled nothing says so instead of
 * showing zeros that look like a measured result.
 */
export const learningSummary = state => {
    const entries = Object.entries(state.strategies).filter(([, stats]) => stats.trades > 0);
    if (!entries.length) return 'Learning: no settled contracts recorded yet.';
    return `Learning: ${entries.map(([name, stats]) => `${name} — ${describeStats(stats)}`).join(' · ')}`;
};
