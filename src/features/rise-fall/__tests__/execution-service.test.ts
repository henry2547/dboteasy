import { RiseFallExecutionService, SIGNAL_MAX_AGE_MS, VIRTUAL_PAYOUT_RATE } from '../execution-service';
import { RiseFallJournal, type StorageLike } from '../journal';
import type { MarketIntegrity, RiseFallSignal } from '../types';

const NOW = 1_700_000_000_000;

const healthyFeed: MarketIntegrity = {
    healthy: true,
    issue: null,
    gaps: 0,
    duplicates: 0,
    lastTickAgeMs: 400,
    ticksAvailable: 1000,
};

function memoryStorage(): StorageLike {
    const map = new Map<string, string>();
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: key => {
            map.delete(key);
        },
    };
}

function makeSignal(overrides: Partial<RiseFallSignal> = {}): RiseFallSignal {
    return {
        strategyId: 'trend_continuation',
        symbol: 'R_100',
        direction: 'rise',
        riseScore: 82,
        fallScore: 12,
        confidence: 0.82,
        contributions: [],
        explanation: 'Rise 82/100 — EMA alignment, structure and momentum agree.',
        regime: 'strong_uptrend',
        suitable: true,
        ticksAnalysed: 140,
        evaluatedAt: NOW - 500,
        fingerprint: 'R_100:rise:1700000000',
        ...overrides,
    };
}

function makeService() {
    const journal = new RiseFallJournal(memoryStorage());
    const service = new RiseFallExecutionService({ journal, clock: () => NOW });
    return { service, journal };
}

const entryTick = { epoch: 1_700_000_000, quote: 100 };

function enter(
    service: RiseFallExecutionService,
    overrides: Partial<Parameters<RiseFallExecutionService['enter']>[0]> = {}
) {
    return service.enter({
        signal: makeSignal(),
        stake: 1,
        durationTicks: 2,
        entryTick,
        integrity: healthyFeed,
        now: NOW,
        ...overrides,
    });
}

