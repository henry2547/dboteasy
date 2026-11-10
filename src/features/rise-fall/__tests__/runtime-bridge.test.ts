import { riseFallRuntime } from '@/utils/rise-fall-runtime';
import type { RiseFallRuntimeProvider } from '@/utils/rise-fall-runtime';

const snapshot: ReturnType<RiseFallRuntimeProvider['snapshot']> = {
    connected: true,
    running: true,
    mode: 'virtual',
    symbol: 'R_100',
    strategyId: 'momentum',
    strategyLabel: 'Momentum',
    regime: 'strong_uptrend',
    direction: 'rise',
    suitable: true,
    riseScore: 71,
    fallScore: 12,
    explanation: 'Rise 71/100',
    bestStrategy: 'Momentum',
    bestScore: 1.4,
    stats: { trades: 4, wins: 3, losses: 1, net: 1.85, open: 0 },
    tickEpoch: 1_700_000_000,
    detail: 'momentum · RISE 71/100',
};

describe('rise/fall runtime bridge', () => {
    it('fails closed when the engine tab is not mounted', () => {
        const reading = riseFallRuntime.snapshot();

        expect(reading.connected).toBe(false);
        expect(reading.direction).toBe('none');
        expect(riseFallRuntime.requestEntry({ stake: 1, durationTicks: 5 })).toEqual({
            ok: false,
            reason: expect.stringContaining('not mounted'),
        });
        expect(riseFallRuntime.report()).toContain('not connected');
    });

    it('serves the mounted engine and restores the closed state on unregister', () => {
        const provider: RiseFallRuntimeProvider = {
            snapshot: () => snapshot,
            requestEntry: () => ({ ok: true, reason: '' }),
            report: () => 'engine report',
        };

        const unregister = riseFallRuntime.register(provider);
        expect(riseFallRuntime.connected).toBe(true);
        expect(riseFallRuntime.snapshot().riseScore).toBe(71);
        expect(riseFallRuntime.requestEntry({})).toEqual({ ok: true, reason: '' });
        expect(riseFallRuntime.report()).toBe('engine report');

        unregister();
        expect(riseFallRuntime.connected).toBe(false);
        expect(riseFallRuntime.snapshot().connected).toBe(false);
    });
});
