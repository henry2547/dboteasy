/**
 * Unit tests for the order execution service's confirmation gate: a real-money
 * entry quotes first and buys only once it is approved; a cancelled entry and a
 * quote that fails its checks place no order at all. The WebSocket is replaced
 * by a fake message bus, so no network is involved.
 */

import { DEFAULT_SETTINGS } from '../constants';
import { ExecutionEngine, type ExecutionCallbacks } from '../execution-engine';
import type { AuthMessage } from '../auth-ws';
import type { MarketAnalysis, ProposalInfo, StrategySignal } from '../types';

const NOW = 1_700_000_000_000;

function signal(): StrategySignal {
    return {
        id: 'sig_1',
        symbol: 'R_100',
        strategyId: 'matches',
        strategyLabel: 'Matches',
        contractType: 'DIGITMATCH',
        digit: 5,
        barrier: '5',
        timestamp: NOW,
        tickEpoch: Math.floor(NOW / 1000),
        configVersion: 1,
        analysis: { displayName: 'Volatility 100 Index' } as MarketAnalysis,
        conditionsPassed: [],
        conditionsFailed: [],
        reason: 'test',
    };
}

interface Harness {
    engine: ExecutionEngine;
    sent: Record<string, unknown>[];
    proposalsRequested: () => number;
    buys: () => Record<string, any>[];
}

function harness({ askPrice = 1, payout = 1.95 }: { askPrice?: number; payout?: number } = {}): Harness {
    const sent: Record<string, unknown>[] = [];
    let proposalCount = 0;

    const engine = new ExecutionEngine(
        msg => {
            sent.push(msg);
            return sent.length;
        },
        async (msg: Record<string, unknown>) => {
            sent.push(msg);
            if ('proposal' in msg) {
                proposalCount += 1;
                return {
                    msg_type: 'proposal',
                    req_id: 1,
                    proposal: {
                        id: `prop_${proposalCount}`,
                        ask_price: askPrice,
                        payout,
                        longcode: 'Win payout if the last digit matches 5.',
                        spot: 629.81,
                        // Quoted right now, so freshness checks see a live quote.
                        spot_time: Math.floor(Date.now() / 1000),
                        date_start: 0,
                        date_expiry: 0,
                        subscription: { id: `sub_prop_${proposalCount}` },
                    },
                } as AuthMessage;
            }
            if ('buy' in msg) {
                return {
                    msg_type: 'buy',
                    req_id: 2,
                    buy: { contract_id: 9001, buy_price: 1, payout, longcode: 'contract' },
                } as AuthMessage;
            }
            throw new Error(`unexpected request: ${JSON.stringify(msg)}`);
        },
        () => () => undefined,
        () => ({ ...DEFAULT_SETTINGS, accountMode: 'real' })
    );

    return {
        engine,
        sent,
        proposalsRequested: () => proposalCount,
        buys: () => sent.filter(m => 'buy' in m),
    };
}

function recorder() {
    const calls = {
        proposals: [] as (ProposalInfo | null)[],
        buys: [] as Record<string, any>[],
        errors: [] as string[],
        refreshed: [] as ProposalInfo[],
    };
    const callbacks: ExecutionCallbacks = {
        onProposal: info => calls.proposals.push(info),
        onBuy: result => calls.buys.push(result as Record<string, any>),
        onContractUpdate: () => undefined,
        onSettled: () => undefined,
        onError: message => calls.errors.push(message),
        onQuoteRefreshed: info => calls.refreshed.push(info),
    };
    return { calls, callbacks };
}

describe('execution engine confirmation gate', () => {
    it('quotes first and places no order until the entry is approved', async () => {
        const { engine, sent, buys } = harness();
        const { calls, callbacks } = recorder();

        const quote = await engine.prepare(signal(), 'USD', callbacks);

        expect(quote?.id).toBe('prop_1');
        expect(calls.proposals).toHaveLength(1);
        expect(engine.hasPreparedProposal).toBe(true);
        expect(buys()).toHaveLength(0); // held, not bought

        await engine.buyPrepared(callbacks);

        expect(buys()).toHaveLength(1);
        expect(buys()[0].buy).toBe('prop_1');
        expect(calls.buys[0].contractId).toBe(9001);
        expect(sent.some(m => 'proposal_open_contract' in m)).toBe(true);
        expect(engine.hasPreparedProposal).toBe(false);
    });

    it('places no order at all when the pending entry is cancelled', async () => {
        const { engine, sent, buys } = harness();
        const { callbacks } = recorder();

        const quote = await engine.prepare(signal(), 'USD', callbacks);
        expect(quote).not.toBeNull();

        engine.cancelPending();

        expect(engine.hasPreparedProposal).toBe(false);
        expect(buys()).toHaveLength(0);
        // The proposal subscription is dropped, so Deriv stops quoting it.
        expect(sent.some(m => 'forget' in m)).toBe(true);

        await engine.buyPrepared(callbacks); // nothing is held any more
        expect(buys()).toHaveLength(0);
    });

    it('refreshes a quote that went stale while the user decided, then buys it', async () => {
        jest.useFakeTimers({ now: NOW });
        try {
            const { engine, buys, proposalsRequested } = harness();
            const { calls, callbacks } = recorder();

            const quote = await engine.prepare(signal(), 'USD', callbacks);
            expect(quote?.id).toBe('prop_1');

            jest.advanceTimersByTime(6000); // past the quote's shelf life

            await engine.buyPrepared(callbacks);

            expect(proposalsRequested()).toBe(2);
            expect(calls.refreshed.map(p => p.id)).toEqual(['prop_2']);
            expect(buys()).toHaveLength(1);
            expect(buys()[0].buy).toBe('prop_2');
        } finally {
            jest.useRealTimers();
        }
    });

    it('rejects a quote whose price exceeds the maximum stake and holds nothing', async () => {
        const { engine, sent, buys } = harness({ askPrice: DEFAULT_SETTINGS.maxStake + 10 });
        const { calls, callbacks } = recorder();

        const quote = await engine.prepare(signal(), 'USD', callbacks);

        expect(quote).toBeNull();
        expect(engine.hasPreparedProposal).toBe(false);
        expect(calls.errors.some(e => e.includes('exceeds max stake'))).toBe(true);
        expect(sent.some(m => 'forget' in m)).toBe(true);

        await engine.buyPrepared(callbacks);
        expect(buys()).toHaveLength(0);
    });
});
