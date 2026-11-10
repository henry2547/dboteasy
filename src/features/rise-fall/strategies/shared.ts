/**
 * Shared maths and signal assembly for the eight Rise/Fall strategies.
 *
 * Every helper here reads the genuine ticks it is given and nothing else. A
 * score is a filter strength built from documented components — never a
 * probability, and never a forecast.
 */

import type {
    RegimeState,
    RiseFallSignal,
    SignalContribution,
    SignalDirection,
    StrategyId,
    Tick,
    TradeDirection,
} from '../types';

/** The settings every strategy reads. One shape keeps the panel editable. */
export interface StrategyConfig {
    fastPeriod: number;
    mediumPeriod: number;
    slowPeriod: number;
    /** 0..100 entry threshold the winning side must reach. */
    minScore: number;
    /** Ticks used for the momentum and consistency reads. */
    confirmationTicks: number;
    /** Ticks required before any signal is offered. */
    minTicks: number;
    /** Refuse the entry when market structure does not confirm the direction. */
    requireStructure: boolean;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
    fastPeriod: 5,
    mediumPeriod: 13,
    slowPeriod: 34,
    minScore: 60,
    confirmationTicks: 10,
    minTicks: 60,
    requireStructure: true,
};

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

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

export function quotesOf(ticks: Tick[]): number[] {
    return ticks.map(tick => tick.quote);
}

export function deltasOf(quotes: number[]): number[] {
    const deltas: number[] = [];
    for (let index = 1; index < quotes.length; index += 1) {
        deltas.push(quotes[index] - quotes[index - 1]);
    }
    return deltas;
}

export function meanAbs(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}

export function standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/** A display helper for explanation text only — never used in a judgement. */
export function formatPrice(value: number, meanAbsMove: number): string {
    const decimals = meanAbsMove >= 0.1 ? 2 : meanAbsMove >= 0.01 ? 3 : meanAbsMove >= 0.001 ? 4 : 5;
    return value.toFixed(decimals);
}

/** Higher highs + higher lows → rise; lower highs + lower lows → fall. */
export function structureDirection(quotes: number[], blockSize: number): SignalDirection {
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

/** Sums each side's contributions into the two 0..100 scores. */
export function scoreSides(contributions: SignalContribution[]): { riseScore: number; fallScore: number } {
    const round = (value: number) => Math.round(Math.min(100, Math.max(0, value)));
    return {
        riseScore: round(
            contributions.filter(item => item.direction === 'rise').reduce((sum, item) => sum + item.score, 0)
        ),
        fallScore: round(
            contributions.filter(item => item.direction === 'fall').reduce((sum, item) => sum + item.score, 0)
        ),
    };
}

function summarise(contributions: SignalContribution[]): string {
    return contributions
        .filter(item => item.direction !== 'none')
        .map(item => `${item.label.toLowerCase()} ${item.score.toFixed(0)}/${item.weight}`)
        .join(', ');
}

export function emptySignal(strategyId: StrategyId, symbol: string, ticks: Tick[], message: string): RiseFallSignal {
    const lastEpoch = ticks[ticks.length - 1]?.epoch ?? 0;
    return {
        strategyId,
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
        evaluatedAt: lastEpoch * 1000,
        fingerprint: `${symbol}:${strategyId}:none:${lastEpoch}`,
    };
}

export interface SignalAssembly {
    strategyId: StrategyId;
    symbol: string;
    ticks: Tick[];
    contributions: SignalContribution[];
    regime: RegimeState;
    minScore: number;
    /** The strategy's own suitability conditions, decided with the scores in hand. */
    suitableWhen: (context: { direction: SignalDirection; best: TradeDirection; bestScore: number }) => {
        suitable: boolean;
        reason: string | null;
    };
}

/**
 * Turns a strategy's components into the one signal object the executor reads.
 * The entry direction needs the winning score at or above the threshold; the
 * strategy's own filters can still refuse it, which is reported as NO TRADE.
 */
export function assembleSignal(assembly: SignalAssembly): RiseFallSignal {
    const { strategyId, symbol, ticks, contributions, regime, minScore, suitableWhen } = assembly;
    const { riseScore, fallScore } = scoreSides(contributions);
    const best: TradeDirection = riseScore >= fallScore ? 'rise' : 'fall';
    const bestScore = Math.max(riseScore, fallScore);
    const direction: SignalDirection = bestScore >= minScore ? best : 'none';
    const verdict = suitableWhen({ direction, best, bestScore });
    const suitable = direction !== 'none' && verdict.suitable;
    const lastEpoch = ticks[ticks.length - 1]?.epoch ?? 0;
    const summary = summarise(contributions);

    let explanation: string;
    if (direction === 'none') {
        explanation = `No trade — best side scored ${bestScore}/100 against a ${minScore} threshold. ${
            summary || 'No component confirms a direction'
        }. Regime: ${regime.label}.`;
    } else if (!suitable) {
        explanation = `No trade — ${best === 'rise' ? 'Rise' : 'Fall'} scored ${bestScore}/100 but ${
            verdict.reason ?? 'a suitability filter refused it'
        }. Regime: ${regime.label}.`;
    } else {
        explanation = `${best === 'rise' ? 'Rise' : 'Fall'} ${bestScore}/100 — ${summary}. Regime: ${
            regime.label
        }. The score is a filter strength, not a probability of winning.`;
    }

    return {
        strategyId,
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
        fingerprint: `${symbol}:${strategyId}:${best}:${lastEpoch}`,
    };
}

/** The ticks a strategy may look at: the most recent `window`, never more. */
export function recentTicks(ticks: Tick[], window: number): Tick[] {
    return ticks.length > window ? ticks.slice(-window) : ticks;
}

export function contribution(
    id: string,
    label: string,
    weight: number,
    direction: SignalDirection,
    share: number,
    detail: string
): SignalContribution {
    return {
        id,
        label,
        weight,
        score: direction === 'none' ? 0 : weight * clamp01(share),
        direction,
        detail,
    };
}

/** The direction a normalised move points at (0 = flat). */
export function directionOf(move: number, threshold = 0): SignalDirection {
    if (Math.abs(move) <= threshold) return 'none';
    return move > 0 ? 'rise' : 'fall';
}
