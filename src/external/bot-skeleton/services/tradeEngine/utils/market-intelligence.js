/**
 * The market-intelligence rules behind the "Market Intelligence" blocks.
 *
 * Everything here is pure: it reads numbers the trade engine genuinely observed (tick counts,
 * tick epochs, the discovered market pool, completed virtual observations) and turns them into a
 * structured readiness result, a ranking that states its basis per market, and a cooldown list.
 * It imports nothing — no Blockly, no API services — so it can be unit-tested on its own and
 * imported by block definitions without pulling the network into the Blockly bundle.
 *
 * Two rules are deliberate and must not be relaxed:
 * - A ranking describes measurements; it never claims anything about the future. The only criterion
 *   that touches outcomes (`observed_outcomes`) reports completed *virtual* observations and is
 *   refused outright below `MIN_PERFORMANCE_SAMPLE`, so a thin sample can never top the list.
 * - A cooldown may never hide a data-quality or account problem. Reasons that describe such a
 *   problem (`CRITICAL_EXCLUSION_REASONS`) are refused, and the caller reports them as errors.
 */

/** One entry per readiness check a market has to pass. */
export const MARKET_READINESS_CHECK = Object.freeze({
    METADATA: 'metadata',
    HISTORY: 'history',
    SUBSCRIPTION: 'subscription',
    FRESHNESS: 'freshness',
    CONNECTION: 'connection',
    CONTRACT: 'contract',
});

/** Genuine ticks a market must already hold before its statistics may be read. */
export const MIN_READINESS_HISTORY = 20;
/** How old the newest genuine tick may be, in seconds, for the market to count as fresh. */
export const FRESH_TICK_MAX_AGE_SECONDS = 15;
/** Completed virtual observations required before an outcome rate is used at all. */
export const MIN_PERFORMANCE_SAMPLE = 30;

/**
 * The ranking criteria the palette offers. Every criterion names the measurement it uses, so the
 * reason line can always say what a position was based on.
 */
export const MARKET_RANK_CRITERIA = Object.freeze({
    READINESS: 'readiness',
    TICK_SAMPLE: 'tick_sample',
    ENTRY: 'entry',
    FREQUENCY_STABILITY: 'frequency_stability',
    OBSERVED_OUTCOMES: 'observed_outcomes',
});

export const MARKET_RANK_CRITERION_LABELS = Object.freeze({
    [MARKET_RANK_CRITERIA.READINESS]: 'readiness checks passed',
    [MARKET_RANK_CRITERIA.TICK_SAMPLE]: 'genuine ticks available in this session',
    [MARKET_RANK_CRITERIA.ENTRY]: 'entry condition met on the latest tick',
    [MARKET_RANK_CRITERIA.FREQUENCY_STABILITY]: 'digit-share spread across the window (steadier first)',
    [MARKET_RANK_CRITERIA.OBSERVED_OUTCOMES]:
        'observed outcome rate of completed virtual observations (historical, never a forecast)',
});

/**
 * Reasons that describe a broken feed or an account/permission problem. A cooldown must never be
 * used to silence one of these: the caller journals the error and keeps the market visible instead.
 */
export const CRITICAL_EXCLUSION_REASONS = Object.freeze([
    'data unavailable',
    'no tick history',
    'feed disconnected',
    'account permission',
    'contract not offered',
]);

/** The cooldown store: one entry per market that is temporarily excluded. */
export const createCooldownStore = () => ({ entries: [] });

const percent = share => Number((Number(share) * 100).toFixed(2));

const tickAgeSeconds = (last_tick_epoch, now) => {
    const epoch = Number(last_tick_epoch);
    if (!Number.isFinite(epoch) || epoch <= 0) return null;
    return Math.max(0, (Number(now) - epoch * 1000) / 1000);
};

