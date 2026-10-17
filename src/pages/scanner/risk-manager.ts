/**
 * Independent risk manager.
 *
 * The risk manager is deliberately separate from the AI scanner and the
 * strategy engine: it validates a signal against the user's configured
 * restrictions *before* any live purchase. It never increases the stake after a
 * loss, never applies Martingale or loss-recovery staking, and never bypasses a
 * limit. When a mandatory check fails it rejects the entry and records why.
 */

import type {
    ContractRecord,
    RiskCheck,
    RiskCheckResult,
    ScannerConfig,
    SessionStats,
    StrategySignal,
} from './scanner-types';

export interface RiskContext {
    config: ScannerConfig;
    session: SessionStats;
    openContracts: ContractRecord[];
    authorized: boolean;
    /** Epoch (ms) of the last accepted entry — for cooldown. */
    lastEntryAt: number | null;
    /** Epoch (ms) of the last signal accepted for this symbol — for min spacing. */
    lastSignalAt: number | null;
    /** Realised loss so far today (across sessions), in account currency. */
    dailyLoss: number;
    now: number;
    /** True when the account is permitted to trade the requested contract type. */
    marketPermitted: boolean;
    /** True when real-money execution has been explicitly armed by the user. */
    realArmed: boolean;
}

/**
 * Runs every mandatory pre-trade check. Returns a structured result; `passed`
 * is true only when every check passed.
 */
export function checkRisk(signal: StrategySignal, ctx: RiskContext): RiskCheckResult {
    const checks: RiskCheck[] = [];
    const { config, session, openContracts, authorized, now } = ctx;

    const add = (name: string, passed: boolean, reason: string | null) => checks.push({ name, passed, reason });

    // 1. Stake validity and limits.
    const stakeOk = Number.isFinite(config.stake) && config.stake > 0 && config.stake <= config.maxStake;
    add('Stake within limits', stakeOk, stakeOk ? null : `Stake ${config.stake} invalid or above max ${config.maxStake}.`);

    // 2. Session loss limit.
    const lossLimitHit = session.realizedPnl <= -Math.abs(config.sessionLossLimit);
    add('Session loss limit not reached', !lossLimitHit, lossLimitHit ? `Session loss limit ${config.sessionLossLimit} reached.` : null);

    // 3. Profit target.
    const profitHit = config.stopOnProfitTarget && session.realizedPnl >= config.sessionProfitTarget;
    add('Profit target not reached', !profitHit, profitHit ? `Profit target ${config.sessionProfitTarget} reached.` : null);

    // 4. Daily loss limit.
    const dailyHit = ctx.dailyLoss <= -Math.abs(config.dailyLossLimit);
    add('Daily loss limit not reached', !dailyHit, dailyHit ? `Daily loss limit ${config.dailyLossLimit} reached.` : null);

    // 5. Trade count.
    const tradesHit = session.trades >= config.maxTrades;
    add('Trade count not reached', !tradesHit, tradesHit ? `Max trades ${config.maxTrades} reached.` : null);

    // 6. Consecutive losses.
    const consecLossHit = session.consecutiveLosses >= config.maxConsecutiveLosses;
    add('Consecutive-loss limit not reached', !consecLossHit, consecLossHit ? `${config.maxConsecutiveLosses} losses in a row.` : null);

    // 7. Consecutive wins (optional cap).
    const consecWinHit = config.maxConsecutiveWins !== null && session.consecutiveWins >= config.maxConsecutiveWins;
    add('Consecutive-win limit not reached', !consecWinHit, consecWinHit ? `${config.maxConsecutiveWins} wins in a row.` : null);

    // 8. Concurrent contracts.
    const concurrentHit = openContracts.length >= config.maxConcurrentContracts;
    add('Concurrent-contract limit not exceeded', !concurrentHit, concurrentHit ? `${config.maxConcurrentContracts} contracts already open.` : null);

    // 9. Cooldown.
    const cooldownOk = ctx.lastEntryAt === null || now - ctx.lastEntryAt >= config.cooldownMs;
    add('Cooldown completed', cooldownOk, cooldownOk ? null : 'Cooldown in progress.');

    // 10. Minimum time between repeated signals.
    const spacingOk = ctx.lastSignalAt === null || now - ctx.lastSignalAt >= config.minTimeBetweenSignalsMs;
    add('Minimum signal spacing', spacingOk, spacingOk ? null : 'Signal arrived too soon after the last one.');

    // 11. Signal not expired (entry delay).
    const signalAge = now - signal.signalTimestamp;
    const signalFresh = signalAge <= config.maxEntryDelayMs;
    add('Signal not expired', signalFresh, signalFresh ? null : `Signal ${Math.round(signalAge / 1000)}s old (max ${config.maxEntryDelayMs / 1000}s).`);

    // 12. Quote freshness (from the signal's tick epoch).
    const quoteAge = signal.tickEpoch ? now / 1000 - signal.tickEpoch : Infinity;
    const quoteFresh = quoteAge * 1000 <= config.maxQuoteAgeMs;
    add('Quote fresh', quoteFresh, quoteFresh ? null : `Quote ${Math.round(quoteAge)}s old.`);

    // 13. Account authorized.
    add('Account authorized', authorized, authorized ? null : 'Account is not authorized.');

    // 13b. Real execution armed (Demo always passes).
    const realArmedOk = config.accountMode !== 'real' || ctx.realArmed;
    add('Real execution armed', realArmedOk, realArmedOk ? null : 'Real mode requires explicit arming before live orders.');

    // 14. Market/contract permitted.
    add('Market and contract permitted', ctx.marketPermitted, ctx.marketPermitted ? null : 'Market or contract type not permitted.');

    // 15. Config version unchanged.
    const versionOk = signal.configVersion === configVersionHash(ctx.config);
    add('Config unchanged', versionOk, versionOk ? null : 'Signal was generated under a different config.');

    const failed = checks.filter(c => !c.passed);
    return {
        passed: failed.length === 0,
        checks,
        reason: failed.length > 0 ? failed.map(c => c.name).join('; ') : null,
    };
}

/** Duplicate-signal guard: rejects a signal whose id was already actioned. */
export function isDuplicateSignal(signal: StrategySignal, actionedIds: Set<string>): boolean {
    return actionedIds.has(signal.id);
}

// Local copy of the config-version hash so the risk manager has no import
// dependency on the engine — it stays independently testable.
function configVersionHash(config: ScannerConfig): string {
    const relevant = {
        w: config.analysisWindow,
        s: config.strategies.filter(t => t.enabled).map(t => `${t.id}:${t.digit ?? 'auto'}`),
        d: config.durationTicks,
        p: config.patterns.map(p => `${p.sequence.join('')}-${p.barrier}-${p.direction}`),
    };
    return JSON.stringify(relevant);
}
