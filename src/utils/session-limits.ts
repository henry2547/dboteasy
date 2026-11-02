/**
 * Session take-profit / stop-loss detection for the trade window alert.
 *
 * The limits belong to the loaded bot (a Free Bots template carries its own take profit and stop
 * loss), and the profit compared against them is the profit of the CURRENT run only: the caller
 * subtracts the statistics baseline it captured when the run started. Nothing here predicts a
 * result — a limit of 0 or less means "not set", so a bot without a limit never raises an alert.
 */

export type TSessionLimitKind = 'take_profit' | 'stop_loss';

export interface TSessionLimitHit {
    kind: TSessionLimitKind;
    /** The configured limit, as a positive amount. */
    amount: number;
}

export const resolveSessionLimitHit = ({
    profit,
    takeProfit,
    stopLoss,
}: {
    profit: number;
    takeProfit?: number | null;
    stopLoss?: number | null;
}): TSessionLimitHit | null => {
    const run_profit = Number(profit) || 0;
    const take_profit = Number(takeProfit) || 0;
    const stop_loss = Number(stopLoss) || 0;

    if (take_profit > 0 && run_profit >= take_profit) return { kind: 'take_profit', amount: take_profit };
    if (stop_loss > 0 && run_profit <= -stop_loss) return { kind: 'stop_loss', amount: stop_loss };

    return null;
};
