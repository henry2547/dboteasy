/**
 * Trade ledger — the bookkeeping behind the AI Bot's Summary and Transactions
 * views.
 *
 * One TradePosition is created for every contract the bot buys. It is updated
 * from each `proposal_open_contract` message while the contract is open, and
 * completed when the contract settles, so the contract status and the
 * settlement result of a position stay visible after it closes. Pure functions
 * only — the engine owns the state.
 */

import type { ExecutionResult, OpenContractInfo, TradePosition, TradingSettings } from './types';

export interface OpenPositionParams {
    contractId: number;
    buyPrice: number;
    payout: number;
    contractType: string;
    symbol: string;
    strategyLabel: string | null;
    settings: TradingSettings;
    loginid: string | null;
    openedAt: number;
}

/** Create the ledger entry for a contract the bot has just bought. */
export function createPosition(params: OpenPositionParams): TradePosition {
    return {
        contractId: params.contractId,
        contractType: params.contractType,
        symbol: params.symbol,
        strategyLabel: params.strategyLabel,
        accountMode: params.settings.accountMode,
        loginid: params.loginid,
        stake: params.buyPrice,
        payout: params.payout,
        profit: null,
        entrySpot: null,
        currentSpot: null,
        contractStatus: 'open',
        isValidToSell: false,
        isExpired: false,
        status: 'open',
        settlement: 'pending',
        openedAt: params.openedAt,
        settledAt: null,
    };
}

/** Apply a live contract update to the matching position (others untouched). */
export function applyContractUpdate(positions: TradePosition[], contract: OpenContractInfo): TradePosition[] {
    return positions.map(position =>
        position.contractId === contract.contractId
            ? {
                  ...position,
                  contractType: contract.contractType || position.contractType,
                  symbol: contract.symbol || position.symbol,
                  payout: contract.payout > 0 ? contract.payout : position.payout,
                  profit: contract.profit ?? position.profit,
                  entrySpot: contract.entryTick ?? position.entrySpot,
                  currentSpot: contract.currentSpot,
                  contractStatus: contract.status ?? position.contractStatus,
                  isValidToSell: contract.isValidToSell,
                  isExpired: contract.isExpired,
              }
            : position
    );
}

/** Complete the matching position when its contract settles. */
export function applySettlement(positions: TradePosition[], result: ExecutionResult): TradePosition[] {
    const settlement = result.status === 'won' || result.status === 'lost' ? result.status : 'pending';
    return positions.map(position =>
        position.contractId === result.contractId
            ? {
                  ...position,
                  profit: result.profit ?? position.profit,
                  payout: result.payout ?? position.payout,
                  status: 'settled',
                  settlement,
                  settledAt: result.timestamp,
              }
            : position
    );
}

/** The positions that are still open. */
export function openPositions(positions: TradePosition[]): TradePosition[] {
    return positions.filter(position => position.status === 'open');
}
