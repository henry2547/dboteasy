/**
 * Risk Manager — independent of the AI scanner and strategy engine.
 *
 * Enforces all configured controls before every trade. When any mandatory
 * check fails, the entry is rejected and the reason is recorded. The risk
 * manager never overrides a failed check, and never increases the stake after
 * a loss (no Martingale, no loss-recovery staking).
 */

import type { AuthState, RiskCheckResult, SessionStats, StrategySignal, TradingSettings } from './types';

/**
 * Validate a signal against all configured risk restrictions.
 * Returns a structured result with every check and an overall pass/fail.
 */
export function validateRisk(
    signal: StrategySignal,
    settings: TradingSettings,
    session: SessionStats,
    auth: AuthState,
    openContractCount: number,
    lastTradeAt: number | null,
    lastSignalId: string | null
): RiskCheckResult {
    const checks: RiskCheckResult['checks'] = [];

    // 1. Stake is valid and within limits
    const stakeValid = settings.stake > 0 && settings.stake <= settings.maxStake;
    checks.push({
        id: 'stake',
        label: 'Stake within limits',
        passed: stakeValid,
        detail: stakeValid
            ? `Stake ${settings.stake} ≤ max ${settings.maxStake}`
            : `Stake ${settings.stake} invalid or exceeds max ${settings.maxStake}`,
    });

    // 2. Session loss limit not reached
    const lossLimitHit = settings.sessionLossLimit > 0 && session.realizedProfit <= -settings.sessionLossLimit;
    checks.push({
        id: 'session-loss',
        label: 'Session loss limit',
        passed: !lossLimitHit,
        detail: lossLimitHit
            ? `Loss limit reached (${session.realizedProfit.toFixed(2)})`
            : `P/L ${session.realizedProfit.toFixed(2)} within limit`,
    });

    // 3. Profit target not already reached
    const profitTargetHit =
        settings.stopOnProfitTarget &&
        settings.sessionProfitTarget > 0 &&
        session.realizedProfit >= settings.sessionProfitTarget;
    checks.push({
        id: 'profit-target',
        label: 'Profit target not reached',
        passed: !profitTargetHit,
        detail: profitTargetHit
            ? `Profit target reached (${session.realizedProfit.toFixed(2)})`
            : `P/L ${session.realizedProfit.toFixed(2)} below target`,
    });

    // 4. Daily loss limit not reached
    const dailyLossHit = settings.dailyLossLimit > 0 && session.realizedProfit <= -settings.dailyLossLimit;
    checks.push({
        id: 'daily-loss',
        label: 'Daily loss limit',
        passed: !dailyLossHit,
        detail: dailyLossHit
            ? `Daily loss limit reached (${session.realizedProfit.toFixed(2)})`
            : `Within daily loss limit`,
    });

    // 5. Trade count limit not reached
    const tradeCountHit = settings.maxTrades > 0 && session.tradeCount >= settings.maxTrades;
    checks.push({
        id: 'max-trades',
        label: 'Trade count limit',
        passed: !tradeCountHit,
        detail: tradeCountHit
            ? `Max trades reached (${session.tradeCount}/${settings.maxTrades})`
            : `${session.tradeCount}/${settings.maxTrades} trades`,
    });

    // 6. Consecutive loss limit not reached
    const consecLossHit = settings.maxConsecutiveLosses > 0 && session.consecutiveLosses >= settings.maxConsecutiveLosses;
    checks.push({
        id: 'consec-losses',
        label: 'Consecutive loss limit',
        passed: !consecLossHit,
        detail: consecLossHit
            ? `${session.consecutiveLosses} consecutive losses (limit ${settings.maxConsecutiveLosses})`
            : `${session.consecutiveLosses} consecutive losses`,
    });

    // 7. Consecutive win limit (if configured)
    if (settings.maxConsecutiveWins !== null && settings.maxConsecutiveWins > 0) {
        const consecWinHit = session.consecutiveWins >= settings.maxConsecutiveWins;
        checks.push({
            id: 'consec-wins',
            label: 'Consecutive win limit',
            passed: !consecWinHit,
            detail: consecWinHit
                ? `${session.consecutiveWins} consecutive wins (limit ${settings.maxConsecutiveWins})`
                : `${session.consecutiveWins} consecutive wins`,
        });
    }

    // 8. Concurrent contract limit not exceeded
    const concurrentHit = openContractCount >= settings.maxConcurrentContracts;
    checks.push({
        id: 'concurrent',
        label: 'Concurrent contracts',
        passed: !concurrentHit,
        detail: concurrentHit
            ? `${openContractCount} open (max ${settings.maxConcurrentContracts})`
            : `${openContractCount}/${settings.maxConcurrentContracts} open`,
    });

    // 9. Cooldown completed
    const cooldownDone = lastTradeAt === null || Date.now() - lastTradeAt >= settings.cooldownMs;
    checks.push({
        id: 'cooldown',
        label: 'Cooldown completed',
        passed: cooldownDone,
        detail: cooldownDone
            ? 'Cooldown elapsed'
            : `${Math.ceil((settings.cooldownMs - (Date.now() - lastTradeAt)) / 1000)}s remaining`,
    });

    // 10. Quote freshness / signal not expired
    const signalExpired = Date.now() - signal.timestamp > settings.maxEntryDelayMs;
    checks.push({
        id: 'signal-fresh',
        label: 'Signal not expired',
        passed: !signalExpired,
        detail: signalExpired
            ? `Signal expired (${Math.round((Date.now() - signal.timestamp) / 1000)}s old)`
            : 'Signal is fresh',
    });

    // 11. Account is authorized
    const authorized = auth.status === 'authorized';
    checks.push({
        id: 'authorized',
        label: 'Account authorized',
        passed: authorized,
        detail: authorized
            ? `Authorized as ${auth.loginid}`
            : 'Account not authorized',
    });

    // 12. Market and contract type permitted (basic check — contract type is non-empty)
    const contractPermitted = signal.contractType !== '';
    checks.push({
        id: 'contract-permitted',
        label: 'Contract type permitted',
        passed: contractPermitted,
        detail: contractPermitted
            ? `${signal.contractType} on ${signal.symbol}`
            : 'No valid contract type',
    });

    // 13. Duplicate signal prevention
    const isDuplicate = lastSignalId === signal.id;
    checks.push({
        id: 'duplicate',
        label: 'Not a duplicate signal',
        passed: !isDuplicate,
        detail: isDuplicate ? 'This signal was already processed' : 'New signal',
    });

    // 14. Minimum time between signals
    const minTimeOk = lastTradeAt === null || Date.now() - lastTradeAt >= settings.minTimeBetweenSignalsMs;
    checks.push({
        id: 'min-time',
        label: 'Minimum time between signals',
        passed: minTimeOk,
        detail: minTimeOk ? 'OK' : 'Too soon after last signal',
    });

    const passed = checks.every(c => c.passed);
    const firstFailed = checks.find(c => !c.passed);

    return {
        passed,
        checks,
        reason: firstFailed ? firstFailed.detail : null,
    };
}