/** True when a reason describes a problem a cooldown must not hide. */
export const isCriticalExclusion = reason => {
    const text = String(reason ?? '').toLowerCase();
    return CRITICAL_EXCLUSION_REASONS.some(phrase => text.includes(phrase));
};

/**
 * Structured readiness of one market.
 *
 * Input is measured state only — never an assumption: `metadata_available`, `tick_count`,
 * `last_tick_epoch`, `subscription_active`, `connected`, `now`, and an optional already-resolved
 * `contract_check` (`{ supported, reason }`).
 *
 * Returns `{ symbol, display_name, ready, checks, passed, total, reason }`; `reason` names the
 * first failure in plain words, so a block can journal why the market was refused.
 */
export const evaluateMarketReadiness = ({
    symbol = '',
    display_name = '',
    metadata_available = true,
    metadata_reason = '',
    tick_count = 0,
    last_tick_epoch = 0,
    now = Date.now(),
    subscription_active = false,
    connected = false,
    contract_check = null,
    required_history = MIN_READINESS_HISTORY,
} = {}) => {
    const ticks = Number(tick_count) || 0;
    const required = Number(required_history) || MIN_READINESS_HISTORY;
    const age = tickAgeSeconds(last_tick_epoch, now);

    const checks = [
        {
            id: MARKET_READINESS_CHECK.METADATA,
            label: 'Market metadata',
            ok: metadata_available !== false,
            detail:
                metadata_available === false
                    ? metadata_reason || 'Market metadata is unavailable'
                    : 'Metadata loaded',
        },
        {
            id: MARKET_READINESS_CHECK.HISTORY,
            label: 'Genuine tick history',
            ok: ticks >= required,
            detail: `${ticks} genuine tick(s), ${required} required`,
        },
        {
            id: MARKET_READINESS_CHECK.SUBSCRIPTION,
            label: 'Live tick subscription',
            ok: Boolean(subscription_active),
            detail: subscription_active ? 'Subscribed to this market' : 'No live subscription for this market',
        },
        {
            id: MARKET_READINESS_CHECK.FRESHNESS,
            label: 'Data freshness',
            ok: age !== null && age <= FRESH_TICK_MAX_AGE_SECONDS,
            detail:
                age === null
                    ? 'No genuine tick has been observed yet'
                    : `Newest tick is ${age.toFixed(1)}s old (limit ${FRESH_TICK_MAX_AGE_SECONDS}s)`,
        },
        {
            id: MARKET_READINESS_CHECK.CONNECTION,
            label: 'Feed connection',
            ok: Boolean(connected),
            detail: connected ? 'Feed connected' : 'Feed is disconnected',
        },
        {
            id: MARKET_READINESS_CHECK.CONTRACT,
            label: 'Contract compatibility',
            ok: contract_check ? Boolean(contract_check.supported) : true,
            detail: !contract_check
                ? 'Not checked — no contract types were configured'
                : contract_check.supported
                  ? 'The market offers the configured contract types'
                  : contract_check.reason || 'The market does not offer the configured contract types',
        },
    ];

    const failed = checks.find(check => !check.ok);
    return {
        symbol,
        display_name,
        ready: !failed,
        checks,
        passed: checks.filter(check => check.ok).length,
        total: checks.length,
        reason: failed ? `${failed.label}: ${failed.detail}` : '',
    };
};

/**
 * Ranks the eligible markets by one measurable criterion.
 *
 * Every entry is `{ symbol, display_name, ready_checks: { passed, total }, tick_count, entry_met,
 * frequencies, observed: { sample, outcome_rate } }` — all optional except the symbol. A market
 * that cannot be measured for the chosen criterion comes back in `unranked` with the reason; it is
 * never given an invented score.
 */
