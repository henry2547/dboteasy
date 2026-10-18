/**
 * Unit tests for the five advanced analytics engines (Engine A–E).
 *
 * Every engine is a pure function of the digit/epoch arrays, so the whole suite
 * runs without a WebSocket, React or a browser.
 */

import { computeEntropy, entropyStateFor, MAX_ENTROPY, STRUCTURAL_CLUSTER_THRESHOLD } from '../entropy-tracker';
import { averageTickLifespan, computeLatencyGuard, PING_BUDGET_SHARE } from '../latency-guard';
import { buildMarketSanityMetrics } from '../sanity';
import { buildScatterPoints, computeDigitSpacing, buildScattergram } from '../scattergram';
import { computeVelocityMatrix, isOutOfBand, CONCENTRIC_WINDOWS } from '../velocity-matrix';
import { runWalkForward, WF_STATE_WINDOW } from '../walk-forward';
import type { WalkForwardSetup } from '../types';

const uniform1000 = Array.from({ length: 1000 }, (_, index) => index % 10);

describe('Engine A — concentric velocity matrix', () => {
    it('reports five concentric windows', () => {
        const matrix = computeVelocityMatrix(uniform1000);
        expect(matrix.windows.map(window => window.windowSize)).toEqual(CONCENTRIC_WINDOWS);
        expect(matrix.windows.every(window => window.sampleSize === window.windowSize)).toBe(true);
    });

    it('leaves a balanced feed unflagged', () => {
        const matrix = computeVelocityMatrix(uniform1000);
        expect(matrix.convergence[0].state).toBe('BALANCED');
        expect(matrix.convergence[3].windowsAligned).toHaveLength(0);
    });

    it('flags a digit that never lands as EXHAUSTED across every window', () => {
        const noZero = Array.from({ length: 1000 }, (_, index) => 1 + (index % 9));
        const matrix = computeVelocityMatrix(noZero);
        expect(matrix.convergence[0].state).toBe('EXHAUSTED');
        expect(matrix.convergence[0].windowsAligned).toEqual(CONCENTRIC_WINDOWS);
        expect(matrix.convergence[1].state).toBe('BALANCED');
    });

    it('treats the 8–12% band as inclusive', () => {
        expect(isOutOfBand(7.99)).toBe(true);
        expect(isOutOfBand(8)).toBe(false);
        expect(isOutOfBand(12)).toBe(false);
        expect(isOutOfBand(12.01)).toBe(true);
    });
});

describe('Engine B — Shannon entropy tracker', () => {
    it('reaches the log2(10) ceiling on a perfectly uniform feed', () => {
        const reading = computeEntropy(Array.from({ length: 100 }, (_, index) => index % 10), 100);
        expect(reading.entropy).toBeCloseTo(MAX_ENTROPY, 6);
        expect(reading.maxEntropy).toBeCloseTo(3.321928, 5);
        expect(reading.purityRatio).toBeCloseTo(1, 6);
        expect(reading.entropyState).toBe('PURE_NOISE');
    });

    it('collapses to zero bits when every tick is the same digit', () => {
        const reading = computeEntropy(Array(100).fill(3), 100);
        expect(reading.entropy).toBeCloseTo(0, 6);
        expect(reading.entropyState).toBe('STRUCTURAL_CLUSTER');
    });

    it('switches state at the 2.95-bit floor', () => {
        expect(entropyStateFor(STRUCTURAL_CLUSTER_THRESHOLD - 0.001)).toBe('STRUCTURAL_CLUSTER');
        expect(entropyStateFor(STRUCTURAL_CLUSTER_THRESHOLD)).toBe('PURE_NOISE');
    });

    it('honours the selected window', () => {
        const reading = computeEntropy(uniform1000, 50);
        expect(reading.windowSize).toBe(50);
        expect(reading.sampleSize).toBe(50);
    });
});

describe('Engine C — latency & execution safety guard', () => {
    const twoSecondTicks = Array.from({ length: 61 }, (_, index) => 1000 + index * 2);

    it('averages the tick lifespan in milliseconds', () => {
        expect(averageTickLifespan(twoSecondTicks)).toBeCloseTo(2000, 6);
    });

    it('certifies the feed while the ping is inside the budget', () => {
        const guard = computeLatencyGuard({ pingMs: 500, epochs: twoSecondTicks });
        expect(guard.pingShare).toBeCloseTo(0.25, 6);
        expect(guard.isExecutionSafe).toBe(true);
    });

    it('trips once the ping exceeds the 40% budget', () => {
        const guard = computeLatencyGuard({ pingMs: 900, epochs: twoSecondTicks });
        expect(guard.pingShare).toBeCloseTo(0.45, 6);
        expect(guard.isExecutionSafe).toBe(false);
        expect(guard.reason).toContain('over');
    });

    it('holds the boundary at exactly the budget share', () => {
        const guard = computeLatencyGuard({ pingMs: 800, epochs: twoSecondTicks });
        expect(guard.pingShare).toBeCloseTo(PING_BUDGET_SHARE, 6);
        expect(guard.isExecutionSafe).toBe(true);
    });

    it('fails closed when a measurement is missing', () => {
        const noPing = computeLatencyGuard({ pingMs: null, epochs: twoSecondTicks });
        expect(noPing.pingShare).toBeNull();
        expect(noPing.isExecutionSafe).toBe(false);

        const noTicks = computeLatencyGuard({ pingMs: 120, epochs: [1, 2] });
        expect(noTicks.averageTickLifespanMs).toBeNull();
        expect(noTicks.isExecutionSafe).toBe(false);
    });
});

