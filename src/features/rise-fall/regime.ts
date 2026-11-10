/**
 * Market-regime detection — pure, tick-driven, React-free.
 *
 * The classifier answers "what kind of market is this?" for the strategy layer's
 * suitability filter. It never predicts, never interpolates and never fills a
 * missing tick: it reads the genuine quotes it is given and returns `uncertain`
 * until it has enough of them.
 */

import type { RegimeId, RegimeState, Tick } from './types';

/** Below this many ticks the classifier refuses to name a regime. */
export const MIN_REGIME_TICKS = 30;

/** The classifier reads at most this many most-recent ticks. */
export const REGIME_WINDOW = 200;

export const REGIME_LABELS: Record<RegimeId, string> = {
    strong_uptrend: 'Strong uptrend',
    weak_uptrend: 'Weak uptrend',
    strong_downtrend: 'Strong downtrend',
    weak_downtrend: 'Weak downtrend',
    sideways: 'Sideways',
    high_volatility: 'High volatility',
    low_volatility: 'Low volatility',
    volatility_expansion: 'Volatility expansion',
    possible_reversal: 'Possible reversal',
    uncertain: 'Uncertain',
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function meanAbsolute(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}

function standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

const UNCERTAIN: RegimeState = {
    id: 'uncertain',
    label: REGIME_LABELS.uncertain,
    direction: 'flat',
    trendStrength: 0,
    meanAbsMove: 0,
    volatility: 0,
    expansion: 0,
};

export function classifyRegime(ticks: Tick[]): RegimeState {
    const window = ticks.slice(-REGIME_WINDOW);
    if (window.length < MIN_REGIME_TICKS) return { ...UNCERTAIN };

    const deltas: number[] = [];
    for (let index = 1; index < window.length; index += 1) {
        deltas.push(window[index].quote - window[index - 1].quote);
    }

    const meanAbsMove = meanAbsolute(deltas);
    const volatility = standardDeviation(deltas);
    const net = window[window.length - 1].quote - window[0].quote;

    // Kaufman efficiency ratio: net move over the total distance travelled.
    // 0 = pure noise, 1 = a straight line. It is a description, not a forecast.
    const travelled = meanAbsMove * deltas.length;
    const trendStrength = travelled > 0 ? clamp01((Math.abs(net) / travelled - 0.1) / 0.35) : 0;

    // Recent third against the earlier window: widening or contracting?
    const split = Math.floor(deltas.length * 0.66);
    const earlierMove = meanAbsolute(deltas.slice(0, split));
    const recentMove = meanAbsolute(deltas.slice(split));
    const ratio = earlierMove > 0 ? recentMove / earlierMove : recentMove > 0 ? 2 : 1;
    const expansion = clamp01((ratio - 1) / 1.5);
    const contraction = clamp01((1 - ratio) / 0.5);

    const recentNet = window[window.length - 1].quote - window[split].quote;
    const reversal =
        trendStrength >= 0.2 &&
        net !== 0 &&
        recentNet !== 0 &&
        Math.sign(recentNet) !== Math.sign(net) &&
        Math.abs(recentNet) >= Math.abs(net) * 0.6;

    let id: RegimeId;
    if (reversal) {
        id = 'possible_reversal';
    } else if (expansion >= 0.45 && trendStrength < 0.35) {
        id = 'volatility_expansion';
    } else if (trendStrength >= 0.6) {
        id = net > 0 ? 'strong_uptrend' : 'strong_downtrend';
    } else if (trendStrength >= 0.25) {
        id = net > 0 ? 'weak_uptrend' : 'weak_downtrend';
    } else if (contraction >= 0.4) {
        id = 'low_volatility';
    } else if (expansion >= 0.25) {
        id = 'high_volatility';
    } else {
        id = 'sideways';
    }

    const direction = net > 0 ? 'up' : net < 0 ? 'down' : 'flat';

    return {
        id,
        label: REGIME_LABELS[id],
        direction,
        trendStrength,
        meanAbsMove,
        volatility,
        expansion,
    };
}

/** Regimes in which a trend-following entry is allowed at all. */
export const TREND_SUITABLE_REGIMES: RegimeId[] = [
    'strong_uptrend',
    'weak_uptrend',
    'strong_downtrend',
    'weak_downtrend',
    'low_volatility',
];
