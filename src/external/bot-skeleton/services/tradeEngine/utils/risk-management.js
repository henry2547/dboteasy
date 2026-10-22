/**
 * Session risk rules behind the Risk Management blocks.
 *
 * Every number is measured from contracts this session really settled: profit comes from the same
 * settlement the statistics use, exposure is the stake the engine actually paid for contracts that
 * are still open, and give-back is profit the session had and no longer has. Nothing here predicts
 * an outcome or invents a balance: when a measurement is unavailable (no authorised balance, no
 * percentage) stake sizing answers 0 with a reason instead of guessing a stake.
 *
 * A limit of 0 means "not set", so an untouched session allows trading.
 */

const money = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
};

const wholeNumber = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.floor(number);
};

const percentage = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(100, number);
};

/** Limits as the blocks accept them; anything unusable becomes "not set" (0). */
export const createRiskLimits = (limits = {}) => ({
    max_consecutive_losses: wholeNumber(limits.max_consecutive_losses),
    max_give_back: money(limits.max_give_back),
    max_exposure: money(limits.max_exposure),
    risk_per_trade_percent: percentage(limits.risk_per_trade_percent),
});

/** A fresh session baseline: nothing traded, no limits set, nothing exposed. */
export const createRiskState = (limits = {}) => ({
    limits: createRiskLimits(limits),
    trades: 0,
    wins: 0,
    losses: 0,
    consecutive_losses: 0,
    consecutive_wins: 0,
    session_profit: 0,
    peak_profit: 0,
    open_stake: 0,
    settled_stake: 0,
});

/** A contract was bought for `stake`: it is exposed until it settles. */
export const recordRiskEntry = (state, stake) => {
    const amount = money(stake);
    if (amount <= 0) return state;
    return { ...state, open_stake: money(state.open_stake + amount) };
};

/**
 * A contract settled with `profit` (sell price − buy price) against `stake`.
 * Profit 0 counts as a loss, exactly like the statistics panel (`win = profit > 0`).
 */
export const recordRiskSettlement = (state, { profit, stake = 0 } = {}) => {
    const settled_profit = money(profit);
    const settled_stake = money(stake);
    const win = settled_profit > 0;
    const session_profit = money(state.session_profit + settled_profit);

    return {
        ...state,
        trades: state.trades + 1,
        wins: state.wins + (win ? 1 : 0),
        losses: state.losses + (win ? 0 : 1),
        consecutive_wins: win ? state.consecutive_wins + 1 : 0,
        consecutive_losses: win ? 0 : state.consecutive_losses + 1,
        session_profit,
        peak_profit: Math.max(state.peak_profit, session_profit),
        open_stake: money(Math.max(0, state.open_stake - settled_stake)),
        settled_stake: money(state.settled_stake + settled_stake),
    };
};

/** Profit the session had at its peak and has since given back (never negative). */
export const giveBack = state => money(Math.max(0, state.peak_profit - state.session_profit));

/** Every limit currently blocking a new trade, as plain-language reasons (empty when allowed). */
export const riskBlockReasons = state => {
    const { limits } = state;
    const reasons = [];

    if (limits.max_consecutive_losses && state.consecutive_losses >= limits.max_consecutive_losses) {
        reasons.push(
            `Risk guard: ${state.consecutive_losses} consecutive loss(es) reached the limit of ${limits.max_consecutive_losses}.`
        );
    }

    const given_back = giveBack(state);
    if (limits.max_give_back && given_back >= limits.max_give_back) {
        reasons.push(
            `Risk guard: ${given_back.toFixed(2)} given back from the ${state.peak_profit.toFixed(
                2
            )} peak profit reached the limit of ${limits.max_give_back.toFixed(2)}.`
        );
    }

    if (limits.max_exposure && state.open_stake >= limits.max_exposure) {
        reasons.push(
            `Risk guard: ${state.open_stake.toFixed(2)} is already exposed, at the limit of ${limits.max_exposure.toFixed(
                2
            )}.`
        );
    }

    return reasons;
};

/** True only when no configured limit is breached. */
export const riskCanTrade = state => riskBlockReasons(state).length === 0;

/**
 * Stake sized from the account balance and a percentage of it, clamped by the exposure limit's
 * remaining room. Answers a stake of 0 with a reason when it cannot be sized honestly, so the
 * caller can stop instead of trading an invented amount.
 */
export const stakeForRisk = ({ balance, percent, max_exposure = 0, open_stake = 0 } = {}) => {
    const account_balance = Number(balance);
    if (!Number.isFinite(account_balance) || account_balance <= 0) {
        return { stake: 0, reason: 'Stake sizing needs an authorised account balance.' };
    }

    const share = percentage(percent);
    if (!share) {
        return { stake: 0, reason: 'Stake sizing needs a risk percentage greater than 0.' };
    }

    let stake = money((account_balance * share) / 100);

    const limit = money(max_exposure);
    if (limit > 0) {
        const room = money(Math.max(0, limit - money(open_stake)));
        if (room <= 0) {
            return { stake: 0, reason: 'The exposure limit leaves no room for another stake.' };
        }
        stake = Math.min(stake, room);
    }

    if (stake <= 0) {
        return { stake: 0, reason: 'A risk percentage this small rounds to no stake at all.' };
    }

    return { stake, reason: '' };
};

/** One-line session report: what was traded, what it made, and whether the guard allows trading. */
export const riskSummary = state => {
    const allowed = riskCanTrade(state);
    const parts = [
        `${state.trades} trade(s) settled`,
        `${state.wins}W/${state.losses}L`,
        `profit ${money(state.session_profit).toFixed(2)}`,
        `give-back ${giveBack(state).toFixed(2)}`,
        `exposure ${money(state.open_stake).toFixed(2)}`,
        allowed ? 'guard allows trading' : 'guard blocks new trades',
    ];
    return parts.join(' · ');
};
