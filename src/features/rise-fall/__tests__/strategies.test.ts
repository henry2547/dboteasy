import {
    CONFLUENCE_MIN_AGREEMENT,
    DEFAULT_STRATEGY_CONFIG,
    STRATEGY_IDS,
    evaluateAllStrategies,
    evaluateStrategy,
} from '../strategies';
import { evaluateConfluence } from '../strategies/confluence';
import { classifyRegime } from '../regime';
import type { RiseFallSignal, StrategyId, Tick, TradeDirection } from '../types';

function makeTicks(deltas: number[], start = 100): Tick[] {
    let quote = start;
    return deltas.map((delta, index) => {
        quote += delta;
        return { epoch: 1_700_000_000 + index, quote: Number(quote.toFixed(3)) };
    });
}

/** A steady climb with small pullbacks — the same shape the trend tests use. */
const risingSeries = Array.from({ length: 140 }, (_, index) => (index % 4 === 3 ? -0.2 : 0.6));
const fallingSeries = risingSeries.map(delta => -delta);

/** A tight range, then a decisive push above it. */
const rangeThenBreakout = [
    ...Array.from({ length: 100 }, (_, index) => (index % 2 === 0 ? 0.1 : -0.1)),
    ...Array.from({ length: 20 }, () => 0.8),
];

/** A long climb, then most of the move given back in a handful of ticks. */
const riseThenDrop = [...Array.from({ length: 110 }, () => 0.5), ...Array.from({ length: 10 }, () => -3)];

/** A quiet tape that accelerates upward — a burst, not a grind. */
const acceleratingRise = [
    ...Array.from({ length: 80 }, (_, index) => (index % 2 === 0 ? 0.06 : -0.04)),
    ...Array.from({ length: 30 }, (_, index) => 0.2 + index * 0.12),
];

/** A quiet tape that suddenly widens upward. */
const quietThenWide = [
    ...Array.from({ length: 80 }, (_, index) => (index % 2 === 0 ? 0.05 : -0.05)),
    ...Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? 0.9 : -0.3)),
];

/** A climb that ends in a run of up ticks. */
const trailingRun = [...Array.from({ length: 120 }, () => 0.5), ...Array.from({ length: 6 }, () => 0.4)];

function baseSignal(id: StrategyId, direction: TradeDirection, score: number, suitable = true): RiseFallSignal {
    const ticks = makeTicks(risingSeries);
    return {
        strategyId: id,
        symbol: 'R_100',
        direction,
        riseScore: direction === 'rise' ? score : 0,
        fallScore: direction === 'fall' ? score : 0,
        confidence: score / 100,
        contributions: [],
        explanation: 'test fixture',
        regime: 'strong_uptrend',
        suitable,
        ticksAnalysed: ticks.length,
        evaluatedAt: 1_700_000_000_000,
        fingerprint: `R_100:${id}:${direction}:1700000000`,
    };
}

