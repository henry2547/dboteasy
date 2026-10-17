/**
 * Scanner market-data service.
 *
 * A multi-market wrapper around the existing `DerivPublicWebSocketClient` (the
 * same public, read-only socket the Digits Lab uses). It discovers eligible
 * markets dynamically via `active_symbols`, then streams ticks for every
 * eligible Volatility / 1-Second Volatility index and keeps a rolling window of
 * the most recent digits per market for the analysis engine.
 *
 * It sends ONLY public market-data messages. Authenticated account operations
 * happen on the separate `api_base` socket via the execution service.
 */

import { DerivPublicWebSocketClient, type DerivMessage } from '../digits/deriv-public-ws';
import { decimalsFromTickPipSize, extractLastDigit, formatQuote, resolvePrecision } from '../digits/precision';
import { normalizeActiveSymbols } from '../digits/markets';
import type { ConnectionState, MarketSymbol, NormalizedTick } from '../digits/types';

export interface MarketFeed {
    market: MarketSymbol;
    ticks: NormalizedTick[];
    lastTickEpoch: number | null;
    decimalPlaces: number | null;
}

export interface ScannerMarketServiceOptions {
    windowSize: number;
    onMarkets: (markets: MarketSymbol[]) => void;
    onConnection: (state: ConnectionState) => void;
    onTick: (symbol: string) => void;
}

const ELIGIBLE_CATEGORIES = new Set(['Volatility Indices', '1-Second Volatility Indices']);

export class ScannerMarketService {
    private client: DerivPublicWebSocketClient;
    private readonly opts: ScannerMarketServiceOptions;
    private markets: MarketSymbol[] = [];
    private feeds = new Map<string, MarketFeed>();
    private pending = new Map<number, string>(); // req_id -> symbol (history requests)
    private lastStatus: string = 'idle';

    constructor(opts: ScannerMarketServiceOptions) {
        this.opts = opts;
        this.client = new DerivPublicWebSocketClient();
    }

    getConnection(): ConnectionState {
        return this.client.getState();
    }

    getMarkets(): MarketSymbol[] {
        return this.markets;
    }

    getFeed(symbol: string): MarketFeed | undefined {
        return this.feeds.get(symbol);
    }

    getAllFeeds(): MarketFeed[] {
        return [...this.feeds.values()];
    }

    start(): void {
        this.client.onStatus(state => {
            if (state.status !== this.lastStatus) {
                this.lastStatus = state.status;
                this.opts.onConnection(state);
                if (state.status === 'connected') {
                    this.requestActiveSymbols();
                } else {
                    // Subscriptions are gone; clear pending so a reconnect re-requests cleanly.
                    this.pending.clear();
                }
            }
        });
        this.client.onMessage(message => this.handleMessage(message));
        this.client.connect();
    }

    stop(): void {
        this.client.disconnect();
        this.feeds.clear();
        this.pending.clear();
    }

    refreshMarkets(): void {
        if (this.client.isOpen()) this.requestActiveSymbols();
    }

    /** Re-subscribes all eligible markets (e.g. after the window size changes). */
    resubscribe(): void {
        if (!this.client.isOpen()) return;
        this.feeds.forEach(feed => {
            if (feed.market.availability === 'available') this.requestHistory(feed.market);
        });
    }

    private requestActiveSymbols(): void {
        const reqId = this.client.send({ active_symbols: 'full' });
        this.pending.set(reqId, '__symbols__');
    }

    private requestHistory(market: MarketSymbol): void {
        const reqId = this.client.send({
            ticks_history: market.apiSymbol,
            end: 'latest',
            count: this.opts.windowSize,
            style: 'ticks',
            subscribe: 1,
        });
        this.pending.set(reqId, market.apiSymbol);

        if (!this.feeds.has(market.apiSymbol)) {
            this.feeds.set(market.apiSymbol, {
                market,
                ticks: [],
                lastTickEpoch: null,
                decimalPlaces: market.decimalPlaces,
            });
        }
    }