describe('RiseFallExecutionService', () => {
    it('refuses every entry until the engine is running', () => {
        const { service } = makeService();
        const outcome = enter(service);

        expect(outcome.status).toBe('halted');
        expect(outcome.reason).toContain('not running');
    });

    it('opens a virtual contract with no Deriv contract id and an ESTIMATED journal line', () => {
        const { service, journal } = makeService();
        service.start();

        const outcome = enter(service);
        expect(outcome.status).toBe('opened');
        if (outcome.status !== 'opened') return;

        expect(outcome.contract.source).toBe('VIRTUAL');
        expect(outcome.contract.contractId).toBeNull();
        expect(outcome.contract.contractType).toBe('CALL');

        const [line] = journal.entries('virtual');
        expect(line.status).toBe('open');
        expect(line.estimated).toBe(true);
        expect(line.source).toBe('VIRTUAL');
    });

    it('settles Rise as a win only when the exit quote is above the entry quote', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 2 });

        expect(service.onTick({ epoch: entryTick.epoch + 1, quote: 100.4 })).toBeNull();
        const settled = service.onTick({ epoch: entryTick.epoch + 2, quote: 100.6 });

        expect(settled?.status).toBe('won');
        expect(settled?.profit).toBeCloseTo(VIRTUAL_PAYOUT_RATE, 2);
        expect(settled?.exitQuote).toBe(100.6);
    });

    it('counts an equal exit as a loss (strict rules, allow-equals not requested)', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 1 });

        const settled = service.onTick({ epoch: entryTick.epoch + 1, quote: entryTick.quote });

        expect(settled?.status).toBe('lost');
        expect(settled?.tie).toBe(true);
        expect(settled?.profit).toBe(-1);
    });

    it('settles Fall as a win when the exit quote is below the entry quote', () => {
        const { service } = makeService();
        service.start();
        enter(service, {
            signal: makeSignal({ direction: 'fall', fingerprint: 'R_100:fall:1700000000' }),
            durationTicks: 1,
        });

        const settled = service.onTick({ epoch: entryTick.epoch + 1, quote: 99.5 });
        expect(settled?.status).toBe('won');
    });

    it('refuses the same signal twice (duplicate-entry guard)', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 1 });
        service.onTick({ epoch: entryTick.epoch + 1, quote: 101 });

        const again = enter(service, { durationTicks: 1 });
        expect(again.status).toBe('rejected');
        expect(again.stage).toBe('duplicate');
    });

    it('ignores a replayed tick and never fabricates a price to settle early', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 3 });

        expect(service.onTick({ epoch: entryTick.epoch, quote: 100 })).toBeNull();
        expect(service.onTick({ epoch: entryTick.epoch + 1, quote: 100.2 })).toBeNull();
        expect(service.onTick({ epoch: entryTick.epoch + 1, quote: 100.2 })).toBeNull();
        expect(service.snapshot().modes.virtual.openContract?.ticksRemaining).toBe(2);
    });

    it('refuses a stale signal', () => {
        const { service } = makeService();
        service.start();

        const outcome = enter(service, {
            signal: makeSignal({ evaluatedAt: NOW - SIGNAL_MAX_AGE_MS - 1 }),
        });

        expect(outcome.status).toBe('rejected');
        expect(outcome.reason).toContain('stale');
    });

    it('refuses an entry while the market feed is unhealthy', () => {
        const { service } = makeService();
        service.start();

        const outcome = enter(service, {
            integrity: { ...healthyFeed, healthy: false, issue: 'The market feed is stale.' },
        });

        expect(outcome.status).toBe('rejected');
        expect(outcome.stage).toBe('market-data');
        expect(outcome.reason).toContain('stale');
    });

    it('refuses a signal the strategy marked unsuitable', () => {
        const { service } = makeService();
        service.start();

        const outcome = enter(service, { signal: makeSignal({ suitable: false }) });

        expect(outcome.status).toBe('rejected');
        expect(outcome.stage).toBe('signal');
    });

    it('enforces the risk engine before opening anything', () => {
        const { service } = makeService();
        service.start();
        service.setRisk({ stake: 50 });

        const outcome = enter(service);
        expect(outcome.status).toBe('rejected');
        expect(outcome.stage).toBe('risk');
        expect(service.snapshot().modes.virtual.openContract).toBeNull();
    });

    it('refuses Demo purchases with the explicit phase gate', () => {
        const { service } = makeService();
        expect(service.setMode('demo').ok).toBe(true);
        service.start();

        const outcome = enter(service);
        expect(outcome.status).toBe('halted');
        expect(outcome.stage).toBe('account');
        expect(outcome.reason).toContain('Phase B');
        expect(service.snapshot().modes.demo.openContract).toBeNull();
    });

    it('locks Real execution behind the activation gate', () => {
        const { service } = makeService();
        service.setMode('real');
        service.start();

        const outcome = enter(service);
        expect(outcome.status).toBe('halted');
        expect(outcome.reason).toContain('locked');
    });

    it('blocks a mode switch while a contract is open', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 5 });

        const result = service.setMode('demo');
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('still open');
    });

    it('emergency stop blocks new entries but keeps monitoring the open contract', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 1 });
        service.emergencyStop();

        const blocked = enter(service, {
            signal: makeSignal({ fingerprint: 'R_100:rise:1700000001' }),
        });
        expect(blocked.status).toBe('halted');
        expect(blocked.reason).toContain('Emergency stop');

        const settled = service.onTick({ epoch: entryTick.epoch + 1, quote: 100.9 });
        expect(settled?.status).toBe('won');
    });

    it('halts new entries when the authorized account identity changes', () => {
        const { service } = makeService();
        const base = {
            verified: true,
            accountType: 'demo' as const,
            currency: 'USD',
            balance: 10_000,
            tradePermitted: true,
            verifiedAt: NOW,
            reason: null,
        };

        service.verifyAccount('demo', { ...base, maskedLoginId: 'VR•••01' });
        service.verifyAccount('demo', { ...base, maskedLoginId: 'VR•••99' });

        expect(service.snapshot().modes.demo.haltReason).toContain('account changed');
    });

    it('keeps the journals of the three modes strictly separate', () => {
        const { service, journal } = makeService();
        service.start();
        enter(service, { durationTicks: 1 });
        service.onTick({ epoch: entryTick.epoch + 1, quote: 101 });

        expect(journal.entries('virtual')).toHaveLength(1);
        expect(journal.entries('demo')).toHaveLength(0);
        expect(journal.entries('real')).toHaveLength(0);

        service.setMode('demo');
        expect(service.journalEntries()).toHaveLength(0);
    });

    it('reports a virtual balance derived from the settled book', () => {
        const { service } = makeService();
        service.start();
        enter(service, { durationTicks: 1 });
        service.onTick({ epoch: entryTick.epoch + 1, quote: 101 });

        const snapshot = service.snapshot();
        expect(snapshot.modes.virtual.stats.wins).toBe(1);
        expect(snapshot.modes.virtual.account.balance).toBeCloseTo(1000 + VIRTUAL_PAYOUT_RATE, 2);
    });

    it('counts a refused entry in the last decision without touching the book', () => {
        const { service } = makeService();
        service.start();
        service.setRisk({ stake: 50 });
        enter(service);

        const snapshot = service.snapshot();
        expect(snapshot.lastOutcome?.status).toBe('rejected');
        expect(snapshot.modes.virtual.stats.trades).toBe(0);
    });
});
