import {
    LIVE_ACCOUNT_REQUIRED,
    RiseFallExecutionService,
    SIGNAL_MAX_AGE_MS,
    VIRTUAL_PAYOUT_RATE,
} from '../execution-service';
import { RiseFallJournal, type StorageLike } from '../journal';
import type {
    BrokerBuyResult,
    BrokerTicket,
    LiveContractUpdate,
    MarketIntegrity,
    RiseFallBroker,
    RiseFallSignal,
} from '../types';

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
        fingerprint: 'R_100:trend_continuation:rise:1700000000',
        ...overrides,
    };
}

class FakeBroker implements RiseFallBroker {
    readonly tickets: BrokerTicket[] = [];
    result: BrokerBuyResult;
    constructor(result: BrokerBuyResult) {
        this.result = result;
    }
    async buy(ticket: BrokerTicket): Promise<BrokerBuyResult> {
        this.tickets.push(ticket);
        return this.result;
    }
}

const accepted: BrokerBuyResult = { ok: true, contractId: '555', payout: 1.9, reason: null, unknown: false };

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeService(broker?: RiseFallBroker) {
    const journal = new RiseFallJournal(memoryStorage());
    const service = new RiseFallExecutionService({ journal, clock: () => NOW });
    if (broker) {
        service.setBroker(broker);
        service.verifyAccount('demo', {
            verified: true,
            accountType: 'demo',
            maskedLoginId: 'VR•••01',
            currency: 'USD',
            balance: 10_000,
            tradePermitted: true,
            verifiedAt: NOW,
            reason: null,
        });
        service.verifyAccount('real', {
            verified: true,
            accountType: 'real',
            maskedLoginId: 'CR•••01',
            currency: 'USD',
            balance: 500,
            tradePermitted: true,
            verifiedAt: NOW,
            reason: null,
        });
    }
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
            signal: makeSignal({ direction: 'fall', fingerprint: 'R_100:trend_continuation:fall:1700000000' }),
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

    it('refuses a Demo entry until a Demo account is verified', () => {
        const { service } = makeService();
        expect(service.setMode('demo').ok).toBe(true);
        service.start();

        const outcome = enter(service);
        expect(outcome.status).toBe('halted');
        expect(outcome.stage).toBe('account');
        expect(outcome.reason).toContain('No verified Deriv account');
        expect(LIVE_ACCOUNT_REQUIRED.length).toBeGreaterThan(0);
        expect(service.snapshot().modes.demo.openContract).toBeNull();
    });

    it('buys a Demo contract through the broker and journals it as not estimated', async () => {
        const broker = new FakeBroker(accepted);
        const { service, journal } = makeService(broker);
        service.setMode('demo');
        service.start();

        const outcome = enter(service);
        expect(outcome.status).toBe('opened');
        await flush();

        expect(broker.tickets).toHaveLength(1);
        expect(broker.tickets[0]).toMatchObject({
            mode: 'demo',
            symbol: 'R_100',
            contractType: 'CALL',
            stake: 1,
            currency: 'USD',
            durationTicks: 2,
        });

        const contract = service.snapshot().modes.demo.openContract;
        expect(contract?.contractId).toBe('555');
        expect(contract?.source).toBe('DEMO');
        expect(contract?.awaitingBroker).toBe(false);

        const [line] = journal.entries('demo');
        expect(line.source).toBe('DEMO');
        expect(line.contractId).toBe('555');
        expect(line.estimated).toBe(false);
        expect(journal.entries('virtual')).toHaveLength(0);
    });

    it('settles a live contract only on Deriv’s own report', async () => {
        const broker = new FakeBroker(accepted);
        const { service, journal } = makeService(broker);
        service.setMode('demo');
        service.start();
        enter(service);
        await flush();

        // A tick must never settle a purchased contract.
        expect(service.onTick({ epoch: entryTick.epoch + 5, quote: 200 })).toBeNull();
        expect(service.snapshot().modes.demo.openContract?.status).toBe('open');

        const update: LiveContractUpdate = {
            contractId: '555',
            status: 'won',
            profit: 0.95,
            exitQuote: 100.5,
            exitEpoch: entryTick.epoch + 2,
            balance: 10_000.95,
        };
        service.onContractUpdate(update);

        expect(service.snapshot().modes.demo.openContract).toBeNull();
        const [line] = journal.entries('demo');
        expect(line.status).toBe('won');
        expect(line.profit).toBe(0.95);
        expect(line.exitQuote).toBe(100.5);
        expect(service.snapshot().modes.demo.account.balance).toBeCloseTo(10_000.95, 2);
    });

    it('refuses a Demo entry Deriv declines and leaves no contract open', async () => {
        const broker = new FakeBroker({
            ok: false,
            contractId: null,
            payout: null,
            reason: 'This contract is not offered.',
            unknown: false,
        });
        const { service, journal } = makeService(broker);
        service.setMode('demo');
        service.start();
        enter(service);
        await flush();

        expect(service.snapshot().modes.demo.openContract).toBeNull();
        expect(journal.entries('demo')).toHaveLength(0);
        expect(service.snapshot().lastOutcome?.reason).toContain('not offered');
        // The engine keeps running; nothing was bought, so another attempt is allowed.
        expect(service.snapshot().modes.demo.state).toBe('running');
    });

    it('halts the mode when the purchase outcome is UNKNOWN and never resubmits', async () => {
        const broker = new FakeBroker({
            ok: false,
            contractId: null,
            payout: null,
            reason: 'The buy request timed out.',
            unknown: true,
        });
        const { service } = makeService(broker);
        service.setMode('demo');
        service.start();
        enter(service);
        await flush();

        const snapshot = service.snapshot();
        expect(snapshot.modes.demo.state).toBe('halted');
        expect(snapshot.modes.demo.haltReason).toContain('UNKNOWN');
        expect(broker.tickets).toHaveLength(1);
    });

    it('locks Real execution until the mode is armed, then asks for confirmation', async () => {
        const broker = new FakeBroker(accepted);
        const { service } = makeService(broker);
        service.setMode('real');

        expect(service.start().ok).toBe(false);
        service.armReal(true);
        expect(service.start().ok).toBe(true);

        const outcome = enter(service);
        expect(outcome.status).toBe('confirmation-required');
        expect(service.snapshot().modes.real.pendingContract).not.toBeNull();
        expect(broker.tickets).toHaveLength(0);

        const confirmed = service.confirmEntry();
        expect(confirmed.ok).toBe(true);
        await flush();
        expect(broker.tickets).toHaveLength(1);
        expect(broker.tickets[0].mode).toBe('real');
        expect(service.snapshot().modes.real.openContract?.contractId).toBe('555');
    });

    it('cancels a pending real entry without buying anything', async () => {
        const broker = new FakeBroker(accepted);
        const { service } = makeService(broker);
        service.setMode('real');
        service.armReal(true);
        service.start();
        enter(service);

        service.cancelPendingEntry();
        await flush();

        expect(broker.tickets).toHaveLength(0);
        expect(service.snapshot().modes.real.pendingContract).toBeNull();
        expect(service.snapshot().modes.real.openContract).toBeNull();
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
            signal: makeSignal({ fingerprint: 'R_100:trend_continuation:rise:1700000001' }),
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
