/**
 * One public market-data feed for the Rise/Fall engine.
 *
 * Genuine Deriv ticks only: 1,000 historical ticks (`subscribe: 1`, the shape the
 * Options public socket requires) followed by the live stream on the same
 * subscription. It never sends an authenticated or trading message and it never
 * fabricates a tick: duplicates are dropped, gaps and stale feeds are reported,
 * and the engine refuses new entries while the feed is unhealthy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DerivPublicWebSocketClient, type DerivMessage } from '@/features/digits/deriv-public-ws';
import { filterDigitMarkets, normalizeActiveSymbols, pickDefaultMarket } from '@/features/digits/markets';
import { decimalsFromTickPipSize } from '@/features/digits/precision';
import type { ConnectionState, MarketSymbol } from '@/features/digits/types';
import type { MarketIntegrity, Tick } from './types';

const MAX_TICKS = 1000;

/** A feed with no tick for this long is stale, and the engine stops entering. */
export const STALE_FEED_MS = 8_000;

/** A jump larger than this many seconds between consecutive ticks is a gap. */
const GAP_THRESHOLD_S = 5;

/** New entries stay blocked for this long after the newest gap. */
const GAP_BLOCK_MS = 30_000;

const INITIAL_CONNECTION: ConnectionState = {
    status: 'idle',
    reconnectAttempt: 0,
    lastMessageAt: null,
    lastPingAt: null,
    lastPongAt: null,
    latencyMs: null,
    errorMessage: null,
};

type PendingKind = 'active-symbols' | 'history';

interface PendingRequest {
    kind: PendingKind;
    symbol?: string;
    generation: number;
}

export interface TickFeed {
    ticks: Tick[];
    market: MarketSymbol | null;
    markets: MarketSymbol[];
    connection: ConnectionState;
    decimalPlaces: number | null;
    integrity: MarketIntegrity;
    loading: boolean;
    error: string | null;
    selectMarket: (symbol: string) => void;
    refreshMarkets: () => void;
}

function emptyIntegrity(): MarketIntegrity {
    return { healthy: false, issue: 'Waiting for the market feed.', gaps: 0, duplicates: 0, lastTickAgeMs: null, ticksAvailable: 0 };
}

