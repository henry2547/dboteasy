/**
 * Session Manager — tracks session-level profit/loss, trade counts, and
 * consecutive outcomes using actual account-authoritative contract results.
 *
 * The session target is measured as net realized profit/loss from completed
 * contracts. When the profit target or loss limit is reached, the session
 * stops opening new contracts but continues monitoring open ones.
 */

import type { ExecutionResult, SessionStats, StopReason } from './types';

export function createSession(): SessionStats {
    return {
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
        openCount: 0,
        consecutiveLosses: 0,
        consecutiveWins: 0,
        realizedProfit: 0,
        startingBalance: null,
        currentBalance: null,
        startedAt: Date.now(),
        stoppedAt: null,
        stopReason: null,
    };
}

/**
 * Record a settled contract result. Returns the updated session stats.
 */
export function recordSettlement(session: SessionStats, result: ExecutionResult): SessionStats {
    const next = { ...session };

    next.tradeCount += 1;
    next.openCount = Math.max(0, next.openCount - 1);

    if (result.profit !== null) {
        next.realizedProfit += result.profit;
    }

    if (result.status === 'won') {
        next.winCount += 1;
        next.consecutiveWins += 1;
        next.consecutiveLosses = 0;
    } else if (result.status === 'lost') {
        next.lossCount += 1;
        next.consecutiveLosses += 1;
        next.consecutiveWins = 0;
    }

    return next;
}

/** Record that a new contract was opened. */
export function recordOpen(session: SessionStats, balance: number | null): SessionStats {
    const next = { ...session };
    next.openCount += 1;
    if (next.startingBalance === null && balance !== null) {
        next.startingBalance = balance;
    }
    if (balance !== null) {
        next.currentBalance = balance;
    }
    return next;
}

/** Mark the session as stopped with a reason. */
export function stopSession(session: SessionStats, reason: StopReason): SessionStats {
    return {
        ...session,
        stoppedAt: Date.now(),
        stopReason: reason,
    };
}
