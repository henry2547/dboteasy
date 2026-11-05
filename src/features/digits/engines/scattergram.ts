/**
 * Engine D — 2D Digit Scattergram Matrix (Pacing & Spacing Analysis).
 *
 * The linear tick stream is re-projected into a time-series spatial layout:
 * every point is `{ tickIndex, digit, epoch }`, traced *backward* from the live
 * frame at index 0 to index −100. Plotting digit (y) against tick index (x)
 * turns "does digit 7 look hot?" into "where did the 7s actually land?".
 *
 * Use case: a digit can hold its 10% occurrence rate either rhythmically (even
 * gaps) or in dense bursts. The spacing read below separates the two — the
 * coefficient of variation of the gaps is near 0 for a metronome and high for a
 * clustered digit, even when both share the same total count.
 */

import type { DigitSpacing, ScatterPoint, Scattergram } from './types';

/** How far back the scattergram reaches (index 0 is the live frame). */
export const SCATTER_DEPTH = 100;

/** At least this many hits before a digit's spacing rhythm is judged. */
export const MIN_SPACING_OCCURRENCES = 3;

export function buildScatterPoints(ticks: Array<{ epoch: number; lastDigit: number }>, depth = SCATTER_DEPTH): ScatterPoint[] {
    const slice = ticks.slice(-(depth + 1));
    const newestIndex = slice.length - 1;

    return slice.map((tick, index) => ({
        tickIndex: index - newestIndex, // 0 = live frame, negative = walking back
        digit: tick.lastDigit,
        epoch: tick.epoch,
    }));
}

/** Gaps between consecutive occurrences of each digit, expressed in tick counts. */
export function computeDigitSpacing(points: ScatterPoint[]): DigitSpacing[] {
    // Points arrive oldest → newest with tickIndex −N → 0, so a forward scan
    // reads chronological positions.
    const positionsByDigit: number[][] = Array.from({ length: 10 }, () => []);

    points.forEach((point, position) => {
        if (Number.isInteger(point.digit) && point.digit >= 0 && point.digit <= 9) {
            positionsByDigit[point.digit].push(position);
        }
    });

    return positionsByDigit.map((positions, digit) => {
        if (positions.length < MIN_SPACING_OCCURRENCES) {
            return { digit, occurrences: positions.length, meanGap: null, gapStdev: null, coefficientOfVariation: null };
        }

        const gaps: number[] = [];
        for (let index = 1; index < positions.length; index++) {
            gaps.push(positions[index] - positions[index - 1]);
        }

        const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
        const variance = gaps.reduce((sum, gap) => sum + (gap - meanGap) ** 2, 0) / gaps.length;
        const gapStdev = Math.sqrt(variance);

        return {
            digit,
            occurrences: positions.length,
            meanGap,
            gapStdev,
            coefficientOfVariation: meanGap === 0 ? null : gapStdev / meanGap,
        };
    });
}

export function buildScattergram(ticks: Array<{ epoch: number; lastDigit: number }>, depth = SCATTER_DEPTH): Scattergram {
    const points = buildScatterPoints(ticks, depth);
    const spacing = computeDigitSpacing(points);
    const judged = spacing.filter(item => item.coefficientOfVariation !== null);

    const mostClustered = judged.length
        ? judged.reduce((best, item) =>
              (item.coefficientOfVariation as number) > (best.coefficientOfVariation as number) ? item : best
          )
        : null;
    const mostRhythmic = judged.length
        ? judged.reduce((best, item) =>
              (item.coefficientOfVariation as number) < (best.coefficientOfVariation as number) ? item : best
          )
        : null;

    return { points, spacing, mostClustered, mostRhythmic };
}
