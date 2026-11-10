/**
 * Trend Continuation — strategy #1 of the eight in the Rise/Fall brief.
 *
 * Pure function over genuine ticks. It emits the structured signal object the
 * brief requires (`direction`, `score`, `confidence`, `contributions`,
 * `explanation`, `regime`, `suitable`) and never places an order itself — the
 * central execution service is the only path to an entry.
 *
 * Confirmation is deliberately more than a bare moving-average crossover: the
 * entry also needs market structure, momentum and tick-direction consistency,
 * and a regime the strategy declares suitable. A score is a filter strength,
 * NOT a probability of winning.
 */

import { classifyRegime, TREND_SUITABLE_REGIMES } from '../regime';
import type { RegimeState, RiseFallSignal, SignalContribution, SignalDirection, Tick } from '../types';

export interface TrendContinuationConfig {
    fastPeriod: number;
    mediumPeriod: number;
    slowPeriod: number;
    /** 0..100 entry threshold the winning side must reach. */
    minScore: number;
    /** Ticks used for the momentum and consistency reads. */
    confirmationTicks: number;
    /** Ticks required before any signal is offered. */
    minTicks: number;
    /** Refuse the entry when higher highs / lower lows do not confirm the trend. */
    requireStructure: boolean;
}

export const DEFAULT_TREND_CONTINUATION: TrendContinuationConfig = {
    fastPeriod: 5,
    mediumPeriod: 13,
    slowPeriod: 34,
    minScore: 60,
    confirmationTicks: 10,
    minTicks: 60,
    requireStructure: true,
};

const WEIGHTS = {
    ema: 30,
    structure: 20,
    strength: 20,
    momentum: 15,
    consistency: 15,
} as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Exponential moving average, or null while there are not enough values. */
export function ema(values: number[], period: number): number | null {
    if (!Number.isFinite(period) || period < 1 || values.length < period) return null;

    const k = 2 / (period + 1);
    let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
    for (let index = period; index < values.length; index += 1) {
        value = values[index] * k + value * (1 - k);
    }
    return value;
}

/** A display helper for the explanation text only — never used in a judgement. */
function formatPrice(value: number, meanAbsMove: number): string {
    const decimals = meanAbsMove >= 0.1 ? 2 : meanAbsMove >= 0.01 ? 3 : meanAbsMove >= 0.001 ? 4 : 5;
    return value.toFixed(decimals);
}

/** Higher highs + higher lows → rise; lower highs + lower lows → fall. */
function structureDirection(quotes: number[], blockSize: number): SignalDirection {
    if (blockSize < 2 || quotes.length < blockSize * 2) return 'none';

    const recent = quotes.slice(-blockSize);
    const previous = quotes.slice(-blockSize * 2, -blockSize);
    const higherHigh = Math.max(...recent) > Math.max(...previous);
    const higherLow = Math.min(...recent) > Math.min(...previous);
    const lowerHigh = Math.max(...recent) < Math.max(...previous);
    const lowerLow = Math.min(...recent) < Math.min(...previous);

    if (higherHigh && higherLow) return 'rise';
    if (lowerHigh && lowerLow) return 'fall';
    return 'none';
}

function emptySignal(symbol: string, ticks: Tick[], message: string): RiseFallSignal {
    return {
        strategyId: 'trend_continuation',
        symbol,
        direction: 'none',
        riseScore: 0,
        fallScore: 0,
        confidence: 0,
        contributions: [],
        explanation: message,
        regime: 'uncertain',
        suitable: false,
        ticksAnalysed: ticks.length,
        evaluatedAt: (ticks[ticks.length - 1]?.epoch ?? 0) * 1000,
        fingerprint: `${symbol}:none:${ticks[ticks.length - 1]?.epoch ?? 0}`,
    };
}