export const rankEligibleMarkets = (entries = [], criterion = MARKET_RANK_CRITERIA.READINESS, options = {}) => {
    const min_sample = Number(options.min_sample) || MIN_PERFORMANCE_SAMPLE;
    const now = Number(options.now) || Date.now();
    const ranked = [];
    const unranked = [];

    (Array.isArray(entries) ? entries : []).forEach(entry => {
        const market = entry || {};
        const symbol = market.symbol || '(unknown market)';
        const display_name = market.display_name || symbol;
        const ticks = Number(market.tick_count) || 0;
        const measured = value => ({ symbol, display_name, value, rank: 0 });

        switch (criterion) {
            case MARKET_RANK_CRITERIA.TICK_SAMPLE: {
                ranked.push(
                    Object.assign(measured(ticks), {
                        basis: `ticks=${ticks}`,
                        reason: `${ticks} genuine tick(s) observed on this market in this session`,
                    })
                );
                break;
            }
            case MARKET_RANK_CRITERIA.ENTRY: {
                if (typeof market.entry_met !== 'boolean') {
                    unranked.push({
                        symbol,
                        display_name,
                        reason: 'The entry condition was not evaluated on this market',
                    });
                    break;
                }
                ranked.push(
                    Object.assign(measured(market.entry_met ? 1 : 0), {
                        basis: `entry_met=${market.entry_met}`,
                        reason: market.entry_met
                            ? 'The entry condition passed on this market’s latest tick'
                            : 'The entry condition did not pass on this market’s latest tick',
                    })
                );
                break;
            }
            case MARKET_RANK_CRITERIA.FREQUENCY_STABILITY: {
                const shares = (Array.isArray(market.frequencies) ? market.frequencies : [])
                    .map(Number)
                    .filter(Number.isFinite);
                if (shares.length < 2) {
                    unranked.push({
                        symbol,
                        display_name,
                        reason: 'Digit frequency was not measured on this market',
                    });
                    break;
                }
                const spread = Number(((Math.max(...shares) - Math.min(...shares)) * 100).toFixed(2));
                ranked.push(
                    Object.assign(measured(spread), {
                        basis: `spread=${spread}pp`,
                        reason: `Digit shares span ${percent(Math.min(...shares))}%–${percent(
                            Math.max(...shares)
                        )}% (spread ${spread}pp — steadier first, not a profit measure)`,
                    })
                );
                break;
            }
            case MARKET_RANK_CRITERIA.OBSERVED_OUTCOMES: {
                const observed = market.observed || {};
                const sample = Number(observed.sample) || 0;
                if (!(sample >= min_sample)) {
                    unranked.push({
                        symbol,
                        display_name,
                        reason: `Only ${sample} completed virtual observation(s) — this criterion needs at least ${min_sample}`,
                    });
                    break;
                }
                const rate = Number(observed.outcome_rate);
                if (!Number.isFinite(rate)) {
                    unranked.push({
                        symbol,
                        display_name,
                        reason: 'The observed outcome rate was not measured on this market',
                    });
                    break;
                }
                ranked.push(
                    Object.assign(measured(rate), {
                        basis: `sample=${sample}, outcome_rate=${percent(rate)}%`,
                        reason: `Observed outcome rate ${percent(rate)}% over ${sample} completed virtual observation(s) — this session’s history, not a forecast of the next tick`,
                    })
                );
                break;
            }
            case MARKET_RANK_CRITERIA.READINESS:
            default: {
                const checks = market.ready_checks || {};
                const total = Number(checks.total) || 0;
                const passed = Number(checks.passed) || 0;
                if (!total) {
                    unranked.push({ symbol, display_name, reason: 'Readiness was not measured on this market' });
                    break;
                }
                ranked.push(
                    Object.assign(measured(Number((passed / total).toFixed(4))), {
                        basis: `checks=${passed}/${total}`,
                        reason: `${passed} of ${total} readiness check(s) passed`,
                    })
                );
                break;
            }
        }
    });

    // Lower spread is steadier; every other criterion is better when larger.
    const ascending = criterion === MARKET_RANK_CRITERIA.FREQUENCY_STABILITY;
    ranked.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
    ranked.forEach((item, index) => {
        item.rank = index + 1;
        item.measured_at = now;
    });

    return {
        criterion,
        criterion_label: MARKET_RANK_CRITERION_LABELS[criterion] || String(criterion),
        ranked,
        unranked,
    };
};

