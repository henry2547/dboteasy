/**
 * Even/Odd strategy rules behind the Digits palette's Even/Odd blocks.
 *
 * Everything here is a pure function over the digits the trade engine genuinely received, so the
 * rolling window, the parity percentages, the threshold test, the BOTH conflict policy and the
 * once-per-signal gate are all measurable without a WebSocket or a login. Nothing invents a tick:
 * a window that is not full is "not ready" and never signals, and a percentage below the threshold
 * never qualifies.
 */

export const EO_DEFAULT_TICKS = 20;
export const EO_DEFAULT_PERCENT = 65;
/** Ticks read from each market's own history when a scan compares the parity of every market. */
export const EO_BEST_MARKET_TICKS = 100;
export const EO_MIN_TICKS = 1;
/** Sanity cap: the window is a rolling slice of the live feed, never an unbounded buffer. */
export const EO_MAX_TICKS = 1000;
/**
 * The two rules a window can resolve its signal with. `threshold` reads the parity share of the
 * whole window; `reversal` reads a run of same-parity digits and buys the OPPOSITE parity.
 */
export const EO_RULE_THRESHOLD = 'threshold';
export const EO_RULE_REVERSAL = 'reversal';
export const EO_SIGNAL_RULES = [EO_RULE_THRESHOLD, EO_RULE_REVERSAL];
/** The parity run the reversal rule reads by default — the last 2 digits. */
export const EO_DEFAULT_RUN = 2;
export const EO_MAX_RUN = 100;
export const EO_DIRECTIONS = ['even', 'odd', 'both'];
export const EO_EVEN = 'EVEN';
export const EO_ODD = 'ODD';
export const EO_NO_SIGNAL = 'NO SIGNAL';
/** The contract type each direction buys — an ODD signal never asks for an EVEN contract. */
export const EO_CONTRACT_TYPES = { even: 'DIGITEVEN', odd: 'DIGITODD' };
/** How many signal identifiers are kept to stop a repeated entry on the same signal. */
export const EO_MAX_REMEMBERED_SIGNALS = 200;

export const EO_CONFLICT_POLICY =
    'when BOTH qualifies, the higher parity percentage wins and an exact tie resolves to EVEN';

/** Digits only, as whole numbers 0–9 — anything else is ignored rather than guessed at. */
export const toDigitList = digits => {
    if (!Array.isArray(digits)) return [];
    return digits
        .map(value => Number(value))
        .filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9);
};

export const normalizeParity = value => (String(value ?? '').toLowerCase() === 'odd' ? 'odd' : 'even');

export const normalizeDirection = value => {
    const direction = String(value ?? '').toLowerCase();
    return EO_DIRECTIONS.includes(direction) ? direction : 'both';
};

export const normalizeRule = value =>
    String(value ?? '').toLowerCase() === EO_RULE_REVERSAL ? EO_RULE_REVERSAL : EO_RULE_THRESHOLD;

/** The digits a reversal reads: a whole number of at least two, capped like the window. */
export const resolveReversalRun = value => {
    const wanted = Number(value);
    if (!Number.isInteger(wanted) || wanted < EO_DEFAULT_RUN) return EO_DEFAULT_RUN;
    return Math.min(wanted, EO_MAX_RUN);
};

export const createEvenOddConfig = () => ({
    ticks: EO_DEFAULT_TICKS,
    percent: EO_DEFAULT_PERCENT,
    direction: 'both',
    rule: EO_RULE_THRESHOLD,
    run: EO_DEFAULT_RUN,
});

/**
 * Validates what the "Configure Even/Odd strategy" block carries. An unusable value falls back to
 * the documented default and is reported, so a mistake is visible in the run log instead of being
 * traded on.
 */