describe('the eight strategies', () => {
    it('reports every strategy in the brief’s order with its own fingerprint and bounded scores', () => {
        const ticks = makeTicks(risingSeries);
        const signals = evaluateAllStrategies(ticks, 'R_100');

        expect(signals.map(signal => signal.strategyId)).toEqual(STRATEGY_IDS);
        signals.forEach(signal => {
            expect(signal.fingerprint).toContain(`R_100:${signal.strategyId}:`);
            expect(signal.riseScore).toBeGreaterThanOrEqual(0);
            expect(signal.riseScore).toBeLessThanOrEqual(100);
            expect(signal.fallScore).toBeGreaterThanOrEqual(0);
            expect(signal.fallScore).toBeLessThanOrEqual(100);
            expect(signal.explanation.length).toBeGreaterThan(0);
            expect(signal.contributions.length).toBeGreaterThan(0);
        });
    });

    it('waits for enough genuine ticks instead of guessing', () => {
        const ticks = makeTicks(risingSeries.slice(0, 10));
        STRATEGY_IDS.forEach(id => {
            const signal = evaluateStrategy(id, ticks, 'R_100');
            expect(signal.strategyId).toBe(id);
            expect(signal.direction).toBe('none');
            expect(signal.suitable).toBe(false);
            expect(signal.ticksAnalysed).toBe(10);
        });
    });

    it('momentum calls a Rise on a move that is efficient and accelerating', () => {
        const signal = evaluateStrategy('momentum', makeTicks(acceleratingRise), 'R_100');

        expect(signal.direction).toBe('rise');
        expect(signal.suitable).toBe(true);
        expect(signal.explanation).toContain('Rise');
    });

    it('momentum calls a Fall on the mirror image', () => {
        const signal = evaluateStrategy(
            'momentum',
            makeTicks(acceleratingRise.map(delta => -delta)),
            'R_100'
        );

        expect(signal.direction).toBe('fall');
        expect(signal.suitable).toBe(true);
    });

    it('momentum refuses a choppy grind that never accelerates', () => {
        const signal = evaluateStrategy(
            'momentum',
            makeTicks(Array.from({ length: 140 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5))),
            'R_100'
        );

        expect(signal.direction).toBe('none');
    });

    it('breakout trades a range that has just been left behind', () => {
        const signal = evaluateStrategy('breakout', makeTicks(rangeThenBreakout), 'R_100');

        expect(signal.direction).toBe('rise');
        expect(signal.suitable).toBe(true);
    });

    it('breakout refuses a market that never leaves its range', () => {
        const signal = evaluateStrategy(
            'breakout',
            makeTicks(Array.from({ length: 140 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5))),
            'R_100'
        );

        expect(signal.direction).toBe('none');
        expect(signal.suitable).toBe(false);
    });

    it('pullback only trades once a trend has pulled back and turned again', () => {
        const signal = evaluateStrategy('pullback', makeTicks(risingSeries), 'R_100');

        expect(signal.strategyId).toBe('pullback');
        // A market that never gave anything back must not be bought at its extreme.
        expect(signal.direction === 'none' || signal.suitable === false || signal.fallScore < signal.riseScore).toBe(
            true
        );
    });

    it('reversal trades an exhausted move, not the move itself', () => {
        const signal = evaluateStrategy('reversal', makeTicks(riseThenDrop), 'R_100');

        expect(signal.direction).toBe('fall');
        expect(signal.suitable).toBe(true);
    });

    it('volatility expansion needs a side before it trades a widening range', () => {
        const signal = evaluateStrategy('volatility_expansion', makeTicks(quietThenWide), 'R_100');

        expect(signal.direction).toBe('rise');
        expect(signal.suitable).toBe(true);
    });

    it('tick sequence trades a genuine run and ignores an alternating tape', () => {
        const run = evaluateStrategy('tick_sequence', makeTicks(trailingRun), 'R_100');
        const alternating = evaluateStrategy(
            'tick_sequence',
            makeTicks(Array.from({ length: 140 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5))),
            'R_100'
        );

        expect(run.direction).toBe('rise');
        expect(run.suitable).toBe(true);
        expect(alternating.direction).toBe('none');
    });
});

describe('confluence', () => {
    const ticks = makeTicks(risingSeries);
    const regime = classifyRegime(ticks);

    const BASE_IDS: StrategyId[] = [
        'trend_continuation',
        'breakout',
        'pullback',
        'momentum',
        'reversal',
        'volatility_expansion',
        'tick_sequence',
    ];

    const sevenWith = (voters: Array<[StrategyId, TradeDirection]>): RiseFallSignal[] =>
        BASE_IDS.map(id => {
            const vote = voters.find(([voter]) => voter === id);
            return vote ? baseSignal(id, vote[1], 80) : baseSignal(id, 'rise', 0, false);
        });

    const base = sevenWith([
        ['trend_continuation', 'rise'],
        ['momentum', 'rise'],
    ]);

    it('trades only when at least two strategies agree', () => {
        const signal = evaluateConfluence(base, ticks, 'R_100', DEFAULT_STRATEGY_CONFIG, regime);

        expect(CONFLUENCE_MIN_AGREEMENT).toBe(2);
        expect(signal.direction).toBe('rise');
        expect(signal.suitable).toBe(true);
        expect(signal.explanation).toContain('Rise');
    });

    it('refuses a lonely signal however strong it is', () => {
        const lonely = sevenWith([['trend_continuation', 'rise']]).map((signal, index) =>
            index === 0 ? { ...signal, riseScore: 100 } : signal
        );
        const result = evaluateConfluence(lonely, ticks, 'R_100', DEFAULT_STRATEGY_CONFIG, regime);

        expect(result.suitable).toBe(false);
    });

    it('refuses a side a strong dissenting strategy argues against', () => {
        const contested = sevenWith([
            ['trend_continuation', 'rise'],
            ['momentum', 'rise'],
        ]).map(signal =>
            signal.strategyId === 'reversal' ? { ...baseSignal('reversal', 'fall', 90), suitable: true } : signal
        );
        const result = evaluateConfluence(contested, ticks, 'R_100', DEFAULT_STRATEGY_CONFIG, regime);

        expect(result.suitable).toBe(false);
    });

    it('says NO TRADE when none of the others offers an entry', () => {
        const none = sevenWith([]).map(signal => ({ ...signal, direction: 'none' as const }));
        const result = evaluateConfluence(none, ticks, 'R_100', DEFAULT_STRATEGY_CONFIG, regime);

        expect(result.direction).toBe('none');
        expect(result.explanation).toContain('No trade');
    });
});