export function useTickFeed(enabled: boolean): TickFeed {
    const clientRef = useRef<DerivPublicWebSocketClient | null>(null);
    const generationRef = useRef(0);
    const pendingRef = useRef(new Map<number, PendingRequest>());
    const marketRef = useRef<MarketSymbol | null>(null);
    const marketsRef = useRef<MarketSymbol[]>([]);
    const seenRef = useRef(new Set<string>());
    const gapsRef = useRef(0);
    const lastGapAtRef = useRef<number | null>(null);
    const duplicatesRef = useRef(0);
    const lastStatusRef = useRef<string>('idle');
    const selectMarketRef = useRef<(symbol: string) => void>(() => undefined);

    const [markets, setMarkets] = useState<MarketSymbol[]>([]);
    const [market, setMarket] = useState<MarketSymbol | null>(null);
    const [ticks, setTicks] = useState<Tick[]>([]);
    const [connection, setConnection] = useState<ConnectionState>(INITIAL_CONNECTION);
    const [decimalPlaces, setDecimalPlaces] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const selectMarket = useCallback((symbol: string) => {
        const client = clientRef.current;
        const target = marketsRef.current.find(item => item.apiSymbol === symbol) ?? null;
        if (!client || !target) return;

        generationRef.current += 1;
        const generation = generationRef.current;
        marketRef.current = target;
        setMarket(target);
        setTicks([]);
        setLoading(true);
        setError(null);
        seenRef.current = new Set();
        gapsRef.current = 0;
        lastGapAtRef.current = null;
        duplicatesRef.current = 0;

        if (target.decimalPlaces !== null) setDecimalPlaces(target.decimalPlaces);

        const reqId = client.send({
            ticks_history: target.apiSymbol,
            end: 'latest',
            count: MAX_TICKS,
            style: 'ticks',
            subscribe: 1,
        });
        pendingRef.current.set(reqId, { kind: 'history', symbol: target.apiSymbol, generation });
    }, []);

    const refreshMarkets = useCallback(() => {
        const client = clientRef.current;
        if (!client || !client.isOpen()) return;
        const reqId = client.send({ active_symbols: 'full' });
        pendingRef.current.set(reqId, { kind: 'active-symbols', generation: generationRef.current });
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const client = new DerivPublicWebSocketClient();
        clientRef.current = client;

        const offStatus = client.onStatus(state => {
            // The client also reports heartbeat metadata; only react to real transitions.
            if (state.status === lastStatusRef.current) return;
            lastStatusRef.current = state.status;
            setConnection(state);

            if (state.status === 'connected') {
                // A dropped socket loses its subscriptions, so a reconnect both
                // backfills the history and re-subscribes to the tick stream.
                const current = marketRef.current;
                if (current) {
                    selectMarketRef.current?.(current.apiSymbol);
                } else {
                    const reqId = client.send({ active_symbols: 'full' });
                    pendingRef.current.set(reqId, { kind: 'active-symbols', generation: generationRef.current });
                }
            }
        });

        const offMessage = client.onMessage((message: DerivMessage) => {
            const payload = message as Record<string, any>;
            const msgType = payload.msg_type;

            if (msgType === 'active_symbols') {
                const list = normalizeActiveSymbols(payload.active_symbols);
                if (list.length === 0) return;
                const eligible = filterDigitMarkets(list);
                const usable = eligible.length > 0 ? eligible : list;
                marketsRef.current = usable;
                setMarkets(usable);

                if (!marketRef.current) {
                    const preferred = pickDefaultMarket(usable);
                    if (preferred) {
                        // Defer so the state from this render is in place before the request.
                        setTimeout(() => selectMarketRef.current?.(preferred.apiSymbol), 0);
                    }
                }
                return;
            }

            if (msgType === 'history') {
                const pending = message.req_id !== undefined ? pendingRef.current.get(message.req_id) : undefined;
                if (!pending || pending.generation !== generationRef.current) return;
                pendingRef.current.delete(message.req_id as number);

                const history = payload.history ?? {};
                const prices: Array<number | string> = Array.isArray(history.prices) ? history.prices : [];
                const times: number[] = Array.isArray(history.times) ? history.times : [];

                const requested = pending.symbol as string;
                if (requested !== marketRef.current?.apiSymbol) return;

                const places = decimalsFromTickPipSize(payload.pip_size);
                if (places !== null) setDecimalPlaces(places);

                const built: Tick[] = [];
                const count = Math.min(prices.length, times.length);
                for (let index = 0; index < count; index += 1) {
                    const quote = Number(prices[index]);
                    const epoch = Number(times[index]);
                    if (!Number.isFinite(quote) || !Number.isFinite(epoch)) continue;
                    const key = `${requested}:${epoch}:${quote}`;
                    if (seenRef.current.has(key)) continue;
                    seenRef.current.add(key);
                    built.push({ epoch, quote });
                }
                built.sort((a, b) => a.epoch - b.epoch);

                setTicks(built.slice(-MAX_TICKS));
                setLoading(false);
                setError(built.length === 0 ? 'No tick history is available for this market.' : null);
                return;
            }

            if (msgType === 'tick') {
                const current = marketRef.current;
                const tick = payload.tick;
                if (!current || !tick || tick.symbol !== current.apiSymbol) return;

                const quote = Number(tick.quote);
                const epoch = Number(tick.epoch);
                if (!Number.isFinite(quote) || !Number.isFinite(epoch)) return;

                const places = decimalsFromTickPipSize(tick.pip_size);
                if (places !== null) setDecimalPlaces(places);

                const key = `${current.apiSymbol}:${epoch}:${quote}`;
                if (seenRef.current.has(key)) {
                    duplicatesRef.current += 1;
                    return;
                }
                seenRef.current.add(key);

                setTicks(previous => {
                    const last = previous[previous.length - 1];
                    if (last && epoch > last.epoch && epoch - last.epoch > GAP_THRESHOLD_S) {
                        gapsRef.current += 1;
                        lastGapAtRef.current = Date.now();
                    }
                    return [...previous, { epoch, quote }].slice(-MAX_TICKS);
                });
                return;
            }

            if (payload.error && (msgType === 'ticks_history' || msgType === 'ticks' || msgType === 'active_symbols')) {
                setLoading(false);
                setError(String(payload.error.message ?? 'The market data request failed.'));
            }
        });

        client.connect();

        return () => {
            offStatus();
            offMessage();
            client.disconnect();
            clientRef.current = null;
            pendingRef.current.clear();
            // The next open re-reads the market list and re-subscribes from scratch.
            marketRef.current = null;
            marketsRef.current = [];
            seenRef.current = new Set();
        };
        // `selectMarket` is read through a ref below so re-creating the socket on
        // every market list change cannot happen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    // Keeps the socket effect's deferred default-market pick pointing at the
    // latest selector without re-opening the connection.
    useEffect(() => {
        selectMarketRef.current = selectMarket;
    }, [selectMarket]);

    useEffect(() => {
        if (!enabled) return;
        const timer = setInterval(() => setNow(Date.now()), 2_000);
        return () => clearInterval(timer);
    }, [enabled]);

    const integrity = useMemo<MarketIntegrity>(() => {
        if (!enabled) return emptyIntegrity();
        const last = ticks[ticks.length - 1];
        const lastTickAgeMs = last ? Math.max(0, now - last.epoch * 1000) : null;

        let healthy = true;
        let issue: string | null = null;

        if (connection.status !== 'connected') {
            healthy = false;
            issue = 'The market feed is disconnected — new entries are blocked.';
        } else if (ticks.length === 0) {
            healthy = false;
            issue = lastTickAgeMs === null ? 'Waiting for the first tick.' : 'Waiting for the first tick.';
        } else if (lastTickAgeMs !== null && lastTickAgeMs > STALE_FEED_MS) {
            healthy = false;
            issue = `The market feed is stale (${Math.round(lastTickAgeMs / 1000)}s since the last tick) — new entries are blocked.`;
        } else if (lastGapAtRef.current !== null && now - lastGapAtRef.current < GAP_BLOCK_MS) {
            healthy = false;
            issue = `${gapsRef.current} gap(s) in the tick stream — waiting for a clean stretch before entering.`;
        }

        return {
            healthy,
            issue,
            gaps: gapsRef.current,
            duplicates: duplicatesRef.current,
            lastTickAgeMs,
            ticksAvailable: ticks.length,
        };
    }, [enabled, ticks, now, connection.status]);

    return {
        ticks,
        market,
        markets,
        connection,
        decimalPlaces,
        integrity,
        loading,
        error,
        selectMarket,
        refreshMarkets,
    };
}