export const validateEvenOddConfig = ({ ticks, percent, direction, rule, run } = {}) => {
    const errors = [];

    const wanted_ticks = Number(ticks);
    const ticks_ok = Number.isInteger(wanted_ticks) && wanted_ticks >= EO_MIN_TICKS && wanted_ticks <= EO_MAX_TICKS;
    if (!ticks_ok) {
        errors.push(
            `Ticks to monitor must be a whole number between ${EO_MIN_TICKS} and ${EO_MAX_TICKS}; "${ticks}" is not, so ${EO_DEFAULT_TICKS} ticks is used.`
        );
    }

    const wanted_percent = Number(percent);
    const percent_ok = Number.isFinite(wanted_percent) && wanted_percent > 0 && wanted_percent <= 100;
    if (!percent_ok) {
        errors.push(
            `The percentage threshold must be greater than 0 and no more than 100; "${percent}" is not, so ${EO_DEFAULT_PERCENT}% is used.`
        );
    }

    const wanted_direction = String(direction ?? '').toLowerCase();
    const direction_ok = EO_DIRECTIONS.includes(wanted_direction);
    if (!direction_ok) {
        errors.push(
            `Signal direction must be EVEN, ODD or BOTH; "${direction}" is not, so BOTH is used.`
        );
    }

    const wanted_rule = String(rule ?? EO_RULE_THRESHOLD).toLowerCase();
    const rule_ok = EO_SIGNAL_RULES.includes(wanted_rule);
    if (!rule_ok) {
        errors.push(
            `The signal rule must be THRESHOLD or REVERSAL; "${rule}" is not, so THRESHOLD is used.`
        );
    }

    return {
        ok: errors.length === 0,
        errors,
        config: {
            ticks: ticks_ok ? wanted_ticks : EO_DEFAULT_TICKS,
            percent: percent_ok ? wanted_percent : EO_DEFAULT_PERCENT,
            direction: direction_ok ? wanted_direction : 'both',
            rule: rule_ok ? wanted_rule : EO_RULE_THRESHOLD,
            run: resolveReversalRun(run),
        },
    };
};

/** Even and odd counts of a plain list of last digits. */
export const parityCounts = digits => {
    const list = toDigitList(digits);
    const even = list.filter(digit => digit % 2 === 0).length;
    return { even, odd: list.length - even, total: list.length };
};

/**
 * Even/odd percentage of the window: `(count × 100) / total`.
 *
 * Multiplying first keeps a whole-number window exact — 13 of 20 even is 65, not 65.00000000000001 —
 * so "at least 65%" means exactly 65% qualifies.
 */
export const parityPercentages = digits => {
    const { even, odd, total } = parityCounts(digits);
    if (!total) return { even: 0, odd: 0, total: 0 };
    return { even: (even * 100) / total, odd: (odd * 100) / total, total };
};

/**
 * The parity split of one sample of digits: which parity leads, its share of the sample and how far
 * the two parities are apart. `null` for an empty sample, so nothing is ever compared on no data.
 *
 * This describes the ticks already seen — it is never a forecast of the next digit.
 */
export const paritySplit = digits => {
    const list = toDigitList(digits);
    if (!list.length) return null;

    const { even, odd, total } = parityCounts(list);
    const parity = even >= odd ? 'even' : 'odd';
    const winner = parity === 'even' ? even : odd;

    return {
        total,
        even,
        odd,
        parity,
        evenPercent: (even * 100) / total,
        oddPercent: (odd * 100) / total,
        share: (winner * 100) / total,
        margin: (Math.abs(even - odd) * 100) / total,
    };
};

/** One plain-language line for a measured split, for the journal. */
export const describeParitySplit = split =>
    split
        ? `${split.parity} ${split.share}% over ${split.total} tick(s) (even ${split.evenPercent}% · odd ${split.oddPercent}%)`
        : 'no ticks to measure';

/**
 * The number of ticks a best-market scan reads from each market, clamped to the same range the
 * rolling window accepts. A missing or unusable number falls back to `EO_BEST_MARKET_TICKS`.
 */
