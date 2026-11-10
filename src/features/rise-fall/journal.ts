/**
 * Trade journal — four strictly separate books (Virtual, Demo, Real; the Backtest
 * book belongs to the backtester and is not written by this module).
 *
 * Every mode reads and writes only its own storage key, so a simulation can never
 * be shown as a demo result and a demo result can never be shown as real money.
 * Pure summarisation; the executor owns the state.
 */

import type { ExecutionMode, JournalEntry, JournalStats } from './types';

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export const JOURNAL_STORAGE_PREFIX = 'rise-fall.journal.v1';

/** Newest entries kept per mode. */
export const MAX_JOURNAL_ENTRIES = 200;

export function journalKey(mode: ExecutionMode): string {
    return `${JOURNAL_STORAGE_PREFIX}.${mode}`;
}

export function safeStorage(): StorageLike | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

export function emptyStats(): JournalStats {
    return {
        trades: 0,
        open: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        netProfit: 0,
        maxDrawdown: 0,
        longestLosingStreak: 0,
        consecutiveLosses: 0,
        lastLossAt: null,
    };
}

export function summarize(entries: JournalEntry[]): JournalStats {
    const stats = emptyStats();
    if (entries.length === 0) return stats;

    stats.trades = entries.length;

    const settled = entries
        .filter(entry => entry.status !== 'open')
        .slice()
        .sort((a, b) => a.entryEpoch - b.entryEpoch);

    stats.open = entries.length - settled.length;
    stats.netProfit = entries.reduce((sum, entry) => sum + (entry.profit ?? 0), 0);

    let equity = 0;
    let peak = 0;
    let streak = 0;

    settled.forEach(entry => {
        const profit = entry.profit ?? 0;
        equity += profit;
        peak = Math.max(peak, equity);
        stats.maxDrawdown = Math.max(stats.maxDrawdown, peak - equity);

        if (entry.status === 'lost') {
            stats.losses += 1;
            streak += 1;
            stats.longestLosingStreak = Math.max(stats.longestLosingStreak, streak);
            if (entry.tie) stats.ties += 1;
            if (entry.exitEpoch !== null) {
                stats.lastLossAt = Math.max(stats.lastLossAt ?? 0, entry.exitEpoch * 1000);
            }
        } else {
            stats.wins += 1;
            streak = 0;
        }
    });

    // The trailing streak is what the risk engine's cool-down and
    // consecutive-loss limit read.
    for (let index = settled.length - 1; index >= 0; index -= 1) {
        if (settled[index].status !== 'lost') break;
        stats.consecutiveLosses += 1;
    }

    return stats;
}

export class RiseFallJournal {
    private readonly storage: StorageLike | null;
    private cache: Partial<Record<ExecutionMode, JournalEntry[]>> = {};

    constructor(storage: StorageLike | null = safeStorage()) {
        this.storage = storage;
    }

    /** Newest first, which is the order the journal panel shows. */
    entries(mode: ExecutionMode): JournalEntry[] {
        if (!this.cache[mode]) {
            this.cache[mode] = this.read(mode);
        }
        return this.cache[mode] as JournalEntry[];
    }

    append(mode: ExecutionMode, entry: JournalEntry): JournalEntry[] {
        const next = [entry, ...this.entries(mode)].slice(0, MAX_JOURNAL_ENTRIES);
        this.commit(mode, next);
        return next;
    }

    update(mode: ExecutionMode, id: string, patch: Partial<JournalEntry>): JournalEntry[] {
        const next = this.entries(mode).map(entry => (entry.id === id ? { ...entry, ...patch } : entry));
        this.commit(mode, next);
        return next;
    }

    clear(mode: ExecutionMode): void {
        this.cache[mode] = [];
        try {
            this.storage?.removeItem(journalKey(mode));
        } catch {
            /* storage unavailable — the in-memory book is cleared anyway */
        }
    }

    stats(mode: ExecutionMode): JournalStats {
        return summarize(this.entries(mode));
    }

    private commit(mode: ExecutionMode, entries: JournalEntry[]): void {
        this.cache[mode] = entries;
        try {
            this.storage?.setItem(journalKey(mode), JSON.stringify(entries));
        } catch {
            /* a full or blocked storage must not break execution */
        }
    }

    private read(mode: ExecutionMode): JournalEntry[] {
        try {
            const raw = this.storage?.getItem(journalKey(mode));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((entry): entry is JournalEntry => Boolean(entry) && entry.mode === mode)
                .slice(0, MAX_JOURNAL_ENTRIES);
        } catch {
            return [];
        }
    }
}
