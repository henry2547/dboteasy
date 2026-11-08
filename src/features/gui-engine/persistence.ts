/**
 * Local persistence for the GUI Trading Engine.
 *
 * Only configuration and settled history are trusted after a reload: pending
 * confirmation sequences are deliberately not restored, and an open contract is
 * reconciled against Deriv before the engine may trade again.
 */

import type { EngineConfig, EngineJournalEntry, EngineTrade, SessionMetrics } from './types';

const CONFIG_KEY = 'gui_engine_config_v1';
const SESSION_KEY = 'gui_engine_session_v1';
const MAX_STORED_TRADES = 200;
const MAX_STORED_JOURNAL = 200;

export interface StoredSession {
    accountId: string;
    trades: EngineTrade[];
    journal: EngineJournalEntry[];
    /** Loss counts and recovery attempts, so a reload resumes the staking policy. */
    metrics?: SessionMetrics;
    recovery?: {
        attempts: number;
        consecutiveLosses: number;
        activatedContracts: string[];
    };
}

function safeParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function loadStoredConfig(): Partial<EngineConfig> | null {
    if (typeof window === 'undefined') return null;
    return safeParse<Partial<EngineConfig>>(window.localStorage.getItem(CONFIG_KEY));
}

export function saveStoredConfig(config: EngineConfig): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
        /* storage full or blocked — the session still works in memory */
    }
}

export function loadStoredSession(accountId: string): StoredSession | null {
    if (typeof window === 'undefined') return null;
    const stored = safeParse<StoredSession>(window.localStorage.getItem(SESSION_KEY));
    if (!stored || stored.accountId !== accountId) return null;
    return {
        accountId: stored.accountId,
        trades: Array.isArray(stored.trades) ? stored.trades : [],
        journal: Array.isArray(stored.journal) ? stored.journal : [],
        metrics: stored.metrics,
        recovery: stored.recovery,
    };
}

export function saveStoredSession(session: StoredSession): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
                accountId: session.accountId,
                trades: session.trades.slice(-MAX_STORED_TRADES),
                journal: session.journal.slice(-MAX_STORED_JOURNAL),
                metrics: session.metrics,
                recovery: session.recovery,
            })
        );
    } catch {
        /* storage full or blocked — the session still works in memory */
    }
}

export function clearStoredSession(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(SESSION_KEY);
}
