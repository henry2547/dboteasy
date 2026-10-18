/**
 * Reactive layer for the five advanced analytics engines.
 *
 * It reads the ONE shared Digits feed (never a second WebSocket) and derives
 * every engine reading from it. All maths lives in `./engines` — this hook only
 * wires the live feed to those pure functions, so the engines stay unit-testable
 * without React.
 */

import { useMemo } from 'react';
import { useDigitsLabContext } from './digits-lab-context';
import {
    buildMarketSanityMetrics,
    buildScattergram,
    computeEntropy,
    computeLatencyGuard,
    computeVelocityMatrix,
    runWalkForward,
} from './engines';
import { digitSequence } from './statistics';

export function useLabEngines() {
    const lab = useDigitsLabContext();
    const { ticks, analysisWindow, connection, selectedMarket } = lab;

    // The engines that reason about deep history read the whole FIFO buffer;
    // the entropy tracker honours the page's selected analysis window.
    const allDigits = useMemo(() => digitSequence(ticks), [ticks]);
    const epochs = useMemo(() => ticks.map(tick => tick.epoch), [ticks]);

    const velocityMatrix = useMemo(() => computeVelocityMatrix(allDigits), [allDigits]);
    const entropy = useMemo(() => computeEntropy(allDigits, analysisWindow), [allDigits, analysisWindow]);
    const latencyGuard = useMemo(
        () => computeLatencyGuard({ pingMs: connection.latencyMs, epochs }),
        [connection.latencyMs, epochs]
    );
    const scattergram = useMemo(() => buildScattergram(ticks), [ticks]);
    const walkForward = useMemo(() => runWalkForward(allDigits), [allDigits]);

    const sanity = useMemo(
        () =>
            buildMarketSanityMetrics({
                symbol: selectedMarket?.apiSymbol ?? '—',
                entropy,
                latency: latencyGuard,
                matrix: velocityMatrix,
            }),
        [selectedMarket?.apiSymbol, entropy, latencyGuard, velocityMatrix]
    );

    return { velocityMatrix, entropy, latencyGuard, scattergram, walkForward, sanity };
}
