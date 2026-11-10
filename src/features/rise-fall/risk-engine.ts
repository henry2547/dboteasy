/**
 * Risk engine — the single gate every entry passes through.
 *
 * Limits belong to one execution mode; the UI edits the active mode's config and
 * the executor re-checks it in code before any entry. There is no escalating
 * stake: the stake is flat and a loss never raises it.
 */

import type { ExecutionMode, RiskContext, RiskDecision, RiskCheck } from './types';

export interface RiskConfig {
    stake: number;
    maxStake: number;
    maxDailyLoss: number;
    maxConsecutiveLosses: number;
    maxTradesPerSession: number;
    maxOpenContracts: number;
    maxExposure: number;
    cooldownAfterLossMs: number;
    maxSessionDrawdown: number;
}

export const RISK_FIELD_LABELS: Record<keyof RiskConfig, string> = {
    stake: 'Stake per trade',
    maxStake: 'Maximum stake',
    maxDailyLoss: 'Maximum daily loss',
    maxConsecutiveLosses: 'Maximum consecutive losses',
    maxTradesPerSession: 'Maximum trades per session',
    maxOpenContracts: 'Maximum open contracts',
    maxExposure: 'Maximum session exposure',
    cooldownAfterLossMs: 'Cool-down after a loss (ms)',
    maxSessionDrawdown: 'Maximum session drawdown',
};

export const DEFAULT_RISK: Record<ExecutionMode, RiskConfig> = {
    virtual: {
        stake: 1,
        maxStake: 10,
        maxDailyLoss: 50,
        maxConsecutiveLosses: 3,
        maxTradesPerSession: 20,
        maxOpenContracts: 1,
        maxExposure: 10,
        cooldownAfterLossMs: 0,
        maxSessionDrawdown: 30,
    },
    demo: {
        stake: 0.35,
        maxStake: 2,
        maxDailyLoss: 20,
        maxConsecutiveLosses: 2,
        maxTradesPerSession: 10,
        maxOpenContracts: 1,
        maxExposure: 5,
        cooldownAfterLossMs: 30_000,
        maxSessionDrawdown: 10,
    },
    real: {
        stake: 0.35,
        maxStake: 1,
        maxDailyLoss: 5,
        maxConsecutiveLosses: 1,
        maxTradesPerSession: 5,
        maxOpenContracts: 1,
        maxExposure: 2,
        cooldownAfterLossMs: 60_000,
        maxSessionDrawdown: 3,
    },
};

/** The smallest stake Deriv publishes for these contracts. */
export const MIN_STAKE = 0.35;

/** Flat staking only: no Martingale, no loss recovery, no stake escalation. */
export const STAKING_RULE = 'Flat stake only — no Martingale and no stake escalation after a loss exists in this engine.';

export function riskSnapshot(config: RiskConfig): Record<string, number> {
    return { ...config };
}

