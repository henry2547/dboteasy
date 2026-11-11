/**
 * The two AI bots' purchases, in plain rules.
 *
 * - Even-Odd buys the digit contract for the parity it confirmed (DIGITEVEN /
 *   DIGITODD).
 * - Rise-Fall buys the run it confirmed the other way round (a rising run is a
 *   Fall entry, a falling run a Rise entry), which is a CALL / PUT.
 *
 * Staking and the session stop are the setup fields the page shows: the stake
 * is lifted by the multiplier after every loss and reset on a win, and the run
 * ends when the settled profit reaches the take profit or the stop loss.
 */

import type { AiBotId, AiBotSettings, TradeSide } from './types';

export type AiContractType = 'DIGITEVEN' | 'DIGITODD' | 'CALL' | 'PUT';

export interface AiTradePlan {
    contractType: AiContractType;
    /** Short side name the journal and the bot builder panels read. */
    side: string;
}

/** What one signal buys, or `null` when the side does not belong to the bot. */
export function tradePlanFor(botId: AiBotId, side: TradeSide): AiTradePlan | null {
    if (botId === 'even_odd') {
        if (side === 'Even') return { contractType: 'DIGITEVEN', side: 'Even' };
        if (side === 'Odd') return { contractType: 'DIGITODD', side: 'Odd' };
        return null;
    }

    if (side === 'Rise') return { contractType: 'CALL', side: 'Rise' };
    if (side === 'Fall') return { contractType: 'PUT', side: 'Fall' };
    return null;
}

/** Stake for the next entry: the base stake lifted by the multiplier after `losses` losses. */
export function nextStake(base: number, martingale: number, losses: number): number {
    const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
    const multiplier = Number.isFinite(martingale) && martingale > 1 ? martingale : 1;
    const stake = safeBase * multiplier ** Math.max(0, Math.floor(losses));
    return Math.round(stake * 100) / 100;
}

export type SessionStop = 'take_profit' | 'stop_loss' | null;

/** Which session stop the settled profit has reached — `null` while it is inside both limits. */
export function sessionStop(
    profit: number,
    settings: Pick<AiBotSettings, 'takeProfit' | 'stopLoss'>
): SessionStop {
    if (settings.takeProfit > 0 && profit >= settings.takeProfit) return 'take_profit';
    if (settings.stopLoss > 0 && profit <= -settings.stopLoss) return 'stop_loss';
    return null;
}

/** Ticks one contract covers — the setup's Ticks field, at least one. */
export function contractTicks(ticks: number): number {
    const value = Math.floor(ticks);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 10) : 1;
}
