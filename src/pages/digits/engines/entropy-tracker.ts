/**
 * Engine B — Live Shannon Entropy Tracker (Unpredictability Index).
 *
 * H(X) = -Σ_{i=0..9} P(xᵢ)·log₂P(xᵢ), where P(xᵢ) is the digit's live
 * frequency probability inside the analysis window.
 *
 * Why log₂(10) is the ceiling: a fair digit wheel has ten equiprobable
 * outcomes, so H = log₂(10) ≈ 3.3219 bits — maximum uncertainty, nothing to
 * exploit. As the distribution concentrates onto fewer digits, H falls.
 *
 * Threshold reasoning: the 2.95-floor is 0.37 bits below the ceiling, i.e. the
 * feed has to be measurably more predictable than chance before we call it
 * STRUCTURAL_CLUSTER. On a genuinely random stream the expected entropy over a
 * 100-tick sample sits around ≈3.24 bits (finite-sample bias), so 2.95 is well
 * clear of ordinary sampling wobble and only trips on real compression.
 *
 * Note on the two states: the contract exposes a binary state. H ≥ 2.95 reads
 * as PURE_NOISE (the top of the range approaches the 3.3219 ceiling), H < 2.95
 * as STRUCTURAL_CLUSTER. `purityRatio` is published alongside it so the UI can
 * show *how* near the ceiling the feed actually is rather than implying every
 * PURE_NOISE reading is a perfect coin.
 */

import { DIGITS } from '../statistics';
import type { EntropyReading, EntropyState } from './types';

/** log₂(10) — the maximum entropy of a ten-digit alphabet. */
export const MAX_ENTROPY = Math.log2(10);

/** H below this many bits means the distribution is compressed (not noise). */
export const STRUCTURAL_CLUSTER_THRESHOLD = 2.95;

/** Default analysis window for the entropy reading. */
export const ENTROPY_WINDOW = 100;

/** Shannon entropy of a digit sequence over the last `windowSize` ticks. */
export function shannonEntropy(digits: number[], windowSize: number): number {
    const sample = digits.slice(-windowSize);
    if (sample.length === 0) return 0;

    const counts = DIGITS.map(() => 0);
    sample.forEach(digit => {
        if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit] += 1;
    });

    let entropy = 0;
    counts.forEach(count => {
        if (count === 0) return; // 0·log₂0 is defined as 0 — skip rather than emit NaN
        const probability = count / sample.length;
        entropy -= probability * Math.log2(probability);
    });

    return entropy;
}

export function entropyStateFor(entropy: number): EntropyState {
    return entropy < STRUCTURAL_CLUSTER_THRESHOLD ? 'STRUCTURAL_CLUSTER' : 'PURE_NOISE';
}

export function computeEntropy(digits: number[], windowSize = ENTROPY_WINDOW): EntropyReading {
    const sampleSize = Math.min(windowSize, digits.length);
    const entropy = shannonEntropy(digits, windowSize);

    return {
        windowSize,
        sampleSize,
        entropy,
        maxEntropy: MAX_ENTROPY,
        purityRatio: MAX_ENTROPY === 0 ? 0 : entropy / MAX_ENTROPY,
        entropyState: entropyStateFor(entropy),
    };
}
