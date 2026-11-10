/**
 * Momentum — strategy #4.
 *
 * The brief's momentum rule: the recent move has to be EFFICIENT (the net move
 * is most of the distance travelled) and ACCELERATING (the second half of the
 * window travels further than the first). A quiet drift and a choppy spike both
 * score low, and neither is a momentum entry.
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
    emptySignal,
    meanAbs,
    quotesOf,
    type StrategyConfig,
} from './shared';

const WEIGHTS = {
    efficiency: 35,
    acceleration: 25,
    consistency: 20,
    regime: 20,
} as const;

export function evaluateMomentum(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime = classifyRegime(ticks)
): RiseFallSignal {
    const required = Math.max(config.minTicks, config.confirmationTicks * 3);
    if (ticks.length < required) {
        return emptySignal(
            'momentum',
            symbol,
            ticks,
            `No trade — waiting for ${required - ticks.length} more genuine ticks before momentum can be read.`
        );
    }

    const quotes = quotesOf(ticks);
    const window = Math.max(4, config.confirmationTicks);
    const recent = quotes.slice(-(window + 1));
    const deltas = deltasOf(recent);
    const travelled = deltas.reduce((sum, delta) => sum + Math.abs(delta), 0);
    const net = recent[recent.length - 1] - recent[0];
    const efficiency = travelled > 0 ? clamp01(Math.abs(net) / travelled) : 0;
    const direction = directionOf(net, 0);

    // Acceleration: distance travelled in the newer half against the older half.
    const half = Math.floor(deltas.length / 2);
    const olderMove = meanAbs(deltas.slice(0, half));
    const newerMove = meanAbs(deltas.slice(half));
    const accelerationRatio = olderMove > 0 ? newerMove / olderMove : newerMove > 0 ? 2 : 1;
    const acceleration = clamp01((accelerationRatio - 1) / 1.5);
    const newerNet = recent[recent.length - 1] - recent[recent.length - 1 - half];
    const accelerationDirection: SignalDirection =
        acceleration < 0.1 ? 'none' : directionOf(newerNet, 0);

    const upTicks = deltas.filter(delta => delta > 0).length;
    const downTicks = deltas.filter(delta => delta < 0).length;
    const dominant = Math.max(upTicks, downTicks);
    const consistencyShare = deltas.length ? dominant / deltas.length : 0;
    const consistencyDirection: SignalDirection = upTicks === downTicks ? 'none' : upTicks > downTicks ? 'rise' : 'fall';

    const regimeDirection: SignalDirection =
        regime.direction === 'up' ? 'rise' : regime.direction === 'down' ? 'fall' : 'none';

    const contributions: SignalContribution[] = [
        contribution(
            'efficiency',
            'Move efficiency',
            WEIGHTS.efficiency,
            direction,
            efficiency,
            direction === 'none'
                ? 'No net move across the window'
                : `${(efficiency * 100).toFixed(0)}% of the distance travelled was net ${
                      direction === 'rise' ? 'up' : 'down'
                  } (${Math.abs(net).toFixed(Math.abs(net) >= 0.1 ? 2 : 4)})`
        ),
        contribution(
            'acceleration',
            'Acceleration',
            WEIGHTS.acceleration,
            accelerationDirection,
            acceleration,
            accelerationDirection === 'none'
                ? `The newer half travelled ${accelerationRatio.toFixed(2)}× the older half — no acceleration`
                : `The newer half travelled ${accelerationRatio.toFixed(2)}× the older half`
        ),
        contribution(
            'consistency',
            'Tick consistency',
            WEIGHTS.consistency,
            consistencyDirection,
            (consistencyShare - 0.5) / 0.5,
            `${dominant} of ${deltas.length} ticks moved ${consistencyDirection === 'fall' ? 'down' : 'up'}`
        ),
        contribution(
            'regime',
            'Regime agreement',
            WEIGHTS.regime,
            regimeDirection,
            1,
            regimeDirection === 'none' ? `${regime.label} has no direction` : `${regime.label} agrees with the move`
        ),
    ];

    return assembleSignal({
        strategyId: 'momentum',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction: entry }) => {
            if (entry === 'none') return { suitable: false, reason: null };
            if (efficiency < 0.35) {
                return { suitable: false, reason: 'the move is not efficient enough to call momentum' };
            }
            if (regime.id === 'possible_reversal') {
                return { suitable: false, reason: 'the regime is a possible reversal' };
            }
            if (regimeDirection !== 'none' && regimeDirection !== entry) {
                return { suitable: false, reason: 'the regime points the other way' };
            }
            if (consistencyDirection !== 'none' && consistencyDirection !== entry) {
                return { suitable: false, reason: 'the newer ticks moved against the window' };
            }
            return { suitable: true, reason: null };
        },
    });
}
