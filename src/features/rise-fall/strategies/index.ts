/**
 * The eight Rise/Fall strategies, in the order the brief lists them.
 *
 * Every strategy is a pure function of the ticks it is given. This registry is
 * the one place that knows their names and how to run them, so the live panel,
 * the backtester and the bot runtime all evaluate the same code.
 */

import { classifyRegime } from '../regime';
import type { RegimeState, RiseFallSignal, StrategyId, Tick } from '../types';
import { evaluateBreakout } from './breakout';
import { evaluateConfluence } from './confluence';
import { evaluateMomentum } from './momentum';
import { evaluatePullback } from './pullback';
import { evaluateReversal } from './reversal';
import { DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from './shared';
import { evaluateTickSequence } from './tick-sequence';
import { evaluateTrendContinuation } from './trend-continuation';
import { evaluateVolatilityExpansion } from './volatility-expansion';

export interface StrategyDefinition {
    id: StrategyId;
    label: string;
    blurb: string;
}

export const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
    {
        id: 'trend_continuation',
        label: 'Trend Continuation',
        blurb: 'Trades with an aligned EMA stack that structure, momentum and tick consistency also confirm.',
    },
    {
        id: 'breakout',
        label: 'Breakout',
        blurb: 'Trades a quote that has left a measured range and is still pushing that way.',
    },
    {
        id: 'pullback',
        label: 'Pullback',
        blurb: 'Trades with the trend only after a pullback toward its average and a recovery tick.',
    },
    {
        id: 'momentum',
        label: 'Momentum',
        blurb: 'Needs an efficient, accelerating move — most of the distance travelled is net.',
    },
    {
        id: 'reversal',
        label: 'Reversal',
        blurb: 'Trades an exhausted move: a real swing back, a tick flip and a stretch or reversal marker.',
    },
    {
        id: 'volatility_expansion',
        label: 'Volatility Expansion',
        blurb: 'Trades a widening range once it has a clear directional side.',
    },
    {
        id: 'confluence',
        label: 'Confluence',
        blurb: 'Trades only when at least two of the other strategies agree on one side.',
    },
    {
        id: 'tick_sequence',
        label: 'Tick Sequence',
        blurb: 'Trades a run of consecutive same-direction ticks while the net move agrees.',
    },
];

export const STRATEGY_IDS: StrategyId[] = STRATEGY_DEFINITIONS.map(item => item.id);

/** The seven strategies confluence reads. */
export const BASE_STRATEGY_IDS: StrategyId[] = STRATEGY_IDS.filter(id => id !== 'confluence');

export function strategyLabel(id: StrategyId): string {
    return STRATEGY_DEFINITIONS.find(item => item.id === id)?.label ?? id;
}

/** Evaluates the seven base strategies for one tick. */
export function evaluateBaseStrategies(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime: RegimeState = classifyRegime(ticks)
): RiseFallSignal[] {
    return [
        evaluateTrendContinuation(ticks, symbol, config, regime),
        evaluateBreakout(ticks, symbol, config, regime),
        evaluatePullback(ticks, symbol, config, regime),
        evaluateMomentum(ticks, symbol, config, regime),
        evaluateReversal(ticks, symbol, config, regime),
        evaluateVolatilityExpansion(ticks, symbol, config, regime),
        evaluateTickSequence(ticks, symbol, config, regime),
    ];
}

/** All eight, confluence last because it reads the other seven. */
export function evaluateAllStrategies(
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime: RegimeState = classifyRegime(ticks)
): RiseFallSignal[] {
    const base = evaluateBaseStrategies(ticks, symbol, config, regime);
    const confluence = evaluateConfluence(base, ticks, symbol, config, regime);
    return [
        base[0],
        base[1],
        base[2],
        base[3],
        base[4],
        base[5],
        confluence,
        base[6],
    ];
}

export function evaluateStrategy(
    id: StrategyId,
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
    regime: RegimeState = classifyRegime(ticks)
): RiseFallSignal {
    return evaluateAllStrategies(ticks, symbol, config, regime).find(signal => signal.strategyId === id) as RiseFallSignal;
}

export { DEFAULT_STRATEGY_CONFIG };
export type { StrategyConfig };
export { evaluateTrendContinuation } from './trend-continuation';
export { evaluateBreakout, BREAKOUT_REGIMES } from './breakout';
export { evaluatePullback } from './pullback';
export { evaluateMomentum } from './momentum';
export { evaluateReversal, MIN_REVERSAL_SHARE } from './reversal';
export { evaluateVolatilityExpansion, EXPANSION_REGIMES } from './volatility-expansion';
export { evaluateTickSequence, MIN_RUN } from './tick-sequence';
export { evaluateConfluence, CONFLUENCE_MIN_AGREEMENT } from './confluence';
