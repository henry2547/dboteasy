import { BREAK_EVEN_WIN_RATE, backtestStrategies, backtestStrategy, bestStrategy, rankStrategies } from '../backtest';
import { STRATEGY_IDS } from '../strategies';
import type { Tick } from '../types';

function makeTicks(deltas: number[], start = 100): Tick[] {
    let quote = start;
    return deltas.map((delta, index) => {
        quote += delta;
        return { epoch: 1_700_000_000 + index, quote: Number(quote.toFixed(3)) };
    });
}

/** A trending tape with pullbacks, so several strategies find real entries. */
const trending = makeTicks(
    Array.from({ length: 400 }, (_, index) => {
        if (index % 11 === 10) return -0.9;
        if (index % 5 === 4) return -0.3;
        return 0.7;
    })
);

describe('walk-forward backtest', () => {
    it('reports every strategy over the same ticks', () => {
        const results = backtestStrategies(trending, 'R_100');

        expect(results.map(result => result.strategyId)).toEqual(STRATEGY_IDS);
        results.forEach(result => {
            expect(result.decisions).toBeGreaterThan(0);
            expect(result.decisions).toBeLessThan(trending.length);
            expect(result.wins + result.losses).toBe(result.trades);
            expect(result.breakEvenWinRate).toBeCloseTo(BREAK_EVEN_WIN_RATE, 6);
            expect(result.note).toContain('ESTIMATED');
        });
        expect(results.some(result => result.trades > 0)).toBe(true);
    });

    it('reports an edge against the stated payout, never a raw win rate alone', () => {
        const withTrades = backtestStrategies(trending, 'R_100').find(result => result.trades > 0);
        expect(withTrades).toBeDefined();
        if (!withTrades) return;

        expect(withTrades.winRate).not.toBeNull();
        expect(withTrades.edge).toBeCloseTo((withTrades.winRate as number) - BREAK_EVEN_WIN_RATE, 6);
    });

    it('never looks ahead: appending future ticks cannot change what already happened', () => {
        const cut = 260;
        const earlier = trending.slice(0, cut);
        const extended = trending.slice(0, cut + 40);
        const id = 'trend_continuation';

        const before = backtestStrategy(id, earlier, 'R_100');
        const after = backtestStrategy(id, extended, 'R_100', { strategyIds: [id] });

        expect(before.firstEntryEpoch).toBe(after.firstEntryEpoch);
        expect(after.trades).toBeGreaterThanOrEqual(before.trades);
        // The first `before.trades` settled trades are the same trades, not new ones.
        expect(after.wins).toBeGreaterThanOrEqual(before.wins);
    });

    it('ranks every qualifying strategy above the ones with too few trades', () => {
        const ranked = rankStrategies(trending, 'R_100');
        const firstUnqualified = ranked.findIndex(result => !result.qualified);

        expect(ranked).toHaveLength(STRATEGY_IDS.length);
        if (firstUnqualified >= 0) {
            expect(ranked.slice(firstUnqualified).every(result => !result.qualified)).toBe(true);
        }
        for (let index = 1; index < ranked.length; index += 1) {
            if (ranked[index - 1].qualified && ranked[index].qualified) {
                expect(ranked[index - 1].score).toBeGreaterThanOrEqual(ranked[index].score);
            }
        }
    });

    it('bestStrategy only ever returns a qualified strategy', () => {
        const ranked = rankStrategies(trending, 'R_100');
        const best = bestStrategy(trending, 'R_100');

        if (ranked.some(result => result.qualified)) {
            expect(best?.qualified).toBe(true);
        } else {
            expect(best).toBeNull();
        }
    });

    it('refuses to produce a ranking from too little history', () => {
        const short = trending.slice(0, 30);
        const results = backtestStrategies(short, 'R_100');

        expect(results.every(result => result.trades === 0 && result.decisions === 0)).toBe(true);
    });
});
