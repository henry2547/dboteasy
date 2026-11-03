/**
 * Trade-condition alerts for the market scan.
 *
 * A scanned market raises an alert for every bot whose rule the sample satisfies — bot 8 (Over 1:
 * digits 0 and 1 under 10%) and bot 9 (Under 8: digits 8 and 9 under 10%). The messages are built
 * from the scan's own digits through `matchFreeBotSetups`, so an alert can never name a bot the row
 * would not offer.
 *
 * The notification is an in-app toast (react-toastify, mounted app-wide). Nothing is bought, and an
 * alert is a reading of the ticks already seen — not a prediction of the next one.
 */

import { toast } from 'react-toastify';
import { matchFreeBotSetups } from '@/pages/free-bots/scanner-match';
import type { MarketScan } from './scan-markets';

/** Alerts shown as individual toasts; the rest are rolled into one line. */
export const MAX_ALERT_TOASTS = 3;

export interface TradeAlert {
    symbol: string;
    market: string;
    botNumber: number;
    strategyLabel: string;
    message: string;
}

/** Every market/bot pair whose trading conditions the scan found. */
export function collectTradeAlerts(results: MarketScan[]): TradeAlert[] {
    const alerts: TradeAlert[] = [];

    results.forEach(result => {
        matchFreeBotSetups(result.digits)
            .filter(setup => setup.ready)
            .forEach(setup => {
                alerts.push({
                    symbol: result.market.apiSymbol,
                    market: result.market.displayName,
                    botNumber: setup.botNumber,
                    strategyLabel: setup.strategyLabel,
                    message: `Bot ${setup.botNumber} (${setup.strategyLabel}) conditions met on ${result.market.displayName}`,
                });
            });
    });

    return alerts;
}

/** Raises the in-app notification for a finished scan's alerts. */
export function notifyTradeAlerts(alerts: TradeAlert[]): void {
    if (alerts.length === 0) return;

    alerts.slice(0, MAX_ALERT_TOASTS).forEach((alert, index) => {
        toast.info(alert.message, { toastId: `trade-alert-${alert.symbol}-${alert.botNumber}-${index}` });
    });

    if (alerts.length > MAX_ALERT_TOASTS) {
        toast.info(
            `${alerts.length - MAX_ALERT_TOASTS} more market${alerts.length - MAX_ALERT_TOASTS === 1 ? '' : 's'} meet a trade condition — open the scan results.`,
            { toastId: 'trade-alert-more' }
        );
    }
}
