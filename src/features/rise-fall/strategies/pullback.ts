/**
 * Pullback — strategy #3.
 *
 * Trades WITH an established trend, but only after the market has pulled back
 * toward the trend's own average and turned again. Buying a trend at its extreme
 * is what this strategy exists to avoid, so a market that never pulled back
 * scores nothing.
 */

import { classifyRegime, TREND_SUITABLE_REGIMES } from '../regime';
import type { RiseFallSignal, SignalContribution, SignalDirection, Tick } from '../types';
import {
    DEFAULT_STRATEGY_CONFIG,
    assembleSignal,
    clamp01,
    contribution,
    deltasOf,
    ema,
    emptySignal,
    formatPrice,
    meanAbs,
    quotesOf,
    structureDirection,
    type StrategyConfig,
} from './shared';

const WEIGHTS = {
    trend: 30,
    depth: 25,
    recovery: 25,
    momentum: 20,
} as const;

/** The pullback band, in mean per-tick moves away from the trend average. */
const IDEAL_DEPTH = 1;
const DEPTH_TOLERANCE = 2;

export function evaluatePullback(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime = classifyRegime(ticks)
): RiseFallSignal {
    const required = Math.max(config.minTicks, config.slowPeriod + config.confirmationTicks);
    if (ticks.length < required) {
        return emptySignal(
            'pullback',
            symbol,
            ticks,
            `No trade — waiting for ${required - ticks.length} more genuine ticks before a pullback can be read.`
        );
    }

    const quotes = quotesOf(ticks);
    const deltas = deltasOf(quotes);
    const meanAbsMove = meanAbs(deltas);
    const fast = ema(quotes, config.fastPeriod);
    const medium = ema(quotes, config.mediumPeriod);
    const slow = ema(quotes, config.slowPeriod);
    if (fast === null || medium === null || slow === null) {
        return emptySignal('pullback', symbol, ticks, 'No trade — the moving averages are not ready yet.');
    }

    let trend: SignalDirection = 'none';
    if (fast > medium && medium > slow) trend = 'rise';
    else if (fast < medium && medium < slow) trend = 'fall';

    const confirmation = quotes.slice(-Math.max(2, config.confirmationTicks));
    const recentLow = Math.min(...confirmation);
    const recentHigh = Math.max(...confirmation);
    const last = quotes[quotes.length - 1];
    const previous = quotes[quotes.length - 2] ?? last;

    // Distance of the pullback extreme from the medium average, in mean moves.
    const depthInMoves = meanAbsMove > 0 ? Math.abs((trend === 'fall' ? recentHigh : recentLow) - medium) / meanAbsMove : 0;
    const depthShare = clamp01(1 - Math.abs(depthInMoves - IDEAL_DEPTH) / DEPTH_TOLERANCE);

    const turnedBack = trend === 'rise' ? last > previous && last > recentLow : trend === 'fall' ? last < previous && last < recentHigh : false;
    const recoveryShare = turnedBack ? 1 : 0;

    const momentumMove = meanAbsMove > 0 ? (last - confirmation[0]) / (meanAbsMove * confirmation.length) : 0;
    const momentumDirection: SignalDirection =
        trend === 'rise' ? (momentumMove > 0 ? 'rise' : 'none') : trend === 'fall' ? (momentumMove < 0 ? 'fall' : 'none') : 'none';

    const structure = structureDirection(quotes, Math.max(3, Math.floor(config.slowPeriod / 3)));
    const regimeOk = TREND_SUITABLE_REGIMES.includes(regime.id);

    const contributions: SignalContribution[] = [
        contribution(
            'trend',
            'Trend',
            WEIGHTS.trend,
            trend,
            1,
            trend === 'none'
                ? `Mixed EMA stack (fast ${formatPrice(fast, meanAbsMove)}, slow ${formatPrice(slow, meanAbsMove)})`
                : `${trend === 'rise' ? 'Up' : 'Down'}trend: fast EMA ${formatPrice(fast, meanAbsMove)} ${
                      trend === 'rise' ? 'above' : 'below'
                  } slow ${formatPrice(slow, meanAbsMove)}`
        ),
        contribution(
            'depth',
            'Pullback depth',
            WEIGHTS.depth,
            trend,
            depthShare,
            trend === 'none'
                ? 'No trend to pull back from'
                : `Pullback extreme sits ${depthInMoves.toFixed(1)} mean moves from the medium average`
        ),
        contribution(
            'recovery',
            'Recovery tick',
            WEIGHTS.recovery,
            trend,
            recoveryShare,
            turnedBack
                ? `The newest tick turned back ${trend === 'rise' ? 'up' : 'down'} out of the pullback`
                : 'No recovery tick yet — the pullback is still running'
        ),
        contribution(
            'momentum',
            'Momentum turn',
            WEIGHTS.momentum,
            momentumDirection,
            Math.abs(momentumMove),
            momentumDirection === 'none'
                ? 'Momentum has not turned back with the trend'
                : `Momentum is ${momentumDirection === 'rise' ? 'positive' : 'negative'} across the confirmation ticks`
        ),
    ];

    return assembleSignal({
        strategyId: 'pullback',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (!regimeOk) return { suitable: false, reason: `the regime (${regime.label}) is not one this strategy trades` };
            if (regime.direction === 'up' && direction === 'fall') {
                return { suitable: false, reason: 'the regime points the other way' };
            }
            if (regime.direction === 'down' && direction === 'rise') {
                return { suitable: false, reason: 'the regime points the other way' };
            }
            if (!turnedBack) return { suitable: false, reason: 'no recovery tick has confirmed the pullback ended' };
            if (config.requireStructure && structure !== direction) {
                return { suitable: false, reason: 'market structure does not confirm the trend' };
            }
            return { suitable: true, reason: null };
        },
    });
}
