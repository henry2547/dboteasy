import { classifyRegime } from '../regime';
import type { Tick } from '../types';

function makeTicks(deltas: number[], start = 100): Tick[] {
    let quote = start;
    return deltas.map((delta, index) => {
        quote += delta;
        return { epoch: 1_700_000_000 + index, quote: Number(quote.toFixed(3)) };
    });
}

const trendingUp = Array.from({ length: 140 }, (_, index) => (index % 4 === 3 ? -0.2 : 0.6));
const trendingDown = trendingUp.map(delta => -delta);
const choppy = Array.from({ length: 140 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5));

describe('classifyRegime', () => {
    it('refuses to name a regime before enough genuine ticks', () => {
        const regime = classifyRegime(makeTicks(trendingUp.slice(0, 12)));
        expect(regime.id).toBe('uncertain');
        expect(regime.trendStrength).toBe(0);
    });

    it('reads a sustained climb as a strong uptrend', () => {
        const regime = classifyRegime(makeTicks(trendingUp));
        expect(regime.id).toBe('strong_uptrend');
        expect(regime.direction).toBe('up');
        expect(regime.trendStrength).toBeGreaterThan(0.5);
    });

    it('reads the mirror image as a strong downtrend', () => {
        const regime = classifyRegime(makeTicks(trendingDown));
        expect(regime.id).toBe('strong_downtrend');
        expect(regime.direction).toBe('down');
    });

    it('does not call a two-sided market a trend', () => {
        const regime = classifyRegime(makeTicks(choppy));
        expect(['sideways', 'low_volatility']).toContain(regime.id);
        expect(regime.trendStrength).toBeLessThan(0.25);
    });

    it('never invents a tick: the reading comes only from the ticks it was given', () => {
        const ticks = makeTicks(trendingUp);
        const regime = classifyRegime(ticks);
        expect(Number.isFinite(regime.meanAbsMove)).toBe(true);
        expect(regime.volatility).toBeGreaterThan(0);
        expect(ticks).toHaveLength(140);
    });
});
