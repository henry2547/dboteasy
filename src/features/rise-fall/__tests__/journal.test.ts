import { JOURNAL_STORAGE_PREFIX, RiseFallJournal, journalKey, summarize, type StorageLike } from '../journal';
import type { ExecutionMode, JournalEntry } from '../types';

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

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
    const mode: ExecutionMode = overrides.mode ?? 'virtual';
    return {
        id: overrides.id ?? 'rf-1',
        mode,
        source: 'VIRTUAL',
        contractId: null,
        symbol: 'R_100',
        strategyId: 'trend_continuation',
        direction: 'rise',
        durationTicks: 5,
        stake: 1,
        currency: 'USD',
        entryEpoch: 1_700_000_000,
        entryQuote: 100,
        exitEpoch: 1_700_000_005,
        exitQuote: 101,
        status: 'won',
        profit: 0.95,
        estimated: true,
        tie: false,
        signalScore: 80,
        regime: 'strong_uptrend',
        explanation: 'Rise 80/100',
        fingerprint: 'R_100:rise:1',
        riskSnapshot: { stake: 1 },
        ...overrides,
    };
}

describe('summarize', () => {
    it('counts wins, losses, ties and the trailing streak', () => {
        const stats = summarize([
            entry({ id: 'a', status: 'won', profit: 0.95, entryEpoch: 10, exitEpoch: 11 }),
            entry({ id: 'b', status: 'lost', profit: -1, entryEpoch: 20, exitEpoch: 21 }),
            entry({ id: 'c', status: 'lost', profit: -1, tie: true, entryEpoch: 30, exitEpoch: 31 }),
        ]);

        expect(stats.trades).toBe(3);
        expect(stats.wins).toBe(1);
        expect(stats.losses).toBe(2);
        expect(stats.ties).toBe(1);
        expect(stats.consecutiveLosses).toBe(2);
        expect(stats.longestLosingStreak).toBe(2);
        expect(stats.netProfit).toBeCloseTo(-1.05, 2);
        expect(stats.lastLossAt).toBe(31_000);
    });

    it('reports the deepest peak-to-trough fall of the settled curve', () => {
        const stats = summarize([
            entry({ id: 'a', status: 'won', profit: 3, entryEpoch: 10, exitEpoch: 11 }),
            entry({ id: 'b', status: 'lost', profit: -5, entryEpoch: 20, exitEpoch: 21 }),
            entry({ id: 'c', status: 'won', profit: 1, entryEpoch: 30, exitEpoch: 31 }),
        ]);

        expect(stats.maxDrawdown).toBe(5);
    });

    it('leaves open contracts out of the win/loss reads', () => {
        const stats = summarize([entry({ status: 'open', profit: null, exitEpoch: null, exitQuote: null })]);

        expect(stats.trades).toBe(1);
        expect(stats.open).toBe(1);
        expect(stats.wins + stats.losses).toBe(0);
    });
});

describe('RiseFallJournal', () => {
    it('keeps every mode in its own book and its own storage key', () => {
        const journal = new RiseFallJournal(memoryStorage());
        journal.append('virtual', entry({ id: 'v1' }));
        journal.append('demo', entry({ id: 'd1', mode: 'demo', source: 'VIRTUAL', contractId: '42' }));

        expect(journal.entries('virtual').map(item => item.id)).toEqual(['v1']);
        expect(journal.entries('demo').map(item => item.id)).toEqual(['d1']);
        expect(journal.entries('real')).toHaveLength(0);
        expect(journalKey('demo')).toBe(`${JOURNAL_STORAGE_PREFIX}.demo`);
    });

    it('persists through the storage it was given and reads it back', () => {
        const storage = memoryStorage();
        const first = new RiseFallJournal(storage);
        first.append('virtual', entry({ id: 'v1' }));

        const reloaded = new RiseFallJournal(storage);
        expect(reloaded.entries('virtual')).toHaveLength(1);
        expect(reloaded.stats('virtual').wins).toBe(1);
    });

    it('updates a settled entry in place', () => {
        const journal = new RiseFallJournal(memoryStorage());
        journal.append('virtual', entry({ id: 'v1', status: 'open', profit: null, exitEpoch: null }));
        journal.update('virtual', 'v1', { status: 'lost', profit: -1, exitEpoch: 1_700_000_009, exitQuote: 99 });

        const [stored] = journal.entries('virtual');
        expect(stored.status).toBe('lost');
        expect(stored.profit).toBe(-1);
        expect(journal.stats('virtual').losses).toBe(1);
    });

    it('clears only the requested mode', () => {
        const journal = new RiseFallJournal(memoryStorage());
        journal.append('virtual', entry({ id: 'v1' }));
        journal.append('demo', entry({ id: 'd1', mode: 'demo' }));
        journal.clear('virtual');

        expect(journal.entries('virtual')).toHaveLength(0);
        expect(journal.entries('demo')).toHaveLength(1);
    });

    it('survives corrupt storage instead of throwing', () => {
        const storage = memoryStorage();
        storage.setItem(journalKey('virtual'), '{not json');

        const journal = new RiseFallJournal(storage);
        expect(journal.entries('virtual')).toEqual([]);
    });

    it('drops a record filed under another mode', () => {
        const storage = memoryStorage();
        storage.setItem(journalKey('demo'), JSON.stringify([entry({ id: 'x', mode: 'real' })]));

        expect(new RiseFallJournal(storage).entries('demo')).toEqual([]);
    });
});
