/**
 * Unit tests for the trade ledger — the open/settled position bookkeeping
 * behind the AI Bot's Summary and Transactions views. Pure functions, no
 * WebSocket involved.
 */

import { DEFAULT_SETTINGS } from '../constants';
import { applyContractUpdate, applySettlement, createPosition, openPositions } from '../trade-ledger';
import type { ExecutionResult, OpenContractInfo, TradePosition } from '../types';

const settings = { ...DEFAULT_SETTINGS, accountMode: 'demo' as const };

function newPosition(contractId = 1234): TradePosition {
    return createPosition({
        contractId,
        buyPrice: 1.5,
        payout: 2.85,
        contractType: 'DIGITMATCH',
        symbol: 'R_100',
        strategyLabel: 'Matches',
        settings,
        loginid: 'VRT123456',
        openedAt: 1_700_000_000_000,
    });
}

function contractUpdate(overrides: Partial<OpenContractInfo> = {}): OpenContractInfo {
    return {
        contractId: 1234,
        contractType: 'DIGITMATCH',
        symbol: 'R_100',
        buyPrice: 1.5,
        payout: 2.85,
        profit: 1.35,
        isSold: false,
        isValidToSell: true,
        isExpired: false,
        entryTick: 629.81,
        currentSpot: 630.12,
        status: 'open',
        transactionId: 99,
        ...overrides,
    };
}

function settlement(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
    return {
        contractId: 1234,
        state: 'settled',
        buyPrice: 1.5,
        payout: 2.85,
        profit: 1.35,
        status: 'won',
        message: 'Contract settled: won 1.35',
        timestamp: 1_700_000_060_000,
        ...overrides,
    };
}

describe('trade ledger', () => {
    it('creates an open position with the stake, account and strategy it was bought with', () => {
        const position = newPosition();

        expect(position.contractId).toBe(1234);
        expect(position.stake).toBe(1.5);
        expect(position.payout).toBe(2.85);
        expect(position.strategyLabel).toBe('Matches');
        expect(position.accountMode).toBe('demo');
        expect(position.loginid).toBe('VRT123456');
        expect(position.status).toBe('open');
        expect(position.settlement).toBe('pending');
        expect(position.contractStatus).toBe('open');
        expect(position.profit).toBeNull();
        expect(position.entrySpot).toBeNull();
        expect(position.settledAt).toBeNull();
    });

    it('applies a live contract update to the matching position only', () => {
        const other = newPosition(5678);
        const ledger = [newPosition(), other];

        const updated = applyContractUpdate(ledger, contractUpdate());

        expect(updated[0].profit).toBe(1.35);
        expect(updated[0].currentSpot).toBe(630.12);
        expect(updated[0].entrySpot).toBe(629.81);
        expect(updated[0].isValidToSell).toBe(true);
        expect(updated[0].status).toBe('open');
        expect(updated[1]).toEqual(other);
    });

    it('ignores an update for a contract that is not in the ledger', () => {
        const ledger = [newPosition()];

        const updated = applyContractUpdate(ledger, contractUpdate({ contractId: 9999 }));

        expect(updated[0]).toEqual(ledger[0]);
    });

    it('settles the position with its result while keeping the contract status', () => {
        const open = applyContractUpdate([newPosition()], contractUpdate({ status: 'sold', isSold: true }));

        const settled = applySettlement(open, settlement());

        expect(settled[0].status).toBe('settled');
        expect(settled[0].settlement).toBe('won');
        expect(settled[0].profit).toBe(1.35);
        expect(settled[0].contractStatus).toBe('sold');
        expect(settled[0].settledAt).toBe(1_700_000_060_000);
        expect(openPositions(settled)).toHaveLength(0);
    });

    it('records a loss when the settled profit is negative', () => {
        const settled = applySettlement([newPosition()], settlement({ profit: -1.5, status: 'lost' }));

        expect(settled[0].settlement).toBe('lost');
        expect(settled[0].profit).toBe(-1.5);
    });

    it('keeps open positions after a settlement of another contract', () => {
        const ledger = [newPosition(), newPosition(5678)];

        const settled = applySettlement(ledger, settlement());

        expect(openPositions(settled).map(p => p.contractId)).toEqual([5678]);
    });
});
