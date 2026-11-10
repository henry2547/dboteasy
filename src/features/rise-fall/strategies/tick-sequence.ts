/**
 * Tick Sequence — strategy #7.
 *
 * Pure tick-direction structure: a run of consecutive same-direction ticks is a
 * sequence, and a sequence of three or more is traded only while the net move
 * across the confirmation window still points the same way. An alternating tape
 * is explicitly NO TRADE — it is what a coin-flip looks like.
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
    run: 40,
    purity: 20,
    netMove: 25,
    regime: 15,
} as const;

/** The shortest run this strategy will trade. */
export const MIN_RUN = 3;

export function evaluateTickSequence(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime = classifyRegime(ticks)
): RiseFallSignal {
    const required = Math.max(config.minTicks, config.confirmationTicks * 2);
    if (ticks.length < required) {
        return emptySignal(
            'tick_sequence',
            symbol,
            ticks,
            `No trade — waiting for ${required - ticks.length} more genuine ticks before a sequence can be read.`
        );
    }

    const quotes = quotesOf(ticks);
    const deltas = deltasOf(quotes);
    const confirmationDeltas = deltas.slice(-Math.max(4, config.confirmationTicks));

    // Trailing run of same-direction ticks, ignoring flat ticks inside it.
    let runLength = 0;
    let runDirection: SignalDirection = 'none';
    for (let index = confirmationDeltas.length - 1; index >= 0; index -= 1) {
        const delta = confirmationDeltas[index];
        if (delta === 0) continue;
        const direction: SignalDirection = delta > 0 ? 'rise' : 'fall';
        if (runDirection === 'none') {
            runDirection = direction;
            runLength = 1;
        } else if (direction === runDirection) {
            runLength += 1;
        } else {
            break;
        }
    }

    const sameSide = confirmationDeltas.filter(delta => (runDirection === 'rise' ? delta > 0 : delta < 0)).length;
    const purity = confirmationDeltas.length ? sameSide / confirmationDeltas.length : 0;
    const net = quotes[quotes.length - 1] - quotes[quotes.length - 1 - Math.max(2, config.confirmationTicks)];
    const meanAbsMove = meanAbs(confirmationDeltas);
    const normalised = meanAbsMove > 0 ? net / (meanAbsMove * Math.max(2, config.confirmationTicks)) : 0;
    const netDirection = directionOf(normalised, 0.1);

    const regimeDirection: SignalDirection =
        regime.direction === 'up' ? 'rise' : regime.direction === 'down' ? 'fall' : 'none';

    const contributions: SignalContribution[] = [
        contribution(
            'run',
            'Sequence length',
            WEIGHTS.run,
            runDirection,
            clamp01((runLength - (MIN_RUN - 1)) / 4),
            runLength >= MIN_RUN
                ? `${runLength} consecutive ticks moved ${runDirection === 'rise' ? 'up' : 'down'}`
                : `The trailing run is ${Math.max(runLength, 0)} tick(s) — too short to trade`
        ),
        contribution(
            'purity',
            'Sequence purity',
            WEIGHTS.purity,
            runDirection,
            (purity - 0.5) / 0.5,
            `${sameSide} of ${confirmationDeltas.length} confirmation ticks moved with the run`
        ),
        contribution(
            'net',
            'Net move',
            WEIGHTS.netMove,
            netDirection,
            Math.abs(normalised),
            netDirection === 'none'
                ? 'The window has no net move'
                : `Net move across the window is ${Math.abs(net).toFixed(Math.abs(net) >= 0.1 ? 2 : 4)}`
        ),
        contribution(
            'regime',
            'Regime agreement',
            WEIGHTS.regime,
            regimeDirection === runDirection ? regimeDirection : 'none',
            1,
            regimeDirection === 'none'
                ? `${regime.label} has no direction`
                : regimeDirection === runDirection
                  ? `${regime.label} agrees with the run`
                  : `${regime.label} points against the run`
        ),
    ];

    return assembleSignal({
        strategyId: 'tick_sequence',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (runLength < MIN_RUN) return { suitable: false, reason: `the trailing run is only ${runLength} tick(s)` };
            if (runDirection !== direction) return { suitable: false, reason: 'the longest run points the other way' };
            if (netDirection !== direction) {
                return { suitable: false, reason: 'the net move across the window contradicts the run' };
            }
            if (regime.id === 'possible_reversal') {
                return { suitable: false, reason: 'the regime is a possible reversal' };
            }
            if (regimeDirection !== 'none' && regimeDirection !== direction) {
                return { suitable: false, reason: 'the regime points against the sequence' };
            }
            return { suitable: true, reason: null };
        },
    });
}
