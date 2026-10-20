/**
 * Scans every volatility market on the public feed and scores how orderly its
 * digits currently are, so the floating scan button can point the user at the
 * calmest market to trade.
 *
 * It uses its own short-lived public WebSocket connection so a scan never
 * disturbs the live subscription the Digits page is streaming.
 */

import { DerivPublicWebSocketClient, type DerivMessage } from './deriv-public-ws';
import { filterDigitMarkets, normalizeActiveSymbols } from './markets';
import { extractLastDigit, formatQuote, resolvePrecision } from './precision';
import { calculateStatisticsFromDigits } from './statistics';
import { computeAdaptiveSignals } from './strategies';
import type { ConnectionState, DigitStatistics, MarketSymbol } from './types';

const SCAN_TICKS = 120;
const MIN_TICKS = 30;
const REQUEST_TIMEOUT_MS = 9000;
const EXPECTED = 10;

export interface MarketScan {
    market: MarketSymbol;
    digits: number[];
    statistics: DigitStatistics;
    score: number;
    edge: number;
    bestRuleLabel: string;
    /** When this market's ticks were read — shown next to a bot's signal status. */
    scannedAt: number;
}

function openClient(client: DerivPublicWebSocketClient): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let off = () => {};

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            off();
            if (error) reject(error);
            else resolve();
        };

        timer = setTimeout(() => finish(new Error('Could not reach the market feed in time.')), REQUEST_TIMEOUT_MS);
        off = client.onStatus((state: ConnectionState) => {
            if (state.status === 'connected') finish();
            else if (state.status === 'error') finish(new Error(state.errorMessage ?? 'The market feed failed.'));
        });
        client.connect();
    });
}

function request(client: DerivPublicWebSocketClient, payload: Record<string, unknown>): Promise<DerivMessage> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const reqId = client.send(payload);

        const finish = (error?: Error, message?: DerivMessage) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            off();
            if (error) reject(error);
            else resolve(message as DerivMessage);
        };

        const timer = setTimeout(
            () => finish(new Error(`Timed out waiting for ${Object.keys(payload)[0]}`)),
            REQUEST_TIMEOUT_MS
        );

        const off = client.onMessage(message => {
            if (message.req_id !== reqId) return;
            const error = (message as Record<string, any>).error;
            if (error) finish(new Error(String(error.message ?? 'Request failed')));
            else finish(undefined, message);
        });
    });
}

function digitsFromHistory(message: DerivMessage, market: MarketSymbol): number[] {
    const payload = message as Record<string, any>;
    const history = payload.history ?? {};
    const prices: unknown[] = Array.isArray(history.prices) ? history.prices : [];

    const resolved = resolvePrecision({
        historyPipSize: payload.pip_size ?? null,
        livePipSize: null,
        activeSymbolPipSize: market.pipSize,
    });
    const decimalPlaces = resolved.resolvedDecimalPlaces;
    if (decimalPlaces === null) return [];

    const digits: number[] = [];
    prices.forEach(price => {
        const value = Number(price);
        if (!Number.isFinite(value)) return;
        try {
            digits.push(extractLastDigit(formatQuote(value, decimalPlaces)));
        } catch {
            /* skip unparseable price */
        }
    });
    return digits;
}

function scoreMarket(market: MarketSymbol, digits: number[]): MarketScan {
    const statistics = calculateStatisticsFromDigits(digits);
    const signals = computeAdaptiveSignals(digits);
    const best = [...signals].sort((a, b) => b.confidence - a.confidence)[0];

    const low = statistics.frequencies.filter(item => item.digit <= 2);
    const lowMax = low.length ? Math.max(...low.map(item => item.percentage)) : EXPECTED;
    const lowDeviation = low.length ? Math.max(...low.map(item => item.absoluteDeviation)) : 0;
    const floorScore = Math.max(0, 100 - Math.max(0, lowMax - EXPECTED) * 12 - lowDeviation * 5);
    const balanceScore = Math.max(0, 100 - Math.abs(statistics.evenPercentage - 50) * 2);
    const edgeScore = best?.recommendation === 'enter' ? best.confidence : (best?.confidence ?? 0) * 0.5;

    return {
        market,
        digits,
        statistics,
        score: Math.round(floorScore * 0.45 + balanceScore * 0.2 + edgeScore * 0.35),
        edge: best?.confidence ?? 0,
        bestRuleLabel: best?.label ?? '—',
        scannedAt: Date.now(),
    };
}

/** Scans every open volatility market and returns them ranked, best first. */
export async function scanDigitMarkets(): Promise<MarketScan[]> {
    const client = new DerivPublicWebSocketClient();
    const results: MarketScan[] = [];

    try {
        await openClient(client);
        const symbolsMessage = await request(client, { active_symbols: 'full' });
        const markets = filterDigitMarkets(
            normalizeActiveSymbols((symbolsMessage as Record<string, any>).active_symbols)
        ).filter(market => market.isOpen && !market.isSuspended);

        for (const market of markets) {
            try {
                const history = await request(client, {
                    ticks_history: market.apiSymbol,
                    end: 'latest',
                    count: SCAN_TICKS,
                    style: 'ticks',
                    subscribe: 1,
                });
                const subscriptionId = (history as Record<string, any>).subscription?.id;
                if (subscriptionId) client.send({ forget: subscriptionId });

                const digits = digitsFromHistory(history, market);
                if (digits.length < MIN_TICKS) continue;
                results.push(scoreMarket(market, digits));
            } catch {
                /* one failing market must not stop the whole scan */
            }
        }
    } finally {
        client.disconnect();
    }

    return results.sort((a, b) => b.score - a.score);
}
