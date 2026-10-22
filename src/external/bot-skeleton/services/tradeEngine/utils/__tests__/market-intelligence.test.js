/**
 * The market-intelligence rules, tested in isolation.
 *
 * These are the rules the "Market Intelligence" blocks promise: readiness that fails closed,
 * rankings that state their basis and refuse to score an unmeasured market, and cooldowns that can
 * never hide a data or account problem.
 */
import {
    MARKET_RANK_CRITERIA,
    MARKET_READINESS_CHECK,
    consumeScanCycle,
    createCooldownStore,
    evaluateMarketReadiness,
    isCriticalExclusion,
    isMarketCooling,
    listCoolingMarkets,
    rankEligibleMarkets,
    setMarketCooldown,
} from '../market-intelligence';

const NOW = 1_700_000_000_000;

/** A market that passes every readiness check, with any field overridable. */
const readyMarket = (overrides = {}) => ({
    symbol: 'R_100',
    display_name: 'Volatility 100 Index',
    metadata_available: true,
    tick_count: 120,
    last_tick_epoch: NOW / 1000 - 1,
    now: NOW,
    subscription_active: true,
    connected: true,
    contract_check: { supported: true, reason: '' },
    ...overrides,
});

describe('market readiness', () => {
    it('passes a market whose metadata, history, subscription, freshness and contract list all hold', () => {
        const readiness = evaluateMarketReadiness(readyMarket());

        expect(readiness.ready).toBe(true);
        expect(readiness.reason).toBe('');
        expect(readiness.passed).toBe(readiness.total);
        expect(readiness.checks.map(check => check.id)).toEqual([
            MARKET_READINESS_CHECK.METADATA,
            MARKET_READINESS_CHECK.HISTORY,
            MARKET_READINESS_CHECK.SUBSCRIPTION,
            MARKET_READINESS_CHECK.FRESHNESS,
            MARKET_READINESS_CHECK.CONNECTION,
            MARKET_READINESS_CHECK.CONTRACT,
        ]);
    });

    it('fails closed when the feed is stale and names the failing check', () => {
        const readiness = evaluateMarketReadiness(readyMarket({ last_tick_epoch: NOW / 1000 - 90 }));

        expect(readiness.ready).toBe(false);
        expect(readiness.reason).toContain('Data freshness');
        expect(readiness.reason).toContain('90.0s old');
    });

    it('treats missing data as not ready — never as a passing condition', () => {
        const readiness = evaluateMarketReadiness(
            readyMarket({ tick_count: 0, last_tick_epoch: 0, subscription_active: false, connected: false })
        );

        expect(readiness.ready).toBe(false);
        expect(readiness.checks.filter(check => !check.ok).length).toBeGreaterThanOrEqual(3);
        expect(readiness.reason).toContain('Genuine tick history');
    });

    it('does not require contract compatibility when no contract types are configured', () => {
        const readiness = evaluateMarketReadiness(readyMarket({ contract_check: null }));

        expect(readiness.ready).toBe(true);
        expect(readiness.checks.find(check => check.id === MARKET_READINESS_CHECK.CONTRACT).detail).toContain(
            'Not checked'
        );
    });

    it('refuses a market whose contract list does not offer the configured contract types', () => {
        const readiness = evaluateMarketReadiness(
            readyMarket({ contract_check: { supported: false, reason: 'Does not offer DIGITOVER' } })
        );

        expect(readiness.ready).toBe(false);
        expect(readiness.reason).toContain('Does not offer DIGITOVER');
    });
});

