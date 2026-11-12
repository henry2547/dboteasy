/**
 * Shared shapes for the AI Bots tab.
 *
 * The tab reads public market data only: a scan of every volatility market, and
 * the two bot rules (hot/cold parity for Even-Odd, a price run for Rise-Fall)
 * are applied to the scanned ticks. Nothing here places an order.
 */

export type AiBotId = 'even_odd' | 'rise_fall';

/** Side a bot would take. Even/Rise are the "up" side, Odd/Fall the "down" side. */
export type TradeSide = 'Even' | 'Odd' | 'Rise' | 'Fall';

export type ScanStatus = 'idle' | 'scanning' | 'ready' | 'error';

export interface AiBotSettings {
    /** `all` or the api symbol of one market. */
    marketScope: string;
    stake: number;
    takeProfit: number;
    stopLoss: number;
    martingale: number;
}

/** One market in the live scan: the digits and quotes the scan read, or why it could not. */
export interface ScanRow {
    symbol: string;
    displayName: string;
    digits: number[];
    prices: number[];
    status: 'scanned' | 'failed' | 'skipped' | 'insufficient';
    reason: string | null;
    scannedAt: number | null;
}