    private handleMessage(message: DerivMessage): void {
        const msgType = message.msg_type;
        const payload = message as Record<string, any>;

        if (msgType === 'active_symbols') {
            const all = normalizeActiveSymbols(payload.active_symbols);
            this.markets = all.filter(m => ELIGIBLE_CATEGORIES.has(m.category));
            this.opts.onMarkets(this.markets);
            // Subscribe to every eligible, available market.
            this.markets.forEach(market => {
                if (market.availability === 'available') this.requestHistory(market);
            });
            return;
        }

        if (msgType === 'history') {
            const symbol = this.pending.get(message.req_id as number);
            if (!symbol || symbol === '__symbols__') return;
            this.pending.delete(message.req_id as number);

            const feed = this.feeds.get(symbol);
            if (!feed) return;

            const history = payload.history ?? {};
            const prices: Array<number | string> = Array.isArray(history.prices) ? history.prices : [];
            const times: number[] = Array.isArray(history.times) ? history.times : [];

            const decimalPlaces =
                decimalsFromTickPipSize(payload.pip_size) ?? feed.decimalPlaces ?? feed.market.decimalPlaces;
            feed.decimalPlaces = decimalPlaces;

            const ticks: NormalizedTick[] = [];
            const length = Math.min(prices.length, times.length);
            for (let index = 0; index < length; index++) {
                const quote = Number(prices[index]);
                const epoch = Number(times[index]);
                if (!Number.isFinite(quote) || !Number.isFinite(epoch) || feed.decimalPlaces === null) continue;
                try {
                    const formatted = formatQuote(quote, feed.decimalPlaces);
                    ticks.push({
                        key: `${symbol}:${epoch}:${formatted}`,
                        apiTickId: null,
                        symbol,
                        epoch,
                        date: new Date(epoch * 1000),
                        quote,
                        formattedQuote: formatted,
                        lastDigit: extractLastDigit(formatted),
                        source: 'history',
                    });
                } catch {
                    continue;
                }
            }

            feed.ticks = ticks.slice(-this.opts.windowSize);
            feed.lastTickEpoch = feed.ticks.length > 0 ? feed.ticks[feed.ticks.length - 1].epoch : null;
            this.opts.onTick(symbol);
            return;
        }

        if (msgType === 'tick') {
            const tick = payload.tick;
            if (!tick?.symbol) return;
            const feed = this.feeds.get(tick.symbol);
            if (!feed) return;

            if (payload.pip_size !== undefined) {
                const dp = decimalsFromTickPipSize(payload.pip_size);
                if (dp !== null) feed.decimalPlaces = dp;
            }
            if (feed.decimalPlaces === null) return;

            const quote = Number(tick.quote);
            const epoch = Number(tick.epoch);
            if (!Number.isFinite(quote) || !Number.isFinite(epoch)) return;

            let formatted: string;
            let lastDigit: number;
            try {
                formatted = formatQuote(quote, feed.decimalPlaces);
                lastDigit = extractLastDigit(formatted);
            } catch {
                return;
            }

            const key = `${tick.symbol}:${epoch}:${formatted}`;
            if (feed.ticks.length > 0 && feed.ticks[feed.ticks.length - 1].key === key) return; // duplicate

            feed.ticks.push({
                key,
                apiTickId: typeof tick.id === 'string' ? tick.id : null,
                symbol: tick.symbol,
                epoch,
                date: new Date(epoch * 1000),
                quote,
                formattedQuote: formatted,
                lastDigit,
                source: 'live',
            });
            if (feed.ticks.length > this.opts.windowSize) {
                feed.ticks = feed.ticks.slice(-this.opts.windowSize);
            }
            feed.lastTickEpoch = epoch;
            this.opts.onTick(tick.symbol);
            return;
        }

        if (payload.error && (msgType === 'ticks_history' || msgType === 'ticks')) {
            this.pending.delete(message.req_id as number);
        }
    }
}
