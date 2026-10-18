/**
 * Engine A — Concentric Macro-to-Micro Digit Velocity Matrix.
 *
 * For every tick in the rolling FIFO buffer we compute the same statistic —
 * Frequency % = Count / WindowSize × 100 — over five *concentric* horizons at
 * once (20, 50, 100, 500, 1000). Stacking them exposes an imbalance that holds
 * at the micro scale *and* survives out to the macro scale, which is far more
 * interesting than a single noisy window.
 *
 * Probability reasoning for the 8% / 12% band: on a fair ten-sided wheel every
 * digit has p = 10%, so across a window of n ticks the count is Binomial(n, 0.1)
 * with σ = √(n·0.1·0.9). For the *large* windows a 1σ drift is already tiny
 * (n = 1000 → σ ≈ 9.5 ticks ≈ 0.95 percentage points), so a digit that lands
 * below 8% or above 12% in the 500- and 1000-tick windows is many σ away from
 * fair — i.e. a genuine structural skew rather than sampling noise. Requiring
 * the *same* digit to be outside the band in every window concurrently is a
 * deliberately strict convergence test: it trades sensitivity for specificity,
 * so a "flagged" row means deep macro-to-micro agreement, not one lucky window.
 */

import { DIGITS } from '../statistics';
import type { ConcentricWindow, ConvergenceState, DigitConvergence, VelocityMatrix } from './types';

/** The five concentric evaluation horizons, smallest (micro) to largest (macro). */
export const CONCENTRIC_WINDOWS = [20, 50, 100, 500, 1000];

/** Below this share a digit is statistically starved. */
export const CONVERGENCE_LOW_PERCENT = 8;

/** Above this share a digit is statistically hot. */
export const CONVERGENCE_HIGH_PERCENT = 12;

/** One window's frequency vector. Pure; `sampleSize` shrinks until the buffer fills. */
export function computeConcentricWindow(digits: number[], windowSize: number): ConcentricWindow {
    const sample = digits.slice(-windowSize);
    const counts = DIGITS.map(() => 0);

    sample.forEach(digit => {
        if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit] += 1;
    });

    const percentages = counts.map(count => (sample.length === 0 ? 0 : (count / sample.length) * 100));

    return { windowSize, sampleSize: sample.length, counts, percentages };
}

/**
 * Builds the full matrix. A row is "aligned" only when *every window that has
 * data* agrees it is starved (< 8%) or hot (> 12%); the state is PEAK only when
 * all of those windows are hot, EXHAUSTED only when all are starved, and
 * BALANCED otherwise (including the mixed case, which is not a clean
 * convergence signal).
 */
export function computeVelocityMatrix(digits: number[], windows: number[] = CONCENTRIC_WINDOWS): VelocityMatrix {
    const readings = windows.map(windowSize => computeConcentricWindow(digits, windowSize));
    const usable = readings.filter(reading => reading.sampleSize > 0);

    const convergence: Record<number, DigitConvergence> = {};

    DIGITS.forEach(digit => {
        const percentages = readings.map(reading => reading.percentages[digit]);
        const aligned = usable.filter(
            reading =>
                reading.percentages[digit] < CONVERGENCE_LOW_PERCENT ||
                reading.percentages[digit] > CONVERGENCE_HIGH_PERCENT
        );
        const windowsAligned = aligned.map(reading => reading.windowSize);

        let state: ConvergenceState = 'BALANCED';
        if (usable.length > 0 && windowsAligned.length === usable.length) {
            const allHot = usable.every(reading => reading.percentages[digit] > CONVERGENCE_HIGH_PERCENT);
            const allCold = usable.every(reading => reading.percentages[digit] < CONVERGENCE_LOW_PERCENT);
            state = allHot ? 'PEAK' : allCold ? 'EXHAUSTED' : 'BALANCED';
        }

        convergence[digit] = {
            digit,
            windowsAligned,
            state,
            minPercentage: percentages.length ? Math.min(...percentages) : 0,
            maxPercentage: percentages.length ? Math.max(...percentages) : 0,
        };
    });

    return { windows: readings, convergence };
}

/** True when a percentage sits outside the fair-play band — used by the UI to tint a cell. */
export function isOutOfBand(percentage: number): boolean {
    return percentage < CONVERGENCE_LOW_PERCENT || percentage > CONVERGENCE_HIGH_PERCENT;
}
