/**
 * The market-conditions read: all five digit markets, each compared with its own
 * fair share (Over 1 loses on two digits, Under 7 on three), plus entry guidance.
 */

import { buildMarketConditions, readParity } from '../market-conditions';
import { calculateStatisticsFromDigits } from '../statistics';

const flat = () => Array.from({ length: 100 }, (_, index) => index % 10);

describe('buildMarketConditions', () => {
    it('reports all five markets', () => {
        const condition = buildMarketConditions(calculateStatisticsFromDigits(flat()), flat());
        expect(condition.items.map(item => item.label)).toEqual(['Over 1', 'Over 2', 'Under 8', 'Under 7', 'Even / Odd']);
        expect(condition.entryGuidance).toHaveLength(5);
        expect(condition.entryGuidance[condition.entryGuidance.length - 1]).toContain('Even/Odd');
    });

    it('calls an even distribution clean for every Over/Under market', () => {
        const digits = flat();
        const condition = buildMarketConditions(calculateStatisticsFromDigits(digits), digits);
        const barriers = condition.items.filter(item => item.label !== 'Even / Odd');
        expect(barriers.every(item => item.tone === 'favourable')).toBe(true);
        expect(condition.score).toBeGreaterThanOrEqual(80);
    });

    it('flags a hot losing pair instead of treating every multi-digit set as unstable', () => {
        // Digit 0 and 1 take 20% each: Over 1 must be unstable.
        const digits = [
            ...Array.from({ length: 20 }, () => 0),
            ...Array.from({ length: 20 }, () => 1),
            ...Array.from({ length: 60 }, (_, index) => 2 + (index % 8)),
        ];
        const statistics = calculateStatisticsFromDigits(digits);
        const condition = buildMarketConditions(statistics, digits);
        const over1 = condition.items.find(item => item.label === 'Over 1');
        const under8 = condition.items.find(item => item.label === 'Under 8');

        expect(over1?.tone).toBe('caution');
        expect(over1?.value).toContain('60.0% win');
        // 8 and 9 are not hot here, so Under 8 keeps its clean 20% fair share.
        expect(under8?.tone).not.toBe('caution');
    });

    it('says there is no Even/Odd entry when hot and cold split parity', () => {
        const digits = [
            ...Array.from({ length: 20 }, () => 1),
            ...Array.from({ length: 6 }, () => 0),
            ...Array.from({ length: 74 }, (_, index) => 2 + (index % 8)),
        ];
        const statistics = calculateStatisticsFromDigits(digits);
        const condition = buildMarketConditions(statistics, digits);
        const parity = readParity(statistics, digits);

        expect(parity.parity).not.toBe('even');
        expect(condition.entryGuidance[condition.entryGuidance.length - 1]).toContain('split parity');
    });

    it('reads no conditions without ticks', () => {
        const condition = buildMarketConditions(calculateStatisticsFromDigits([]));
        expect(condition.items).toEqual([]);
        expect(condition.headline).toBe('Reading the market…');
    });
});
