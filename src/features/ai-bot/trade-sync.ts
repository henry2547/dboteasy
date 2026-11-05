/**
 * Trade sync — persists the AI Bot's trade ledger (the Transactions list and
 * the Journal) so it survives reloads and stays intact while the user switches
 * between their Demo and Real trading accounts.
 *
 * The app has no backend, so "sync" here means one local ledger for this
 * browser: every position the bot opened and every journal line is written to
 * localStorage, tagged with the account it belongs to. Both accounts share the
 * ledger, so history from a demo session is still there after switching to real
 * (and back) — the views label each entry with its account.
 *
 * Only *settled* positions are restored. An open contract cannot be monitored
 * after a reload (its socket subscription is gone), so restoring it as "open"
 * would leave a phantom position that wrongly counts against
 * `maxConcurrentContracts`. Open positions stay live within the session.
 */

import { STORAGE_KEYS } from './constants';
import type { JournalEntry, TradePosition } from './types';

/** Newest-first caps so a long-lived ledger cannot grow without bound. */
const MAX_POSITIONS = 200;
const MAX_JOURNAL = 200;

export interface PersistedLedger {
    positions: TradePosition[];
    journal: JournalEntry[];
}

/** Read the persisted ledger. Always returns a valid (possibly empty) ledger. */
export function loadLedger(): PersistedLedger {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.ledger);
        if (!raw) return { positions: [], journal: [] };
        const parsed = JSON.parse(raw) as Partial<PersistedLedger>;
        const positions = Array.isArray(parsed.positions)
            ? parsed.positions.filter(p => p && p.status === 'settled').slice(-MAX_POSITIONS)
            : [];
        const journal = Array.isArray(parsed.journal) ? parsed.journal.slice(-MAX_JOURNAL) : [];
        return { positions, journal };
    } catch {
        return { positions: [], journal: [] };
    }
}

/** Write the settled positions and the journal back to localStorage. */
export function saveLedger(positions: TradePosition[], journal: JournalEntry[]): void {
    try {
        const settled = positions.filter(p => p.status === 'settled').slice(-MAX_POSITIONS);
        const recent = journal.slice(-MAX_JOURNAL);
        localStorage.setItem(STORAGE_KEYS.ledger, JSON.stringify({ positions: settled, journal: recent }));
    } catch {
        /* Storage unavailable or full — the in-memory ledger still works. */
    }
}
