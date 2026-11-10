/**
 * Reversal — strategy #5.
 *
 * Only a move that has actually EXHAUSTED is traded against: a clear prior
 * move, a recent swing back of a meaningful share of it, a tick-direction flip,
 * and either the regime's own reversal marker or a price stretched far from its
 * slow average. Nothing here predicts a turn before it has begun.
 */

import { classifyRegime } from '../regime';
import type { RiseFallSignal, SignalContribution, SignalDirection, Tick } from '../types';
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
    meanAbs,
    quotesOf,
    structureDirection,
    type StrategyConfig,
} from './shared';

const WEIGHTS = {
    prior: 20,
    reversal: 30,
    flip: 25,
    stretch: 15,
    regime: 10,
} as const;

/** How much of the prior move has to be given back before it counts as a turn. */
export const MIN_REVERSAL_SHARE = 0.35;

export function evaluateReversal(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime = classifyRegime(ticks)
): RiseFallSignal {
    const required = Math.max(config.minTicks, config.slowPeriod * 2);
    if (ticks.length < required) {
        return emptySignal(
            'reversal',
            symbol,
            ticks,
            `No trade — waiting for ${required - ticks.length} more genuine ticks before a reversal can be judged.`
        );
    }

    const quotes = quotesOf(ticks);
    const deltas = deltasOf(quotes);
    const meanAbsMove = meanAbs(deltas);
    const confirmation = Math.max(3, config.confirmationTicks);
    const priorQuotes = quotes.slice(0, quotes.length - confirmation);
    const priorNet = priorQuotes[priorQuotes.length - 1] - priorQuotes[0];
    const recentNet = quotes[quotes.length - 1] - priorQuotes[priorQuotes.length - 1];
    const priorDirection = directionOf(priorNet, 0);
    const reversalDirection = directionOf(recentNet, 0);
    const opposes = priorDirection !== 'none' && reversalDirection !== 'none' && priorDirection !== reversalDirection;
    const reversalShare = opposes && Math.abs(priorNet) > 0 ? clamp01(Math.abs(recentNet) / Math.abs(priorNet)) : 0;

    const slow = ema(quotes, config.slowPeriod);
    const stretch = slow !== null && meanAbsMove > 0 ? Math.abs(quotes[quotes.length - 1] - slow) / (meanAbsMove * 6) : 0;

    const recentDeltas = deltas.slice(-confirmation);
    const flippedTicks = priorDirection === 'rise'
        ? recentDeltas.filter(delta => delta < 0).length
        : priorDirection === 'fall'
          ? recentDeltas.filter(delta => delta > 0).length
          : 0;
    const flipShare = recentDeltas.length ? flippedTicks / recentDeltas.length : 0;
    const flipDirection: SignalDirection = flipShare > 0.5 ? reversalDirection : 'none';

    const structure = structureDirection(quotes, Math.max(3, Math.floor(config.slowPeriod / 3)));
    const regimeSupports = regime.id === 'possible_reversal';
    const stretched = stretch >= 0.6;

    const contributions: SignalContribution[] = [
        contribution(
            'prior',
            'Prior move',
            WEIGHTS.prior,
            priorDirection,
            1,
            priorDirection === 'none'
                ? `No prior move to reverse (net ${priorNet.toFixed(Math.abs(priorNet) >= 0.1 ? 2 : 4)})`
                : `Prior move was ${priorDirection === 'rise' ? 'up' : 'down'} ${Math.abs(priorNet).toFixed(
                      Math.abs(priorNet) >= 0.1 ? 2 : 4
                  )} before the last ${confirmation} ticks`
        ),
        contribution(
            'reversal',
            'Reversal size',
            WEIGHTS.reversal,
            opposes ? reversalDirection : 'none',
            reversalShare / MIN_REVERSAL_SHARE,
            opposes
                ? `The last ${confirmation} ticks gave back ${(reversalShare * 100).toFixed(0)}% of that move`
                : 'No swing against the prior move yet'
        ),
        contribution(
            'flip',
            'Tick flip',
            WEIGHTS.flip,
            flipDirection,
            flipShare,
            `${flippedTicks} of ${recentDeltas.length} recent ticks moved against the prior move`
        ),
        contribution(
            'stretch',
            'Stretch from average',
            WEIGHTS.stretch,
            priorDirection === 'none' ? 'none' : priorDirection === 'rise' ? 'fall' : 'rise',
            stretch / 0.6,
            slow === null
                ? 'The slow average is not ready'
                : `Price is ${formatPrice(Math.abs(quotes[quotes.length - 1] - slow), meanAbsMove)} from the slow average`
        ),
        contribution(
            'regime',
            'Regime marker',
            WEIGHTS.regime,
            regimeSupports ? reversalDirection : 'none',
            1,
            regimeSupports ? 'The classifier marks the market as a possible reversal' : `${regime.label} carries no reversal marker`
        ),
    ];

    return assembleSignal({
        strategyId: 'reversal',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (!opposes) return { suitable: false, reason: 'the move has not actually turned yet' };
            if (reversalShare < MIN_REVERSAL_SHARE) {
                return {
                    suitable: false,
                    reason: `the swing back is only ${(reversalShare * 100).toFixed(0)}% of the prior move`,
                };
            }
            if (!regimeSupports && !stretched) {
                return { suitable: false, reason: 'neither the regime nor the stretch marks an exhaustion' };
            }
            if (config.requireStructure && structure !== 'none' && structure !== direction) {
                return { suitable: false, reason: 'market structure still points the old way' };
            }
            return { suitable: true, reason: null };
        },
    });
}