export const resolveBestMarketSample = value => {
    const wanted = Number(value);
    if (!Number.isInteger(wanted) || wanted < EO_MIN_TICKS) return EO_BEST_MARKET_TICKS;
    return Math.min(wanted, EO_MAX_TICKS);
};

/**
 * Orders measured markets by how lopsided their parity split is: the market whose leading parity
 * holds the largest share of its own sample comes first, a larger sample breaking a tie. Every
 * entry keeps the measurement it was ranked on, so the choice can always be checked against it.
 */
export const rankParityMarkets = (measurements = []) =>
    (Array.isArray(measurements) ? measurements : [])
        .filter(entry => entry && entry.symbol && entry.split && Number.isFinite(entry.split.share))
        .slice()
        .sort((a, b) => b.split.share - a.split.share || b.split.total - a.split.total)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

/** True only for a measured percentage at or above the threshold — never for missing data. */
export const meetsThreshold = (percentage, threshold) => {
    const value = Number(percentage);
    const limit = Number(threshold);
    if (!Number.isFinite(value) || !Number.isFinite(limit)) return false;
    return value >= limit;
};

/**
 * The signal the configured direction really produces from the observed percentages.
 *
 * BOTH never submits two opposite purchases for one signal: it resolves to the higher parity and
 * reports the conflict in its reason (a tie resolves to EVEN, deterministically).
 */
export const resolveSignal = ({ evenPercent, oddPercent, threshold, direction } = {}) => {
    const config_direction = normalizeDirection(direction);
    const limit = Number(threshold);
    const even_meets = meetsThreshold(evenPercent, limit);
    const odd_meets = meetsThreshold(oddPercent, limit);
    const observed = `even ${evenPercent}%, odd ${oddPercent}%`;

    if (config_direction === 'even') {
        return even_meets
            ? { direction: EO_EVEN, reason: `even ${evenPercent}% reached the ${limit}% threshold` }
            : { direction: EO_NO_SIGNAL, reason: `even ${evenPercent}% is below the ${limit}% threshold (${observed})` };
    }

    if (config_direction === 'odd') {
        return odd_meets
            ? { direction: EO_ODD, reason: `odd ${oddPercent}% reached the ${limit}% threshold` }
            : { direction: EO_NO_SIGNAL, reason: `odd ${oddPercent}% is below the ${limit}% threshold (${observed})` };
    }

    if (even_meets && odd_meets) {
        const winner = Number(oddPercent) > Number(evenPercent) ? EO_ODD : EO_EVEN;
        return {
            direction: winner,
            conflict: true,
            reason: `both parities reached ${limit}% (${observed}) — ${EO_CONFLICT_POLICY}, resolved to ${winner}`,
        };
    }
    if (even_meets) return { direction: EO_EVEN, reason: `even ${evenPercent}% reached the ${limit}% threshold` };
    if (odd_meets) return { direction: EO_ODD, reason: `odd ${oddPercent}% reached the ${limit}% threshold` };

    return { direction: EO_NO_SIGNAL, reason: `neither parity reached ${limit}% (${observed})` };
};

/**
 * The recovery rule: a run of same-parity digits is expected to break, so the OPPOSITE parity is
 * bought — the last `run` digits all even → ODD, all odd → EVEN. A mixed run is no signal at all.
 *
 * The configured direction limits which reversal may be bought (`both` allows either), so an ODD
 * setup never buys EVEN. Nothing here reads the future: the run is the digits already received.
 */
