/**
 * Session tracking behind the "Trading & Execution", "Bot Control" and "Reporting" blocks.
 *
 * Every number describes contracts this session really took and really settled: a trade is counted
 * when the engine bought it, a result exists only after the engine booked the settlement. Nothing
 * here predicts or estimates — before the first settlement the last result is empty and a report
 * says so instead of showing a win or loss that never happened.
 *
 * The open-contract count is not tracked here: the engine itself already knows whether a contract is
 * open (`contractId`), so the runtime asks it directly rather than keeping a second copy that could
 * drift.
 */

const money = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
};

const count = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.floor(number);
};

/** A fresh session: nothing taken, nothing settled, no result yet. */
export const createSessionState = () => ({
    bought: 0,
    settled: 0,
    wins: 0,
    losses: 0,
    profit: 0,
    last_result: '',
    last_profit: 0,
    last_stake: 0,
    stopped_reason: '',
});

/** The engine bought one contract: the trade is taken, whatever happens next. */
export const recordSessionEntry = state => ({ ...state, bought: state.bought + 1 });

/**
 * A contract settled with `profit` (sell price − buy price). Profit 0 counts as a loss, exactly like
 * the statistics panel (`win = profit > 0`).
 */
export const recordSessionSettlement = (state, { profit, stake = 0 } = {}) => {
    const settled_profit = money(profit);
    const win = settled_profit > 0;

    return {
        ...state,
        settled: state.settled + 1,
        wins: state.wins + (win ? 1 : 0),
        losses: state.losses + (win ? 0 : 1),
        profit: money(state.profit + settled_profit),
        last_result: win ? 'win' : 'loss',
        last_profit: settled_profit,
        last_stake: money(stake),
    };
};

/** The last settled result (`win` | `loss`), or '' when nothing has settled yet. */
export const lastTradeResult = state => state.last_result;

/** True once the session has taken `limit` contracts; a limit of 0 is "not set" (never reached). */
export const tradeLimitReached = (state, limit) => {
    const max = count(limit);
    return max > 0 && state.bought >= max;
};

/** A stop reason is trimmed text; an empty reason still stops, with a plain-language default. */
export const normalizeStopReason = reason => {
    const text = String(reason ?? '').trim();
    return text || 'Stopped by the program.';
};

const JOURNAL_LEVELS = ['info', 'warn', 'error'];

/** Journal levels the run log understands; anything else becomes an ordinary info line. */
export const journalLevel = level => (JOURNAL_LEVELS.includes(level) ? level : 'info');

/**
 * One-line session report: what the session took, settled, won and made, plus the contracts still
 * open. A session that has taken nothing says exactly that rather than reporting zeros as a result.
 */
export const sessionSummary = (state, { symbol = '', currency = '', open = 0 } = {}) => {
    const where = symbol ? ` on ${symbol}` : '';
    const open_count = count(open);
    if (!state.bought && !open_count) return `Session${where}: no contracts taken yet.`;

    const parts = [
        `${state.bought} contract(s) taken`,
        `${state.settled} settled`,
        `${state.wins}W/${state.losses}L`,
        `profit ${money(state.profit).toFixed(2)}${currency ? ` ${currency}` : ''}`,
        `${open_count} open`,
    ];

    return `Session${where}: ${parts.join(' · ')}.`;
};