export function evaluateRisk(config: RiskConfig, context: RiskContext): RiskDecision {
    const checks: RiskCheck[] = [];

    const stakeValid = config.stake > 0 && config.stake <= config.maxStake;
    checks.push({
        id: 'stake',
        label: 'Stake within limits',
        passed: stakeValid,
        detail: stakeValid
            ? `Stake ${config.stake} ≤ maximum ${config.maxStake}`
            : `Stake ${config.stake} is invalid or above the ${config.maxStake} maximum`,
    });

    const stakeAboveMinimum = config.stake >= MIN_STAKE;
    checks.push({
        id: 'min-stake',
        label: 'Stake at or above the market minimum',
        passed: stakeAboveMinimum,
        detail: stakeAboveMinimum ? `Stake ${config.stake} ≥ ${MIN_STAKE}` : `Stake below the ${MIN_STAKE} minimum`,
    });

    const dailyLossHit = config.maxDailyLoss > 0 && context.sessionPnl <= -config.maxDailyLoss;
    checks.push({
        id: 'daily-loss',
        label: 'Daily loss limit',
        passed: !dailyLossHit,
        detail: dailyLossHit
            ? `Daily loss limit reached (${context.sessionPnl.toFixed(2)})`
            : `Session P/L ${context.sessionPnl.toFixed(2)} above the −${config.maxDailyLoss} limit`,
    });

    const consecutiveHit =
        config.maxConsecutiveLosses > 0 && context.consecutiveLosses >= config.maxConsecutiveLosses;
    checks.push({
        id: 'consecutive-losses',
        label: 'Consecutive loss limit',
        passed: !consecutiveHit,
        detail: consecutiveHit
            ? `${context.consecutiveLosses} consecutive losses reached the ${config.maxConsecutiveLosses} limit`
            : `${context.consecutiveLosses} consecutive losses (limit ${config.maxConsecutiveLosses})`,
    });

    const tradeCountHit = config.maxTradesPerSession > 0 && context.tradesTaken >= config.maxTradesPerSession;
    checks.push({
        id: 'max-trades',
        label: 'Trades per session',
        passed: !tradeCountHit,
        detail: tradeCountHit
            ? `${context.tradesTaken} trades reached the ${config.maxTradesPerSession} session limit`
            : `${context.tradesTaken} of ${config.maxTradesPerSession} session trades used`,
    });

    const openHit = config.maxOpenContracts > 0 && context.openContracts >= config.maxOpenContracts;
    checks.push({
        id: 'open-contracts',
        label: 'Simultaneous contracts',
        passed: !openHit,
        detail: openHit
            ? `${context.openContracts} open contract(s) reached the ${config.maxOpenContracts} limit`
            : `${context.openContracts} open contract(s) (limit ${config.maxOpenContracts})`,
    });

    const exposureHit = config.maxExposure > 0 && context.exposure + config.stake > config.maxExposure;
    checks.push({
        id: 'exposure',
        label: 'Session exposure',
        passed: !exposureHit,
        detail: exposureHit
            ? `Exposure ${(context.exposure + config.stake).toFixed(2)} would exceed the ${config.maxExposure} limit`
            : `Exposure ${context.exposure.toFixed(2)} of ${config.maxExposure}`,
    });

    const drawdown = context.sessionPeakPnl - context.sessionPnl;
    const drawdownHit = config.maxSessionDrawdown > 0 && drawdown >= config.maxSessionDrawdown;
    checks.push({
        id: 'drawdown',
        label: 'Session drawdown',
        passed: !drawdownHit,
        detail: drawdownHit
            ? `Drawdown ${drawdown.toFixed(2)} reached the ${config.maxSessionDrawdown} limit`
            : `Drawdown ${drawdown.toFixed(2)} of ${config.maxSessionDrawdown}`,
    });

    const cooldownActive =
        config.cooldownAfterLossMs > 0 &&
        context.lastLossAt !== null &&
        context.now - context.lastLossAt < config.cooldownAfterLossMs;
    const remaining = cooldownActive ? config.cooldownAfterLossMs - (context.now - (context.lastLossAt ?? 0)) : 0;
    checks.push({
        id: 'cooldown',
        label: 'Cool-down after a loss',
        passed: !cooldownActive,
        detail: cooldownActive
            ? `Cooling down — ${Math.ceil(remaining / 1000)}s remaining`
            : 'No cool-down active',
    });

    const failed = checks.filter(check => !check.passed);

    return {
        allowed: failed.length === 0,
        checks,
        reason: failed.length > 0 ? failed[0].detail : null,
    };
}

/** Clamps a user-entered config into the values the engine can honour. */
export function sanitiseRiskConfig(config: Partial<RiskConfig>, fallback: RiskConfig): RiskConfig {
    const merged = { ...fallback, ...config };
    const pick = (value: number, min: number, max: number, fallbackValue: number) =>
        Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallbackValue;

    return {
        stake: pick(Number(merged.stake), MIN_STAKE, 1000, fallback.stake),
        maxStake: pick(Number(merged.maxStake), MIN_STAKE, 10_000, fallback.maxStake),
        maxDailyLoss: pick(Number(merged.maxDailyLoss), 0, 1_000_000, fallback.maxDailyLoss),
        maxConsecutiveLosses: pick(Number(merged.maxConsecutiveLosses), 0, 100, fallback.maxConsecutiveLosses),
        maxTradesPerSession: pick(Number(merged.maxTradesPerSession), 0, 1000, fallback.maxTradesPerSession),
        maxOpenContracts: pick(Number(merged.maxOpenContracts), 0, 10, fallback.maxOpenContracts),
        maxExposure: pick(Number(merged.maxExposure), 0, 1_000_000, fallback.maxExposure),
        cooldownAfterLossMs: pick(Number(merged.cooldownAfterLossMs), 0, 3_600_000, fallback.cooldownAfterLossMs),
        maxSessionDrawdown: pick(Number(merged.maxSessionDrawdown), 0, 1_000_000, fallback.maxSessionDrawdown),
    };
}
