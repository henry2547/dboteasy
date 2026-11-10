import { DEFAULT_TREND_CONTINUATION, ema, evaluateTrendContinuation } from '../strategies/trend-continuation';
import type { Tick } from '../types';

function makeTicks(deltas: number[], start = 100): Tick[] {
    let quote = start;
    return deltas.map((delta, index) => {
        quote += delta;
        return { epoch: 1_700_000_000 + index, quote: Number(quote.toFixed(3)) };
    });
}

const risingSeries = Array.from({ length: 140 }, (_, index) => (index % 4 === 3 ? -0.2 : 0.6));
const fallingSeries = risingSeries.map(delta => -delta);
const flatSeries = Array.from({ length: 140 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5));

describe('ema', () => {
    it('returns null until there are enough values', () => {
        expect(ema([1, 2, 3], 5)).toBeNull();
    });

    it('tracks a rising series above its starting average', () => {
        expect(ema([1, 2, 3, 4, 5, 6], 5)).toBeGreaterThan(3);
    });
});

describe('evaluateTrendContinuation', () => {
    it('offers a Rise signal on a confirmed uptrend', () => {
        const signal = evaluateTrendContinuation(makeTicks(risingSeries), 'R_100');

        expect(signal.direction).toBe('rise');
        expect(signal.riseScore).toBeGreaterThanOrEqual(DEFAULT_TREND_CONTINUATION.minScore);
        expect(signal.suitable).toBe(true);
        expect(signal.regime).toBe('strong_uptrend');
        expect(signal.explanation).toContain('Rise');
        expect(signal.contributions.map(item => item.id)).toEqual([
            'ema',
            'structure',
            'strength',
            'momentum',
            'consistency',
        ]);
    });

    it('offers a Fall signal on a confirmed downtrend', () => {
        const signal = evaluateTrendContinuation(makeTicks(fallingSeries), 'R_100');

        expect(signal.direction).toBe('fall');
        expect(signal.fallScore).toBeGreaterThanOrEqual(DEFAULT_TREND_CONTINUATION.minScore);
        expect(signal.suitable).toBe(true);
    });

    it('returns NO TRADE on a two-sided market rather than forcing a side', () => {
        const signal = evaluateTrendContinuation(makeTicks(flatSeries), 'R_100');

        expect(signal.direction).toBe('none');
        expect(signal.suitable).toBe(false);
        expect(signal.explanation).toContain('No trade');
    });

    it('waits for enough ticks instead of guessing', () => {
        const signal = evaluateTrendContinuation(makeTicks(risingSeries.slice(0, 20)), 'R_100');

        expect(signal.direction).toBe('none');
        expect(signal.ticksAnalysed).toBe(20);
        expect(signal.explanation).toContain('genuine ticks');
    });

    it('fingerprints one signal per tick so the executor can refuse a duplicate', () => {
        const ticks = makeTicks(risingSeries);
        const first = evaluateTrendContinuation(ticks, 'R_100');
        const second = evaluateTrendContinuation(ticks, 'R_100');
        const later = evaluateTrendContinuation(makeTicks([...risingSeries, 0.6]), 'R_100');

        expect(first.fingerprint).toBe(second.fingerprint);
        expect(later.fingerprint).not.toBe(first.fingerprint);
    });

    it('refuses an entry when market structure does not confirm the trend', () => {
        // A steady climb whose recent swings collapse: EMA stack still aligned,
        // but structure no longer makes higher highs and higher lows.
        const series = [...risingSeries.slice(0, 130), 0.6, -1.4, 0.6, -1.4, 0.6, -1.4, 0.6, -1.4, 0.6, -1.4];
        const signal = evaluateTrendContinuation(makeTicks(series), 'R_100');

        expect(signal.direction === 'none' || signal.suitable === false).toBe(true);
    });

    it('lowers the score when the threshold is raised above what the market earned', () => {
        const ticks = makeTicks(risingSeries);
        const signal = evaluateTrendContinuation(ticks, 'R_100', {
            ...DEFAULT_TREND_CONTINUATION,
            minScore: 99,
        });

        expect(signal.direction).toBe('none');
        expect(signal.suitable).toBe(false);
    });
});
