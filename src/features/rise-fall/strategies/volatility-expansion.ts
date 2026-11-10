/**
 * Volatility Expansion — strategy #6.
 *
 * Reads the same widening the regime classifier measures and asks a second
 * question the classifier does not answer: when the range opens up, which way is
 * the market actually going? A widening range with no directional bias is NO
 * TRADE, because a Rise/Fall contract needs a side.
 */

import { classifyRegime } from '../regime';
import type { RegimeId, RiseFallSignal, SignalContribution, SignalDirection, Tick } from '../types';
import {
    DEFAULT_STRATEGY_CONFIG,
    assembleSignal,
    clamp01,
    contribution,
    deltasOf,
    directionOf,
    emptySignal,
    meanAbs,
    quotesOf,
    standardDeviation,
    type StrategyConfig,
} from './shared';

export const EXPANSION_REGIMES: RegimeId[] = ['volatility_expansion', 'high_volatility'];

const WEIGHTS = {
    expansion: 35,
    bias: 30,
    deviation: 20,
    regime: 15,
} as const;

export function evaluateVolatilityExpansion(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime = classifyRegime(ticks)
): RiseFallSignal {
    const required = Math.max(config.minTicks, config.slowPeriod);
    if (ticks.length < required) {
        return emptySignal(
            'volatility_expansion',
            symbol,
            ticks,
            `No trade — waiting for ${required - ticks.length} more genuine ticks before expansion can be measured.`
        );
    }

    // A widening has to be measured against a window that still contains the quiet
    // stretch it widened from — one short window would already be inside the burst.
    const lookback = Math.max(40, config.slowPeriod * 2);
    const deltas = deltasOf(quotesOf(ticks)).slice(-lookback);
    const split = Math.floor(deltas.length * 0.66);
    const earlier = deltas.slice(0, split);
    const recent = deltas.slice(split);
    const earlierMove = meanAbs(earlier);
    const recentMove = meanAbs(recent);
    const ratio = earlierMove > 0 ? recentMove / earlierMove : recentMove > 0 ? 2 : 1;
    const expansion = clamp01((ratio - 1) / 1.5);

    // Directional bias: the net move of the widened section, in mean moves.
    const recentTicksWindow = Math.max(3, recent.length + 1);
    const recentQuotes = quotesOf(ticks).slice(-recentTicksWindow);
    const net = recentQuotes[recentQuotes.length - 1] - recentQuotes[0];
    const normaliser = (recentMove || 1) * Math.max(1, recentQuotes.length - 1);
    const bias = net / normaliser;
    const biasDirection = directionOf(bias, 0.25);

    const deviation = standardDeviation(deltas);
    const deviationShare = clamp01(deviation / (earlierMove * 2 || 1));
    const regimeOk = EXPANSION_REGIMES.includes(regime.id);

    const contributions: SignalContribution[] = [
        contribution(
            'expansion',
            'Range expansion',
            WEIGHTS.expansion,
            biasDirection,
            expansion,
            `The recent third travels ${ratio.toFixed(2)}× the earlier ticks per move`
        ),
        contribution(
            'bias',
            'Directional bias',
            WEIGHTS.bias,
            biasDirection,
            Math.abs(bias),
            biasDirection === 'none'
                ? 'The widening range has no clear side'
                : `The widened section is net ${biasDirection === 'rise' ? 'up' : 'down'} ${Math.abs(bias).toFixed(2)} mean moves`
        ),
        contribution(
            'deviation',
            'Deviation',
            WEIGHTS.deviation,
            biasDirection,
            deviationShare,
            `Per-tick deviation is ${deviation.toFixed(Math.abs(deviation) >= 0.1 ? 2 : 4)} quote units`
        ),
        contribution(
            'regime',
            'Regime',
            WEIGHTS.regime,
            regimeOk ? biasDirection : 'none',
            1,
            regimeOk ? `${regime.label} is an expansion regime` : `${regime.label} is not an expansion regime`
        ),
    ];

    return assembleSignal({
        strategyId: 'volatility_expansion',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (expansion < 0.3) return { suitable: false, reason: 'the range has not widened enough' };
            if (biasDirection === 'none') return { suitable: false, reason: 'the widening range has no side to trade' };
            if (biasDirection !== direction) return { suitable: false, reason: 'the widened section points the other way' };
            // The strategy's own widening measure is the gate; the classifier's label
            // only adds to or subtracts from the score, so a widening market inside a
            // strong trend is still tradeable here.
            return { suitable: true, reason: null };
        },
    });
}
