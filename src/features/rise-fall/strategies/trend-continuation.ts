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
import {
    DEFAULT_STRATEGY_CONFIG,
    assembleSignal,
    clamp01,
    contribution,
    deltasOf,
    directionOf,
    ema,
    emptySignal,
    formatPrice,
    quotesOf,
    structureDirection,
    type StrategyConfig,
} from './shared';

export type TrendContinuationConfig = StrategyConfig;

export const DEFAULT_TREND_CONTINUATION: StrategyConfig = DEFAULT_STRATEGY_CONFIG;

const WEIGHTS = {
    ema: 30,
    structure: 20,
    strength: 20,
    momentum: 15,
    consistency: 15,
} as const;

export function evaluateTrendContinuation(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime: RegimeState = classifyRegime(ticks)
): RiseFallSignal {
    const requiredTicks = Math.max(config.minTicks, config.slowPeriod + config.confirmationTicks);
    if (ticks.length < requiredTicks) {
        return emptySignal(
            'trend_continuation',
            symbol,
            ticks,
            `No trade — waiting for ${requiredTicks - ticks.length} more genuine ticks before the trend can be read.`
        );
    }

    const quotes = quotesOf(ticks);
    const deltas = deltasOf(quotes);
    const meanAbsMove = deltas.length
        ? deltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / deltas.length
        : 0;

    const fast = ema(quotes, config.fastPeriod);
    const medium = ema(quotes, config.mediumPeriod);
    const slow = ema(quotes, config.slowPeriod);
    if (fast === null || medium === null || slow === null) {
        return emptySignal('trend_continuation', symbol, ticks, 'No trade — the moving averages are not ready yet.');
    }

    // 1. EMA alignment. A mixed stack is not a trend, so it scores nothing.
    let emaDirection: SignalDirection = 'none';
    if (fast > medium && medium > slow) emaDirection = 'rise';
    else if (fast < medium && medium < slow) emaDirection = 'fall';
    const separation = meanAbsMove > 0 ? Math.abs(fast - slow) / (meanAbsMove * 3) : 0;
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
    const structureDetail =
        structure === 'none'
            ? 'No clean higher-high/higher-low (or lower-high/lower-low) structure'
            : structure === 'rise'
              ? 'Higher highs and higher lows over the last two windows'
              : 'Lower highs and lower lows over the last two windows';

    // 3. Trend strength from the regime classifier (efficiency ratio).
    const strengthDirection: SignalDirection =
        regime.direction === 'up' ? 'rise' : regime.direction === 'down' ? 'fall' : 'none';
    const strengthDetail = `${regime.label} · efficiency ${(regime.trendStrength * 100).toFixed(0)}%`;

    // 4. Momentum: the fast EMA's own movement over the confirmation window.
    const pastFast = ema(quotes.slice(0, quotes.length - config.confirmationTicks), config.fastPeriod);
    const momentumMove = pastFast === null ? 0 : fast - pastFast;
    const momentumNormalised = meanAbsMove > 0 ? momentumMove / (meanAbsMove * config.confirmationTicks) : 0;
    const momentumDirection = directionOf(momentumNormalised, 0.1);
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
    const consistencyDetail = `${Math.max(upTicks, downTicks)} of ${recentDeltas.length} recent ticks ${
        consistencyDirection === 'fall' ? 'down' : 'up'
    }`;

    const contributions: SignalContribution[] = [
        contribution('ema', 'EMA alignment', WEIGHTS.ema, emaDirection, 0.5 + separation, emaDetail),
        contribution('structure', 'Market structure', WEIGHTS.structure, structure, 1, structureDetail),
        contribution(
            'strength',
            'Trend strength',
            WEIGHTS.strength,
            strengthDirection,
            regime.trendStrength,
            strengthDetail
        ),
        contribution(
            'momentum',
            'Momentum',
            WEIGHTS.momentum,
            momentumDirection,
            Math.abs(momentumNormalised),
            momentumDetail
        ),
        contribution(
            'consistency',
            'Tick consistency',
            WEIGHTS.consistency,
            consistencyDirection,
            (consistencyShare - 0.5) / 0.5,
            consistencyDetail
        ),
    ];

    return assembleSignal({
        strategyId: 'trend_continuation',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction, best }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (!TREND_SUITABLE_REGIMES.includes(regime.id)) {
                return { suitable: false, reason: `the regime (${regime.label}) is not one this strategy trades` };
            }
            if (best === 'rise' && regime.direction === 'down') {
                return { suitable: false, reason: 'the regime points the other way' };
            }
            if (best === 'fall' && regime.direction === 'up') {
                return { suitable: false, reason: 'the regime points the other way' };
            }
            if (config.requireStructure && structure !== direction) {
                return { suitable: false, reason: 'market structure does not confirm the trend' };
            }
            return { suitable: true, reason: null };
        },
    });
}

export { ema, clamp01 };