export const resolveReversalSignal = (digits, { run = EO_DEFAULT_RUN, direction = 'both' } = {}) => {
    const list = toDigitList(digits);
    const size = resolveReversalRun(run);
    if (list.length < size) {
        return {
            direction: EO_NO_SIGNAL,
            reason: `only ${list.length} of the last ${size} digit(s) collected`,
        };
    }

    const window = list.slice(-size);
    const evens = window.filter(digit => digit % 2 === 0).length;
    if (evens !== 0 && evens !== size) {
        return {
            direction: EO_NO_SIGNAL,
            reason: `the last ${size} digits (${window.join(', ')}) are mixed, so there is no run to reverse`,
        };
    }

    const run_parity = evens === size ? 'even' : 'odd';
    const wanted = run_parity === 'even' ? EO_ODD : EO_EVEN;
    const allowed = normalizeDirection(direction);
    if (allowed !== 'both' && allowed !== wanted.toLowerCase()) {
        return {
            direction: EO_NO_SIGNAL,
            reason: `the last ${size} digits (${window.join(', ')}) are all ${run_parity}, so ${wanted} is bought — outside the configured ${allowed.toUpperCase()} side`,
        };
    }

    return {
        direction: wanted,
        reason: `the last ${size} digits (${window.join(', ')}) are all ${run_parity}, so ${wanted} is bought`,
    };
};

/** The window size the strategy actually monitors: the monitor block's number, else the config. */
export const evenOddWindowSize = state => {
    const size = Number(state?.window_size);
    const monitored =
        Number.isInteger(size) && size >= EO_MIN_TICKS && size <= EO_MAX_TICKS
            ? size
            : Number(state?.config?.ticks) || EO_DEFAULT_TICKS;
    // The reversal rule only ever reads the last `run` digits, so a smaller window would never
    // become ready: the monitored window is widened to the run it has to hold.
    if (normalizeRule(state?.config?.rule) === EO_RULE_REVERSAL) {
        return Math.max(monitored, resolveReversalRun(state?.config?.run));
    }
    return monitored;
};

export const createEvenOddState = () => ({
    config: createEvenOddConfig(),
    /** The rolling window: genuine digits in arrival order, newest last. */
    window: [],
    window_size: 0,
    monitoring: false,
    last_epoch: null,
    symbol: '',
    /** Set when continuity could not be trusted; cleared by the next accepted tick. */
    stale: false,
    one_entry_per_signal: false,
    /** Signal identifiers already used, newest first. */
    used_signals: [],
    last_purchase: null,
});

export const configureEvenOdd = (state, next) => {
    const { config, errors, ok } = validateEvenOddConfig(next);
    return { state: { ...state, config }, errors, ok };
};

/**
 * Arms the rolling window. Re-arming with the same size keeps what was already collected, so the
 * block can sit inside the trade loop without throwing the window away on every pass.
 */
export const startEvenOddMonitoring = (state, ticks) => {
    const wanted = Number(ticks);
    const usable = Number.isInteger(wanted) && wanted >= EO_MIN_TICKS && wanted <= EO_MAX_TICKS;
    const requested = usable ? wanted : evenOddWindowSize({ ...state, window_size: 0 });
    // The reversal rule reads a run of digits, so the armed window is at least that long.
    const size = evenOddWindowSize({ ...state, window_size: requested });

    if (state.monitoring && state.window_size === size) return state;

    return { ...state, monitoring: true, window_size: size, window: [], last_epoch: null, stale: false };
};

/**
 * Adds one genuine tick to the window.
 *
 * A repeated epoch is dropped (the same tick is never processed twice), an epoch older than the
 * newest one invalidates the window (continuity cannot be trusted), and a different market starts a
 * fresh window — the previous market's digits never count towards the new one.
 */