describe('Engine D — digit scattergram', () => {
    it('traces backward from the live frame at index 0', () => {
        const points = buildScatterPoints([
            { epoch: 1, lastDigit: 2 },
            { epoch: 2, lastDigit: 4 },
            { epoch: 3, lastDigit: 6 },
        ]);
        expect(points.map(point => point.tickIndex)).toEqual([-2, -1, 0]);
        expect(points[2]).toEqual({ tickIndex: 0, digit: 6, epoch: 3 });
    });

    it('measures spacing rhythm by the coefficient of variation', () => {
        const spacing = computeDigitSpacing([
            { tickIndex: -4, digit: 7, epoch: 1 },
            { tickIndex: -3, digit: 7, epoch: 2 },
            { tickIndex: -2, digit: 7, epoch: 3 },
            { tickIndex: -1, digit: 1, epoch: 4 },
            { tickIndex: 0, digit: 7, epoch: 5 },
        ]);

        const seven = spacing[7];
        expect(seven.occurrences).toBe(4);
        expect(seven.meanGap).toBeCloseTo(4 / 3, 6);
        expect(seven.coefficientOfVariation).toBeGreaterThan(0);

        // A digit with too few hits has no judged rhythm.
        expect(spacing[1].occurrences).toBe(1);
        expect(spacing[1].coefficientOfVariation).toBeNull();
    });

    it('reaches back over the full scatter depth', () => {
        const ticks = Array.from({ length: 101 }, (_, index) => ({ epoch: 1000 + index, lastDigit: index % 10 }));
        const scattergram = buildScattergram(ticks);
        expect(scattergram.points).toHaveLength(101);
        expect(scattergram.points[0].tickIndex).toBe(-100);
        expect(scattergram.points[100].tickIndex).toBe(0);
    });
});

describe('Engine E — zero-lookahead walk-forward', () => {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 7, 2, 9, 1, 5];
    const alwaysEnter: WalkForwardSetup = {
        id: 'always',
        label: 'Always',
        shouldEnter: past => past.length === WF_STATE_WINDOW,
        wins: nextDigit => nextDigit > 4,
    };

    it('resolves outcomes one index past the decision', () => {
        const report = runWalkForward(digits, [alwaysEnter], WF_STATE_WINDOW);
        const result = report.setups[0];
        expect(result.entries).toBe(5); // decision indices 19..23
        expect(result.wins).toBe(3); // outcomes 7, 2, 9, 1, 5
        expect(result.losses).toBe(2);
        expect(result.winRate).toBeCloseTo(60, 6);
        expect(result.expectancy).toBeCloseTo(0.2, 6);
        expect(report.evaluatedIndices).toBe(5);
        expect(report.lookaheadViolations).toBe(0);
    });

    it('only ever exposes state ending at the decision index', () => {
        const seenLast: number[] = [];
        const spy: WalkForwardSetup = {
            id: 'spy',
            label: 'Spy',
            shouldEnter: past => {
                seenLast.push(past[past.length - 1]);
                return false;
            },
            wins: () => false,
        };
        runWalkForward(digits, [spy], WF_STATE_WINDOW);
        // The last visible digit is always digits[i], never digits[i + 1].
        expect(seenLast).toEqual(digits.slice(19, 24));
    });

    it('runs the shipped rule presets without a lookahead violation', () => {
        const report = runWalkForward(uniform1000);
        expect(report.lookaheadViolations).toBe(0);
        expect(report.setups).toHaveLength(6);
    });
});

describe('MarketSanityMetrics broadcast', () => {
    it('shapes every engine into the standardized contract', () => {
        const matrix = computeVelocityMatrix(uniform1000);
        const entropy = computeEntropy(uniform1000, 100);
        const latency = computeLatencyGuard({ pingMs: 500, epochs: Array.from({ length: 61 }, (_, i) => 1000 + i * 2) });

        const metrics = buildMarketSanityMetrics({ symbol: 'R_100', matrix, entropy, latency, timestamp: 42 });

        expect(metrics.symbol).toBe('R_100');
        expect(metrics.activeEntropyScore).toBeCloseTo(MAX_ENTROPY, 6);
        expect(metrics.entropyState).toBe('PURE_NOISE');
        expect(metrics.network).toEqual({
            currentPingMs: 500,
            averageTickLifespanMs: 2000,
            isExecutionSafe: true,
        });
        expect(Object.keys(metrics.matrixConcentricConvergence)).toHaveLength(10);
        expect(metrics.matrixConcentricConvergence[0]).toEqual({ windowsAligned: [], state: 'BALANCED' });
        expect(metrics.timestamp).toBe(42);
    });

    it('broadcasts unknown measurements as zero without faking safety', () => {
        const metrics = buildMarketSanityMetrics({
            symbol: 'R_10',
            matrix: computeVelocityMatrix([]),
            entropy: computeEntropy([], 100),
            latency: computeLatencyGuard({ pingMs: null, epochs: [] }),
        });

        expect(metrics.network.currentPingMs).toBe(0);
        expect(metrics.network.averageTickLifespanMs).toBe(0);
        expect(metrics.network.isExecutionSafe).toBe(false);
    });
});
