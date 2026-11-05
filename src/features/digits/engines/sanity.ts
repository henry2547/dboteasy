/**
 * Aggregates the five engines into the standardized `MarketSanityMetrics`
 * broadcast contract. Pure — it takes the already-computed readings and shapes
 * them, it never touches the feed itself.
 */

import type { EntropyReading, LatencyGuardReading, MarketSanityMetrics, VelocityMatrix } from './types';

/**
 * Unknown measurements are broadcast as 0 (the contract types them as numbers).
 * `isExecutionSafe` stays authoritative — it is false whenever a measurement is
 * missing, so a consumer reading `network` cannot mistake "unmeasured" for
 * "safe".
 */
export function buildMarketSanityMetrics(params: {
    symbol: string;
    entropy: EntropyReading;
    latency: LatencyGuardReading;
    matrix: VelocityMatrix;
    timestamp?: number;
}): MarketSanityMetrics {
    const matrixConcentricConvergence: MarketSanityMetrics['matrixConcentricConvergence'] = {};

    Object.values(params.matrix.convergence).forEach(entry => {
        matrixConcentricConvergence[entry.digit] = {
            windowsAligned: entry.windowsAligned,
            state: entry.state,
        };
    });

    return {
        symbol: params.symbol,
        activeEntropyScore: params.entropy.entropy,
        entropyState: params.entropy.entropyState,
        network: {
            currentPingMs: params.latency.currentPingMs ?? 0,
            averageTickLifespanMs: params.latency.averageTickLifespanMs ?? 0,
            isExecutionSafe: params.latency.isExecutionSafe,
        },
        matrixConcentricConvergence,
        timestamp: params.timestamp ?? Date.now(),
    };
}