export const feedEvenOddTick = (state, { digit, epoch, symbol } = {}) => {
    const value = Number(digit);
    if (!Number.isInteger(value) || value < 0 || value > 9) {
        return { state: { ...state, stale: true }, accepted: false, reason: 'unusable digit' };
    }

    const tick_epoch = Number(epoch);
    if (!Number.isFinite(tick_epoch)) {
        return { state: { ...state, stale: true }, accepted: false, reason: 'missing tick epoch' };
    }

    const next_symbol = symbol || state.symbol;
    if (state.symbol && next_symbol && next_symbol !== state.symbol) {
        const size = evenOddWindowSize(state);
        return {
            state: { ...state, symbol: next_symbol, window: [value].slice(-size), last_epoch: tick_epoch, stale: false },
            accepted: true,
            reason: 'market changed — window restarted',
        };
    }

    if (tick_epoch === state.last_epoch) {
        return { state, accepted: false, reason: 'tick already processed' };
    }

    if (state.last_epoch !== null && tick_epoch < state.last_epoch) {
        return {
            state: { ...state, window: [], last_epoch: null, stale: true },
            accepted: false,
            reason: 'tick arrived out of order — window invalidated',
        };
    }

    const size = evenOddWindowSize(state);
    const window = [...state.window, value].slice(-size);
    return { state: { ...state, symbol: next_symbol, window, last_epoch: tick_epoch, stale: false }, accepted: true };
};

export const invalidateEvenOdd = (state, reason = 'feed interrupted') => ({
    ...state,
    window: [],
    last_epoch: null,
    stale: true,
    invalid_reason: reason,
});

/**
 * What the blocks read. `ready` is true only for a full window of genuine ticks on a live
 * connection, so an incomplete, stale or disconnected feed never produces a signal.
 */
export const evenOddSnapshot = (state, { connected = true } = {}) => {
    const size = evenOddWindowSize(state);
    const window = toDigitList(state.window).slice(-size);
    const { even, odd, total } = parityPercentages(window);
    const ready = Boolean(state.monitoring) && size > 0 && total >= size && !state.stale && connected;
    const rule = normalizeRule(state?.config?.rule);
    const run = resolveReversalRun(state?.config?.run);

    const signal = ready
        ? rule === EO_RULE_REVERSAL
            ? resolveReversalSignal(window, { run, direction: state.config.direction })
            : resolveSignal({
                  evenPercent: even,
                  oddPercent: odd,
                  threshold: state.config.percent,
                  direction: state.config.direction,
              })
        : {
              direction: EO_NO_SIGNAL,
              reason:
                  rule === EO_RULE_REVERSAL
                      ? `only ${total} of the last ${run} digit(s) collected`
                      : 'the tick window is not complete yet',
          };

    return {
        ready,
        monitoring: Boolean(state.monitoring),
        symbol: state.symbol || '',
        window: size,
        collected: total,
        digits: window,
        evenPercent: even,
        oddPercent: odd,
        threshold: state.config.percent,
        rule,
        run,
        configuredDirection: normalizeDirection(state.config.direction),
        stale: Boolean(state.stale),
        connected,
        signal: signal.direction,
        signalReason: signal.reason,
        conflict: Boolean(signal.conflict),
    };
};

/**
 * A stable identifier for one signal event: the market, the window and threshold it was read with,
 * the configured direction and the tick it was observed on. A new tick is a new signal; the same
 * tick is the same one.
 */
export const signalKey = ({ symbol, window, threshold, direction, epoch } = {}) =>
    [symbol || 'unknown-market', `${window}t`, `${threshold}%`, normalizeDirection(direction), epoch ?? 'no-tick'].join('|');

export const signalUsed = (state, key) => state.used_signals.includes(key);

export const rememberSignal = (state, key) => {
    if (!key || state.used_signals.includes(key)) return state;
    return { ...state, used_signals: [key, ...state.used_signals].slice(0, EO_MAX_REMEMBERED_SIGNALS) };
};

/** The parity the observed digits point at, used to describe a decision in the journal. */
export const describeWindow = snapshot =>
    snapshot.rule === EO_RULE_REVERSAL
        ? `${snapshot.collected}/${snapshot.window} ${snapshot.symbol || 'market'} ticks · last ${snapshot.run}: ${
              (snapshot.digits || []).slice(-snapshot.run).join(', ') || '—'
          } · reversal rule`
        : `${snapshot.collected}/${snapshot.window} ${snapshot.symbol || 'market'} ticks · even ${snapshot.evenPercent}% · odd ${snapshot.oddPercent}% · threshold ${snapshot.threshold}%`;