/**
 * Applies a cooldown to one market.
 *
 * `cycles` counts scan cycles and `minutes` a wall-clock period; either may be 0, both may be set.
 * Returns `{ applied: false, critical: true, reason }` when the reason describes a data-quality or
 * account problem, so the caller can report that error instead of hiding the market.
 */
export const setMarketCooldown = (store, options = {}) => {
    const target = store?.entries ? store : createCooldownStore();
    const {
        symbol = '',
        display_name = '',
        reason = 'Cooling down',
        cycles = 0,
        minutes = 0,
        source = 'block',
        now = Date.now(),
    } = options;

    if (!symbol) return { applied: false, reason: 'No market was given for the cooldown' };

    if (isCriticalExclusion(reason)) {
        return {
            applied: false,
            critical: true,
            reason: `Cooldown refused: “${reason}” describes a data or account problem, which must be reported rather than hidden`,
        };
    }

    const cycle_count = Math.max(0, Math.floor(Number(cycles) || 0));
    const minute_count = Math.max(0, Number(minutes) || 0);
    if (!cycle_count && !minute_count) {
        return { applied: false, reason: 'A cooldown needs a number of scan cycles or minutes greater than 0' };
    }

    const entry = {
        symbol,
        display_name: display_name || symbol,
        reason,
        source,
        cycles_remaining: cycle_count,
        expires_at: minute_count ? Number(now) + minute_count * 60_000 : 0,
        cooling_minutes: minute_count,
        created_at: Number(now),
    };

    target.entries = target.entries.filter(item => item.symbol !== symbol);
    target.entries.push(entry);
    return { applied: true, entry };
};

/** True while the market is inside a cooldown, with the entry that excludes it. */
export const isMarketCooling = (store, symbol, options = {}) => {
    const now = Number(options.now) || Date.now();
    const entry = (store?.entries || []).find(item => item.symbol === symbol);
    if (!entry) return { cooling: false, entry: null };

    const by_time = entry.expires_at > now;
    const by_cycles = entry.cycles_remaining > 0;
    return {
        cooling: by_time || by_cycles,
        entry: {
            ...entry,
            active: by_time || by_cycles,
            remaining_seconds: by_time ? Math.ceil((entry.expires_at - now) / 1000) : 0,
        },
    };
};

/**
 * Advances every cycle-based cooldown by one completed scan cycle and drops the entries that are
 * now spent. Returns the entries that were released, so the caller can journal them.
 */
export const consumeScanCycle = (store, options = {}) => {
    const now = Number(options.now) || Date.now();
    const released = [];
    const kept = [];

    (store?.entries || []).forEach(entry => {
        const decremented = { ...entry, cycles_remaining: Math.max(0, entry.cycles_remaining - 1) };
        if (!(decremented.expires_at > now) && decremented.cycles_remaining <= 0) {
            released.push({ ...decremented, released_at: now });
            return;
        }
        kept.push(decremented);
    });

    if (store) store.entries = kept;
    return released;
};

/** The currently excluded markets, with why each one is out and for how much longer. */
export const listCoolingMarkets = (store, options = {}) => {
    const now = Number(options.now) || Date.now();
    return (store?.entries || []).map(entry => ({
        symbol: entry.symbol,
        display_name: entry.display_name || entry.symbol,
        reason: entry.reason,
        source: entry.source,
        cycles_remaining: entry.cycles_remaining,
        minutes_remaining: entry.expires_at > now ? Math.ceil((entry.expires_at - now) / 60_000) : 0,
        active: entry.expires_at > now || entry.cycles_remaining > 0,
    }));
};