export function evaluateTrendContinuation(
    ticks: Tick[],
    symbol: string,
    config: TrendContinuationConfig = DEFAULT_TREND_CONTINUATION,
    regime: RegimeState = classifyRegime(ticks)
): RiseFallSignal {
    const requiredTicks = Math.max(config.minTicks, config.slowPeriod + config.confirmationTicks);
    if (ticks.length < requiredTicks) {
        return emptySignal(
            symbol,
            ticks,
            `No trade — waiting for ${requiredTicks - ticks.length} more genuine ticks before the trend can be read.`
        );
    }

    const quotes = ticks.map(tick => tick.quote);
    const deltas: number[] = [];
    for (let index = 1; index < quotes.length; index += 1) {
        deltas.push(quotes[index] - quotes[index - 1]);
    }
    const meanAbsMove = deltas.length
        ? deltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / deltas.length
        : 0;

    const fast = ema(quotes, config.fastPeriod);
    const medium = ema(quotes, config.mediumPeriod);
    const slow = ema(quotes, config.slowPeriod);
    if (fast === null || medium === null || slow === null) {
        return emptySignal(symbol, ticks, 'No trade — the moving averages are not ready yet.');
    }

    // 1. EMA alignment. A mixed stack is not a trend, so it scores nothing.
    let emaDirection: SignalDirection = 'none';
    if (fast > medium && medium > slow) emaDirection = 'rise';
    else if (fast < medium && medium < slow) emaDirection = 'fall';
    const separation = meanAbsMove > 0 ? Math.abs(fast - slow) / (meanAbsMove * 3) : 0;
    const emaScore = emaDirection === 'none' ? 0 : WEIGHTS.ema * clamp01(0.5 + separation);
    const emaDetail =
        emaDirection === 'none'
            ? `Mixed EMA stack (fast ${formatPrice(fast, meanAbsMove)}, medium ${formatPrice(
                  medium,
                  meanAbsMove
              )}, slow ${formatPrice(slow, meanAbsMove)})`
            : `Fast EMA ${formatPrice(fast, meanAbsMove)} ${emaDirection === 'rise' ? 'above' : 'below'} medium ${formatPrice(
                  medium,
                  meanAbsMove
              )} ${emaDirection === 'rise' ? 'above' : 'below'} slow ${formatPrice(slow, meanAbsMove)}`;

    // 2. Market structure: higher highs and higher lows (or the mirror image).
    const blockSize = Math.max(3, Math.floor(config.slowPeriod / 3));
    const structure = structureDirection(quotes, blockSize);
    const structureScore = structure === 'none' ? 0 : WEIGHTS.structure;
    const structureDetail =
        structure === 'none'
            ? 'No clean higher-high/higher-low (or lower-high/lower-low) structure'
            : structure === 'rise'
              ? 'Higher highs and higher lows over the last two windows'
              : 'Lower highs and lower lows over the last two windows';

    // 3. Trend strength from the regime classifier (efficiency ratio).
    const strengthDirection: SignalDirection =
        regime.direction === 'up' ? 'rise' : regime.direction === 'down' ? 'fall' : 'none';
    const strengthScore = strengthDirection === 'none' ? 0 : WEIGHTS.strength * regime.trendStrength;
    const strengthDetail = `${regime.label} · efficiency ${(regime.trendStrength * 100).toFixed(0)}%`;

    // 4. Momentum: the fast EMA's own movement over the confirmation window.
    const pastFast = ema(quotes.slice(0, quotes.length - config.confirmationTicks), config.fastPeriod);
    const momentumMove = pastFast === null ? 0 : fast - pastFast;
    const momentumNormalised = meanAbsMove > 0 ? momentumMove / (meanAbsMove * config.confirmationTicks) : 0;
    const momentumDirection: SignalDirection =
        Math.abs(momentumNormalised) < 0.1 ? 'none' : momentumNormalised > 0 ? 'rise' : 'fall';
    const momentumScore = momentumDirection === 'none' ? 0 : WEIGHTS.momentum * clamp01(Math.abs(momentumNormalised));
    const momentumDetail =
        momentumDirection === 'none'
            ? 'Flat momentum over the confirmation window'
            : `Fast EMA moved ${formatPrice(Math.abs(momentumMove), meanAbsMove)} ${
                  momentumDirection === 'rise' ? 'up' : 'down'
              } in the last ${config.confirmationTicks} ticks`;

    // 5. Tick-direction consistency.
    const recentDeltas = deltas.slice(-config.confirmationTicks);
    const upTicks = recentDeltas.filter(delta => delta > 0).length;
    const downTicks = recentDeltas.filter(delta => delta < 0).length;
    const dominant = upTicks >= downTicks ? upTicks : downTicks;
    const consistencyShare = recentDeltas.length ? dominant / recentDeltas.length : 0;
    const consistencyDirection: SignalDirection =
        upTicks === downTicks ? 'none' : upTicks > downTicks ? 'rise' : 'fall';
    const consistencyScore =
        consistencyDirection === 'none' ? 0 : WEIGHTS.consistency * clamp01((consistencyShare - 0.5) / 0.5);
    const consistencyDetail = `${Math.max(upTicks, downTicks)} of ${recentDeltas.length} recent ticks ${
        consistencyDirection === 'fall' ? 'down' : 'up'
    }`;

    const contributions: SignalContribution[] = [
        { id: 'ema', label: 'EMA alignment', weight: WEIGHTS.ema, score: emaScore, direction: emaDirection, detail: emaDetail },
        {
            id: 'structure',
            label: 'Market structure',
            weight: WEIGHTS.structure,
            score: structureScore,
            direction: structure,
            detail: structureDetail,
        },
        {
            id: 'strength',
            label: 'Trend strength',
            weight: WEIGHTS.strength,
            score: strengthScore,
            direction: strengthDirection,
            detail: strengthDetail,
        },
        {
            id: 'momentum',
            label: 'Momentum',
            weight: WEIGHTS.momentum,
            score: momentumScore,
            direction: momentumDirection,
            detail: momentumDetail,
        },
        {
            id: 'consistency',
            label: 'Tick consistency',
            weight: WEIGHTS.consistency,
            score: consistencyScore,
            direction: consistencyDirection,
            detail: consistencyDetail,
        },
    ];

    const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)));
    const riseScore = round(
        contributions.filter(item => item.direction === 'rise').reduce((sum, item) => sum + item.score, 0)
    );
    const fallScore = round(
        contributions.filter(item => item.direction === 'fall').reduce((sum, item) => sum + item.score, 0)
    );

    const best = riseScore >= fallScore ? 'rise' : 'fall';
    const bestScore = Math.max(riseScore, fallScore);
    const direction: SignalDirection = bestScore >= config.minScore ? best : 'none';

    // Suitability: a declared regime that agrees with the direction, plus the
    // structural confirmation the brief insists on (never a bare crossover).
    let suitable = direction !== 'none' && TREND_SUITABLE_REGIMES.includes(regime.id);
    if (direction === 'rise' && regime.direction === 'down') suitable = false;
    if (direction === 'fall' && regime.direction === 'up') suitable = false;
    if (direction !== 'none' && config.requireStructure && structure !== direction) suitable = false;

    const lastEpoch = ticks[ticks.length - 1].epoch;
    const summary = contributions
        .filter(item => item.direction !== 'none')
        .map(item => `${item.label.toLowerCase()} ${item.score.toFixed(0)}/${item.weight}`)
        .join(', ');

    let explanation: string;
    if (direction === 'none') {
        explanation = `No trade — best side scored ${bestScore}/100 against a ${config.minScore} threshold. ${
            summary || 'No component confirms a direction'
        }. Regime: ${regime.label}.`;
    } else if (!suitable) {
        explanation = `No trade — ${best === 'rise' ? 'Rise' : 'Fall'} scored ${bestScore}/100 but ${
            !TREND_SUITABLE_REGIMES.includes(regime.id)
                ? `the regime (${regime.label}) is not one this strategy trades`
                : config.requireStructure && structure !== direction
                  ? 'market structure does not confirm the trend'
                  : 'the regime points the other way'
        }.`;
    } else {
        explanation = `${best === 'rise' ? 'Rise' : 'Fall'} ${bestScore}/100 — ${summary}. Regime: ${
            regime.label
        }. The score is a filter strength, not a probability of winning.`;
    }

    return {
        strategyId: 'trend_continuation',
        symbol,
        direction,
        riseScore,
        fallScore,
        confidence: bestScore / 100,
        contributions,
        explanation,
        regime: regime.id,
        suitable,
        ticksAnalysed: ticks.length,
        evaluatedAt: lastEpoch * 1000,
        fingerprint: `${symbol}:${best}:${lastEpoch}`,
    };
}