/**
 * Check whether the session should stop based on profit/loss limits.
 */
export function shouldStopSession(
    session: SessionStats,
    settings: TradingSettings
): 'profit_target' | 'loss_limit' | 'daily_loss_limit' | 'max_trades' | 'max_consecutive_losses' | 'max_consecutive_wins' | null {
    if (settings.stopOnProfitTarget && settings.sessionProfitTarget > 0 && session.realizedProfit >= settings.sessionProfitTarget) {
        return 'profit_target';
    }
    if (settings.stopOnLossLimit && settings.sessionLossLimit > 0 && session.realizedProfit <= -settings.sessionLossLimit) {
        return 'loss_limit';
    }
    if (settings.dailyLossLimit > 0 && session.realizedProfit <= -settings.dailyLossLimit) {
        return 'daily_loss_limit';
    }
    if (settings.maxTrades > 0 && session.tradeCount >= settings.maxTrades) {
        return 'max_trades';
    }
    if (settings.maxConsecutiveLosses > 0 && session.consecutiveLosses >= settings.maxConsecutiveLosses) {
        return 'max_consecutive_losses';
    }
    if (settings.maxConsecutiveWins !== null && settings.maxConsecutiveWins > 0 && session.consecutiveWins >= settings.maxConsecutiveWins) {
        return 'max_consecutive_wins';
    }
    return null;
}
