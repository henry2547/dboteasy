/**
 * Market data for the GUI Trading Engine.
 *
 * One public market-data socket, owned by this hook: the engine can be pointed
 * at a market different from the Digits tab, and a reconnect rebuilds the
 * rolling window from real history instead of carrying stale digits forward.
 *
 * Only public market-data messages are sent — no login, no trading.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DerivPublicWebSocketClient, type DerivMessage } from '../digits/deriv-public-ws';
import { filterDigitMarkets, normalizeActiveSymbols, pickDefaultMarket } from '../digits/markets';
import { UNRESOLVED_PRECISION, extractLastDigit, formatQuote, resolvePrecision } from '../digits/precision';
import type { ConnectionState, ConnectionStatus, MarketSymbol, PrecisionState } from '../digits/types';
import { ENGINE_WINDOW } from './config';
import { replaceWindow } from './digit-window';
import type { EngineTick } from './types';

const INITIAL_CONNECTION: ConnectionState = {
    status: 'idle',
    reconnectAttempt: 0,
    lastMessageAt: null,
    lastPingAt: null,
    lastPongAt: null,
    latencyMs: null,
    errorMessage: null,
};

interface PendingRequest {
    kind: 'active-symbols' | 'history';
    symbol?: string;
    generation: number;
}

interface PrecisionInputs {
    history: number | string | null;
    live: number | string | null;
    active: number | string | null;
}

function buildTicks(
    symbol: string,
    prices: Array<number | string>,
    times: number[],
    decimalPlaces: number
): EngineTick[] {
    const ticks: EngineTick[] = [];
    const length = Math.min(prices.length, times.length);

    for (let index = 0; index < length; index++) {
        const quote = Number(prices[index]);
        const epoch = Number(times[index]);
        if (!Number.isFinite(quote) || !Number.isFinite(epoch)) continue;

        try {
            const formattedQuote = formatQuote(quote, decimalPlaces);
            ticks.push({
                key: `${symbol}:${epoch}:${formattedQuote}`,
                symbol,
                epoch,
                quote,
                formattedQuote,
                lastDigit: extractLastDigit(formattedQuote),
            });
        } catch {
            continue;
        }
    }

    return ticks;
}

export function useEngineFeed() {
    const [connection, setConnection] = useState<ConnectionState>(INITIAL_CONNECTION);
    const [markets, setMarkets] = useState<MarketSymbol[]>([]);
    const [selectedMarket, setSelectedMarket] = useState<MarketSymbol | null>(null);
    const [ticks, setTicks] = useState<EngineTick[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [precision, setPrecision] = useState<PrecisionState>(UNRESOLVED_PRECISION);
    const [lastTickAt, setLastTickAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const clientRef = useRef<DerivPublicWebSocketClient | null>(null);
    const lastStatusRef = useRef<ConnectionStatus>('idle');
    const generationRef = useRef(0);
    const pendingRef = useRef(new Map<number, PendingRequest>());
    const subscriptionRef = useRef<{ id: string | null; symbol: string | null; generation: number }>({
        id: null,
        symbol: null,
        generation: 0,
    });
    const selectedRef = useRef<MarketSymbol | null>(null);
    const precisionInputsRef = useRef<PrecisionInputs>({ history: null, live: null, active: null });
    const precisionRef = useRef<PrecisionState>(UNRESOLVED_PRECISION);
    const seenKeysRef = useRef(new Set<string>());
    const lastKeyRef = useRef<string | null>(null);
    const autoSelectedRef = useRef(false);

    const recomputePrecision = useCallback((): PrecisionState => {
        const next = resolvePrecision({
            historyPipSize: precisionInputsRef.current.history,
            livePipSize: precisionInputsRef.current.live,
            activeSymbolPipSize: precisionInputsRef.current.active,
        });
        precisionRef.current = next;
        setPrecision(next);
        return next;
    }, []);

    const selectMarket = useCallback(
        (market: MarketSymbol) => {
            const client = clientRef.current;
            if (!client || !client.isOpen()) {
                setErrorMessage('Connecting to the market feed…');
                return;
            }
            if (!market.isOpen || market.isSuspended) {
                setErrorMessage(`${market.displayName} is not tradable right now.`);
                return;
            }

            const generation = generationRef.current + 1;
            generationRef.current = generation;

            if (subscriptionRef.current.id) {
                client.send({ forget: subscriptionRef.current.id });
            }
            subscriptionRef.current = { id: null, symbol: market.apiSymbol, generation };

            selectedRef.current = market;
            setSelectedMarket(market);
            setTicks([]);
            setLastTickAt(null);
            setErrorMessage(null);
            setIsLoadingHistory(true);

            seenKeysRef.current = new Set();
            lastKeyRef.current = null;
            precisionInputsRef.current = { history: null, live: null, active: market.pipSize };
            recomputePrecision();

            const reqId = client.send({
                ticks_history: market.apiSymbol,
                end: 'latest',
                count: ENGINE_WINDOW,
                style: 'ticks',
                subscribe: 1,
            });
            pendingRef.current.set(reqId, { kind: 'history', symbol: market.apiSymbol, generation });
        },
        [recomputePrecision]
    );

    const refreshMarkets = useCallback(() => {
        const client = clientRef.current;
        if (!client || !client.isOpen()) return;
        const reqId = client.send({ active_symbols: 'full' });
        pendingRef.current.set(reqId, { kind: 'active-symbols', generation: generationRef.current });
    }, []);

    const handleMessage = useCallback(
        (message: DerivMessage) => {
            const msgType = message.msg_type;
            const payload = message as Record<string, any>;

            if (msgType === 'active_symbols') {
                const list = filterDigitMarkets(normalizeActiveSymbols(payload.active_symbols));
                setMarkets(list);

                if (!autoSelectedRef.current && list.length > 0) {
                    autoSelectedRef.current = true;
                    const preferred = pickDefaultMarket(list);
                    if (preferred) selectMarket(preferred);
                }
                return;
            }

            if (msgType === 'history') {
                const pending = message.req_id !== undefined ? pendingRef.current.get(message.req_id) : undefined;
                if (!pending || pending.generation !== generationRef.current) return;
                pendingRef.current.delete(message.req_id as number);

                const symbol = pending.symbol as string;
                const history = payload.history ?? {};
                const prices: Array<number | string> = Array.isArray(history.prices) ? history.prices : [];
                const times: number[] = Array.isArray(history.times) ? history.times : [];

                if (payload.pip_size !== undefined) precisionInputsRef.current.history = payload.pip_size;
                const resolved = recomputePrecision();
                if (resolved.resolvedDecimalPlaces === null) {
                    setTicks([]);
                    setIsLoadingHistory(false);
                    setErrorMessage('This market does not expose a usable quote precision.');
                    return;
                }

                const built = buildTicks(symbol, prices, times, resolved.resolvedDecimalPlaces);
                seenKeysRef.current = new Set(built.map(tick => tick.key));
                lastKeyRef.current = built.length > 0 ? built[built.length - 1].key : null;
                setTicks(replaceWindow([], built));
                setLastTickAt(built.length > 0 ? built[built.length - 1].epoch * 1000 : null);
                setIsLoadingHistory(false);
                setErrorMessage(built.length === 0 ? 'No tick history available for this market.' : null);
                return;
            }

            if (msgType === 'tick') {
                if (subscriptionRef.current.generation !== generationRef.current) return;

                const current = selectedRef.current;
                const tick = payload.tick;
                if (!current || !tick || tick.symbol !== current.apiSymbol) return;

                if (payload.subscription?.id && !subscriptionRef.current.id) {
                    subscriptionRef.current = { ...subscriptionRef.current, id: payload.subscription.id };
                }

                if (tick.pip_size !== undefined && tick.pip_size !== precisionInputsRef.current.live) {
                    precisionInputsRef.current.live = tick.pip_size;
                    recomputePrecision();
                }

                const decimalPlaces = precisionRef.current.resolvedDecimalPlaces;
                if (decimalPlaces === null) return;

                const quote = Number(tick.quote);
                const epoch = Number(tick.epoch);
                if (!Number.isFinite(quote) || !Number.isFinite(epoch)) return;

                let formattedQuote: string;
                let lastDigit: number;
                try {
                    formattedQuote = formatQuote(quote, decimalPlaces);
                    lastDigit = extractLastDigit(formattedQuote);
                } catch {
                    return;
                }

                const key = `${current.apiSymbol}:${epoch}:${formattedQuote}`;
                if (key === lastKeyRef.current || seenKeysRef.current.has(key)) return;
                lastKeyRef.current = key;
                seenKeysRef.current.add(key);

                const normalized: EngineTick = {
                    key,
                    symbol: current.apiSymbol,
                    epoch,
                    quote,
                    formattedQuote,
                    lastDigit,
                };

                setTicks(previous => {
                    const next = [...previous, normalized];
                    return next.length > ENGINE_WINDOW ? next.slice(next.length - ENGINE_WINDOW) : next;
                });
                setLastTickAt(epoch * 1000);
                return;
            }

            if (msgType === 'forget') {
                subscriptionRef.current = { ...subscriptionRef.current, id: null };
                return;
            }

            if (payload.error && (msgType === 'ticks_history' || msgType === 'ticks')) {
                setIsLoadingHistory(false);
                setErrorMessage(String(payload.error.message ?? 'The market data request failed.'));
            }
        },
        [recomputePrecision, selectMarket]
    );

    useEffect(() => {
        const client = new DerivPublicWebSocketClient();
        clientRef.current = client;

        const offStatus = client.onStatus(state => {
            if (state.status !== lastStatusRef.current) {
                lastStatusRef.current = state.status;

                if (state.status === 'connected') {
                    // Reconnection rebuilds the window from real history.
                    if (selectedRef.current) {
                        selectMarket(selectedRef.current);
                    } else {
                        const reqId = client.send({ active_symbols: 'full' });
                        pendingRef.current.set(reqId, {
                            kind: 'active-symbols',
                            generation: generationRef.current,
                        });
                    }
                } else {
                    subscriptionRef.current = {
                        id: null,
                        symbol: null,
                        generation: subscriptionRef.current.generation,
                    };
                }
            }

            setConnection(previous =>
                previous.status === state.status &&
                previous.errorMessage === state.errorMessage &&
                previous.latencyMs === state.latencyMs &&
                previous.reconnectAttempt === state.reconnectAttempt
                    ? previous
                    : state
            );
        });

        const offMessage = client.onMessage(handleMessage);
        client.connect();

        return () => {
            offStatus();
            offMessage();
            client.disconnect();
            clientRef.current = null;
        };
    }, [handleMessage, selectMarket]);

    // Freshness re-read: a quiet feed must be able to go stale without a tick.
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 2000);
        return () => clearInterval(timer);
    }, []);

    const averageInterval = useMemo(() => {
        if (ticks.length < 3) return 1000;
        const tail = ticks.slice(-20);
        const span = tail[tail.length - 1].epoch - tail[0].epoch;
        if (span <= 0) return 1000;
        return (span / (tail.length - 1)) * 1000;
    }, [ticks]);

    const isDataFresh = Boolean(
        connection.status === 'connected' &&
            lastTickAt !== null &&
            now - lastTickAt <= Math.max(15000, averageInterval * 4)
    );

    return {
        connection,
        markets,
        selectedMarket,
        selectMarket,
        ticks,
        isHistoryLoading: isLoadingHistory,
        errorMessage,
        precision,
        lastTickAt,
        isDataFresh,
        windowFull: ticks.length >= ENGINE_WINDOW,
        refreshMarkets,
        currentDigit: ticks.length > 0 ? ticks[ticks.length - 1].lastDigit : null,
        previousDigit: ticks.length > 1 ? ticks[ticks.length - 2].lastDigit : null,
    };
}