describe('market ranking', () => {
    const entries = [
        { symbol: 'R_10', display_name: 'Volatility 10 Index', ready_checks: { passed: 6, total: 6 }, tick_count: 40 },
        { symbol: 'R_25', display_name: 'Volatility 25 Index', ready_checks: { passed: 3, total: 6 }, tick_count: 5 },
        { symbol: 'R_50', display_name: 'Volatility 50 Index', ready_checks: { passed: 5, total: 6 }, tick_count: 90 },
    ];

    it('ranks by readiness and states the basis of every position', () => {
        const { ranked, criterion_label } = rankEligibleMarkets(entries, MARKET_RANK_CRITERIA.READINESS);

        expect(ranked.map(item => item.symbol)).toEqual(['R_10', 'R_50', 'R_25']);
        expect(ranked[0].reason).toBe('6 of 6 readiness check(s) passed');
        expect(criterion_label).toContain('readiness');
    });

    it('ranks by the genuine ticks observed, without implying a profit', () => {
        const { ranked } = rankEligibleMarkets(entries, MARKET_RANK_CRITERIA.TICK_SAMPLE);

        expect(ranked.map(item => item.symbol)).toEqual(['R_50', 'R_10', 'R_25']);
        expect(ranked[0].reason).toContain('90 genuine tick(s)');
    });

    it('reports a market with no measurement as not ranked instead of scoring it 0', () => {
        const { ranked, unranked } = rankEligibleMarkets(
            [{ symbol: 'R_75', display_name: 'Volatility 75 Index' }],
            MARKET_RANK_CRITERIA.READINESS
        );

        expect(ranked).toEqual([]);
        expect(unranked[0].reason).toContain('Readiness was not measured');
    });

    it('marks the entry criterion unranked when the condition was never evaluated', () => {
        const { ranked, unranked } = rankEligibleMarkets(
            [{ symbol: 'R_100', entry_met: true }, { symbol: 'R_10' }],
            MARKET_RANK_CRITERIA.ENTRY
        );

        expect(ranked.map(item => item.symbol)).toEqual(['R_100']);
        expect(unranked[0].reason).toContain('not evaluated');
    });

    it('orders digit-share steadiness from the steadiest market first', () => {
        const { ranked } = rankEligibleMarkets(
            [
                { symbol: 'R_100', frequencies: [0.2, 0.05] },
                { symbol: 'R_10', frequencies: [0.11, 0.09] },
            ],
            MARKET_RANK_CRITERIA.FREQUENCY_STABILITY
        );

        expect(ranked.map(item => item.symbol)).toEqual(['R_10', 'R_100']);
        expect(ranked[0].reason).toContain('steadier first, not a profit measure');
    });

    it('refuses the observed-outcomes criterion below the minimum sample', () => {
        const { ranked, unranked } = rankEligibleMarkets(
            [
                { symbol: 'R_100', observed: { sample: 29, outcome_rate: 0.9 } },
                { symbol: 'R_10', observed: { sample: 40, outcome_rate: 0.6 } },
            ],
            MARKET_RANK_CRITERIA.OBSERVED_OUTCOMES,
            { min_sample: 30 }
        );

        expect(ranked.map(item => item.symbol)).toEqual(['R_10']);
        expect(unranked[0].reason).toContain('needs at least 30');
        expect(ranked[0].reason).toContain('not a forecast');
        expect(ranked[0].reason).toContain('virtual observation');
    });
});

describe('market cooldown', () => {
    it('excludes a market for the configured number of scan cycles', () => {
        const store = createCooldownStore();
        const result = setMarketCooldown(store, {
            symbol: 'R_100',
            display_name: 'Volatility 100 Index',
            reason: 'Session loss limit reached',
            cycles: 2,
            now: NOW,
        });

        expect(result.applied).toBe(true);
        expect(isMarketCooling(store, 'R_100', { now: NOW }).cooling).toBe(true);
        expect(isMarketCooling(store, 'R_10', { now: NOW }).cooling).toBe(false);

        consumeScanCycle(store, { now: NOW });
        expect(isMarketCooling(store, 'R_100', { now: NOW }).cooling).toBe(true);

        const released = consumeScanCycle(store, { now: NOW });
        expect(released.map(entry => entry.symbol)).toEqual(['R_100']);
        expect(isMarketCooling(store, 'R_100', { now: NOW }).cooling).toBe(false);
    });

    it('excludes a market for the configured minutes', () => {
        const store = createCooldownStore();
        setMarketCooldown(store, { symbol: 'R_50', reason: 'Pausing this market', minutes: 5, now: NOW });

        expect(isMarketCooling(store, 'R_50', { now: NOW + 60_000 }).cooling).toBe(true);
        expect(isMarketCooling(store, 'R_50', { now: NOW + 6 * 60_000 }).cooling).toBe(false);
        expect(listCoolingMarkets(store, { now: NOW })[0].minutes_remaining).toBe(5);
    });

    it('refuses a cooldown with no cycles and no minutes', () => {
        const store = createCooldownStore();
        const result = setMarketCooldown(store, { symbol: 'R_100', reason: 'Nothing configured', now: NOW });

        expect(result.applied).toBe(false);
        expect(store.entries).toEqual([]);
    });

    it('refuses to hide a data or account problem behind a cooldown', () => {
        const store = createCooldownStore();
        const result = setMarketCooldown(store, {
            symbol: 'R_100',
            reason: 'No tick history',
            cycles: 5,
            now: NOW,
        });

        expect(result.applied).toBe(false);
        expect(result.critical).toBe(true);
        expect(store.entries).toEqual([]);
        expect(isCriticalExclusion('The feed disconnected')).toBe(true);
        expect(isCriticalExclusion('Pausing after a loss')).toBe(false);
    });

    it('reports every excluded market with its reason and remaining time', () => {
        const store = createCooldownStore();
        setMarketCooldown(store, { symbol: 'R_100', display_name: 'Volatility 100', reason: 'Loss', cycles: 3, now: NOW });
        setMarketCooldown(store, { symbol: 'R_50', reason: 'Pausing', minutes: 2, now: NOW });

        const excluded = listCoolingMarkets(store, { now: NOW });
        expect(excluded.map(item => item.symbol).sort()).toEqual(['R_100', 'R_50']);
        expect(excluded.find(item => item.symbol === 'R_100').cycles_remaining).toBe(3);
        expect(excluded.find(item => item.symbol === 'R_50').minutes_remaining).toBe(2);
        excluded.forEach(item => expect(item.reason).toBeTruthy());
    });
});
