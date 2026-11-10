/**
 * Breakout — strategy #2.
 *
 * A range that has held for a while is measured, then the newest quote has to
 * travel outside it by a meaningful distance (in units of the market's own mean
 * per-tick move) with the recent ticks still pushing that way. A breakout that
 * has already stalled scores nothing.
 */

import { classifyRegime } from '../regime';
import type { RegimeId, RegimeState, RiseFallSignal, SignalContribution, Tick } from '../types';
import {
    DEFAULT_STRATEGY_CONFIG,
    assembleSignal,
    clamp01,
    contribution,
    deltasOf,
    directionOf,
    emptySignal,
    formatPrice,
    meanAbs,
    quotesOf,
    recentTicks,
    structureDirection,
    type StrategyConfig,
} from './shared';

/** Regimes in which a range break has something to break out of. */
export const BREAKOUT_REGIMES: RegimeId[] = [
    'volatility_expansion',
    'high_volatility',
    'strong_uptrend',
    'strong_downtrend',
];

const WEIGHTS = {
    break: 30,
    expansion: 20,
    followThrough: 20,
    structure: 15,
    regime: 15,
} as const;

/** Ticks the measured range covers. */
export function breakoutRangeWindow(config: StrategyConfig): number {
    return Math.max(60, config.slowPeriod * 3);
}

export function evaluateBreakout(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime: RegimeState = classifyRegime(ticks)
): RiseFallSignal {
    const required = Math.max(config.minTicks, config.slowPeriod + config.confirmationTicks);
    if (ticks.length < required) {
        return emptySignal(
            'breakout',
            symbol,
            ticks,
            `No trade — waiting for ${required - ticks.length} more genuine ticks before a range can be measured.`
        );
    }

    const window = recentTicks(ticks, breakoutRangeWindow(config));
    const quotes = quotesOf(window);
    const meanAbsMove = meanAbs(deltasOf(quotesOf(ticks)));
    const last = quotes[quotes.length - 1];
    const blockSize = Math.max(3, Math.floor(config.slowPeriod / 3));

    // The range is every quote except the newest block, so the break is measured
    // against a level that existed BEFORE the current move.
    const rangeQuotes = quotes.slice(0, Math.max(1, quotes.length - blockSize));
    const rangeHigh = Math.max(...rangeQuotes);
    const rangeLow = Math.min(...rangeQuotes);

    const upDistance = last - rangeHigh;
    const downDistance = rangeLow - last;
    const breakDistance = Math.max(upDistance, downDistance);
    const breakDirection = upDistance > 0 ? 'rise' : downDistance > 0 ? 'fall' : 'none';
    // One mean tick move per break is noise; three is a clean push past the range.
    const breakShare = meanAbsMove > 0 ? clamp01(breakDistance / (meanAbsMove * 3)) : 0;

    const confirmationQuotes = quotes.slice(-Math.max(2, config.confirmationTicks));
    const followNet = confirmationQuotes[confirmationQuotes.length - 1] - confirmationQuotes[0];
    const followNormalised =
        meanAbsMove > 0 ? followNet / (meanAbsMove * Math.max(1, confirmationQuotes.length - 1)) : 0;
    const followDirection = directionOf(followNormalised, 0.15);

    const structure = structureDirection(quotes, blockSize);
    const regimeOk = BREAKOUT_REGIMES.includes(regime.id);

    const contributions: SignalContribution[] = [
        contribution(
            'break',
            'Range break',
            WEIGHTS.break,
            breakDirection,
            breakShare,
            breakDirection === 'none'
                ? `Price ${formatPrice(last, meanAbsMove)} is inside the ${formatPrice(
                      rangeLow,
                      meanAbsMove
                  )}–${formatPrice(rangeHigh, meanAbsMove)} range`
                : `Price ${formatPrice(last, meanAbsMove)} broke the ${formatPrice(
                      breakDirection === 'rise' ? rangeHigh : rangeLow,
                      meanAbsMove
                  )} ${breakDirection === 'rise' ? 'high' : 'low'} by ${formatPrice(breakDistance, meanAbsMove)}`
        ),
        contribution(
            'expansion',
            'Volatility expansion',
            WEIGHTS.expansion,
            regime.expansion >= 0.2 ? breakDirection : 'none',
            regime.expansion,
            `Recent third widened by ${(regime.expansion * 100).toFixed(0)}% against the earlier window`
        ),
        contribution(
            'follow',
            'Follow-through',
            WEIGHTS.followThrough,
            followDirection,
            Math.abs(followNormalised),
            followDirection === 'none'
                ? 'The last ticks went nowhere after the break'
                : `Last ${confirmationQuotes.length - 1} ticks pushed ${followDirection === 'rise' ? 'up' : 'down'} ${(
                      Math.abs(followNet) / (meanAbsMove || 1)
                  ).toFixed(1)} mean moves`
        ),
        contribution(
            'structure',
            'Breakout structure',
            WEIGHTS.structure,
            structure,
            1,
            structure === 'none' ? 'No clean higher-high / lower-low structure' : `${structure === 'rise' ? 'Higher' : 'Lower'} highs and lows`
        ),
        contribution(
            'regime',
            'Regime',
            WEIGHTS.regime,
            regimeOk ? breakDirection : 'none',
            1,
            regimeOk ? `${regime.label} supports a breakout` : `${regime.label} is not a breakout regime`
        ),
    ];

    return assembleSignal({
        strategyId: 'breakout',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (!regimeOk) return { suitable: false, reason: `the regime (${regime.label}) is not one this strategy trades` };
            if (followDirection !== direction) {
                return { suitable: false, reason: 'the last ticks do not follow the break through' };
            }
            if (config.requireStructure && structure !== direction) {
                return { suitable: false, reason: 'market structure does not confirm the breakout' };
            }
            return { suitable: true, reason: null };
        },
    });
}
