/**
 * Strategy Evaluation Engine — deterministic signal generation.
 *
 * Takes a market ranking from the scanner and produces a structured signal
 * containing all the metadata the risk manager and execution engine need.
 * The AI scanner may rank and explain; this engine decides whether the
 * configured conditions are actually satisfied.
 */

import type { MarketRanking, StrategySignal, TradingSettings } from './types';

let configVersionCounter = 0;

export function nextConfigVersion(): number {
    configVersionCounter += 1;
    return configVersionCounter;
}

/**
 * Build a structured signal from a qualifying market ranking.
 * Returns null if the ranking does not qualify (no setup).
 */
export function buildSignal(
    ranking: MarketRanking,
    settings: TradingSettings,
    configVersion: number,
    tickEpoch: number | null
): StrategySignal | null {
    if (!ranking.qualifies || !ranking.strategyId) return null;

    return {
        id: `sig_${Date.now()}_${ranking.symbol}_${ranking.strategyId}`,
        symbol: ranking.symbol,
        strategyId: ranking.strategyId,
        strategyLabel: ranking.strategyLabel ?? ranking.strategyId,
        contractType: ranking.strategyId
            ? contractTypeForStrategy(ranking.strategyId)
            : '',
        digit: ranking.proposedDigit,
        barrier: ranking.proposedBarrier,
        timestamp: Date.now(),
        tickEpoch,
        configVersion,
        analysis: ranking.analysis,
        conditionsPassed: ranking.conditionsPassed.map(c => c.label),
        conditionsFailed: ranking.conditionsFailed.map(c => c.label),
        reason: ranking.reason,
    };
}

/** Map a strategy id to its Deriv contract_type code. */
export function contractTypeForStrategy(strategyId: string): string {
    switch (strategyId) {
        case 'matches':
            return 'DIGITMATCH';
        case 'differs':
            return 'DIGITDIFF';
        case 'over1':
            return 'DIGITOVER';
        case 'under8':
            return 'DIGITUNDER';
        case 'even':
            return 'DIGITEVEN';
        case 'odd':
            return 'DIGITODD';
        default:
            return '';
    }
}

/**
 * Build the Deriv proposal request parameters from a signal and settings.
 */
export function proposalParamsFromSignal(
    signal: StrategySignal,
    settings: TradingSettings,
    currency: string
): Record<string, unknown> {
    const params: Record<string, unknown> = {
        proposal: 1,
        amount: settings.stake,
        basis: 'stake',
        contract_type: signal.contractType,
        currency,
        duration: settings.duration,
        duration_unit: settings.durationUnit,
        symbol: signal.symbol,
    };

    // Digit contracts need a barrier (the prediction digit or the over/under threshold).
    if (signal.barrier !== null) {
        params.barrier = signal.barrier;
    }

    return params;
}

/**
 * Check whether a signal has expired (too old relative to maxEntryDelayMs).
 */
export function isSignalExpired(signal: StrategySignal, maxEntryDelayMs: number): boolean {
    return Date.now() - signal.timestamp > maxEntryDelayMs;
}
