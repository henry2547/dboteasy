/**
 * Risk controls for the GUI Trading Engine.
 *
 * These run inside the execution path (the hook calls `riskVerdict` immediately
 * before every proposal), not only in the UI. Staking is deterministic: the
 * stake for a leg is derived from its own loss count, so a reload can never
 * leave a progression out of step with the ledger.
 */

import { multiplierApplies } from './config';
import type { EngineConfig, LegKind, RiskVerdict, SessionMetrics, StakePreview } from './types';

/** Stake for a leg after `losses` consecutive losses on that leg. */
export function stakeFor(
    config: EngineConfig,
    kind: LegKind,
    counts: { primaryLosses: number; recoveryLosses: number }
): number {
    if (!multiplierApplies(config.multiplierScope, kind)) {
        return roundMoney(Math.min(config.initialStake, config.maxStake));
    }

    const losses = Math.max(0, kind === 'primary' ? counts.primaryLosses : counts.recoveryLosses);
    const raw = config.initialStake * Math.pow(Math.max(1, config.multiplier), losses);
    return roundMoney(Math.min(raw, config.maxStake));
}

export function stakePreview(
    config: EngineConfig,
    counts: { primaryLosses: number; recoveryLosses: number },
    kind: LegKind
): StakePreview {
    const primaryStake = stakeFor(config, 'primary', counts);
    const recoveryStake = stakeFor(config, 'recovery', counts);
    const currentStake = kind === 'primary' ? primaryStake : recoveryStake;

    const nextCounts = {
        primaryLosses: kind === 'primary' ? counts.primaryLosses + 1 : counts.primaryLosses,
        recoveryLosses: kind === 'recovery' ? counts.recoveryLosses + 1 : counts.recoveryLosses,
    };
    const nextStake = stakeFor(config, kind, nextCounts);

    return {
        initialStake: config.initialStake,
        currentStake,
        nextStake,
        multiplier: config.multiplier,
        remainingRiskAllowance: roundMoney(Math.max(0, config.maxStake - currentStake)),
        primaryStake,
        recoveryStake,
    };
}

export interface RiskInput {
    config: EngineConfig;
    session: SessionMetrics;
    kind: LegKind;
    stake: number;
    balance: number | null;
    connectionOk: boolean;
    dataFresh: boolean;
    purchasePending: boolean;
    /** Set when the engine is paused or halted — nothing may be bought. */
    entriesAllowed: boolean;
    haltReason?: string | null;
}

/**
 * The single pre-purchase gate. Every failing condition returns the exact
 * reason that is shown in the UI and written to the journal.
 */
export function riskVerdict(input: RiskInput): RiskVerdict {
    const { config, session, stake } = input;

    if (!input.entriesAllowed) {
        return block(input.haltReason ?? 'The engine is not accepting new entries.');
    }
    if (!input.connectionOk) {
        return block('The Deriv trading connection is not available.');
    }
    if (!input.dataFresh) {
        return block('Market data is stale or incomplete — reconnect before trading.');
    }
    if (input.purchasePending) {
        return block('A purchase is already pending — duplicate entry prevented.');
    }
    if (!Number.isFinite(stake) || stake <= 0) {
        return block('The calculated stake is not a valid amount.');
    }
    if (stake > config.maxStake) {
        return block(`Stake ${stake} exceeds the maximum stake ${config.maxStake}.`);
    }
    if (session.openContracts >= config.maxOpenContracts) {
        return block(`Open-contract limit reached (${session.openContracts}/${config.maxOpenContracts}).`);
    }
    if (session.profit >= config.takeProfit) {
        return block(`Take profit reached (${session.profit.toFixed(2)} ≥ ${config.takeProfit}).`);
    }
    if (session.profit <= -config.stopLoss) {
        return block(`Stop loss reached (${session.profit.toFixed(2)} ≤ -${config.stopLoss}).`);
    }
    if (session.consecutiveLosses >= config.maxConsecutiveLosses) {
        return block(`Maximum consecutive losses reached (${session.consecutiveLosses}/${config.maxConsecutiveLosses}).`);
    }
    if (input.kind === 'recovery') {
        if (config.maxRecoveryTrades <= 0) {
            return block('Recovery trades are disabled.');
        }
        if (session.recoveryAttempts >= config.maxRecoveryTrades) {
            return block(`Maximum recovery trades reached (${session.recoveryAttempts}/${config.maxRecoveryTrades}).`);
        }
    }
    if (input.balance !== null && Number.isFinite(input.balance) && stake > input.balance) {
        return block(`Insufficient balance: stake ${stake} is above the available ${input.balance.toFixed(2)}.`);
    }

    return { allowed: true, reason: null };
}

/** True when a risk limit has been hit and the session must stop opening trades. */
export function hardLimitReached(config: EngineConfig, session: SessionMetrics): string | null {
    if (session.profit >= config.takeProfit) {
        return `Take profit reached (${session.profit.toFixed(2)} ≥ ${config.takeProfit}).`;
    }
    if (session.profit <= -config.stopLoss) {
        return `Stop loss reached (${session.profit.toFixed(2)} ≤ -${config.stopLoss}).`;
    }
    if (session.consecutiveLosses >= config.maxConsecutiveLosses) {
        return `Maximum consecutive losses reached (${session.consecutiveLosses}/${config.maxConsecutiveLosses}).`;
    }
    return null;
}

export function emptySession(): SessionMetrics {
    return {
        totalTrades: 0,
        primaryTrades: 0,
        recoveryTrades: 0,
        wins: 0,
        losses: 0,
        totalStake: 0,
        profit: 0,
        consecutiveLosses: 0,
        recoveryAttempts: 0,
        recoveryWins: 0,
        recoveryLosses: 0,
        recoveryConsecutiveLosses: 0,
        openContracts: 0,
    };
}

function block(reason: string): RiskVerdict {
    return { allowed: false, reason };
}

/** Money is stored/displayed to two decimals; the cap is applied before rounding. */
export function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const nudged = value + Math.sign(value) * Number.EPSILON;
    return Math.round(nudged * 100) / 100;
}

export function winRate(session: SessionMetrics): number {
    const settled = session.wins + session.losses;
    return settled === 0 ? 0 : (session.wins / settled) * 100;
}
