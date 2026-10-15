/**
 * Orchestrates the public WebSocket, market selection and the derived analysis.
 *
 * Network concerns live here; every calculation it feeds is a pure function in
 * `statistics.ts` / `strategies.ts` / `backtest.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runBacktests } from './backtest';
import { DerivPublicWebSocketClient, type DerivMessage } from './deriv-public-ws';
import { filterDigitMarkets, groupMarkets, normalizeActiveSymbols, pickDefaultMarket } from './markets';
import { UNRESOLVED_PRECISION, extractLastDigit, formatQuote, resolvePrecision } from './precision';
import { scanDigitMarkets, type MarketScan } from './scan-markets';
import { DEFAULT_BARRIERS, calculateBarrierStats, calculateDigitStatistics, digitSequence } from './statistics';
import { computeAdaptiveSignals, computeRulePerformance } from './strategies';
import type { ConnectionState, ConnectionStatus, MarketSymbol, NormalizedTick, PrecisionState } from './types';

const MAX_TICKS = 1000;

export const ANALYSIS_WINDOWS = [20, 50, 100, 200, 500, 1000];

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
    decimalPlaces: number,
    source: 'history' | 'live'
): NormalizedTick[] {
    const ticks: NormalizedTick[] = [];
    const length = Math.min(prices.length, times.length);

    for (let index = 0; index < length; index++) {
        const quote = Number(prices[index]);
        const epoch = Number(times[index]);
        if (!Number.isFinite(quote) || !Number.isFinite(epoch)) continue;

        let formattedQuote: string;
        let lastDigit: number;
        try {
            formattedQuote = formatQuote(quote, decimalPlaces);
            lastDigit = extractLastDigit(formattedQuote);
        } catch {
            continue;
        }

        ticks.push({
            key: `${symbol}:${epoch}:${formattedQuote}`,
            apiTickId: null,
            symbol,
            epoch,
            date: new Date(epoch * 1000),
            quote,
            formattedQuote,
            lastDigit,
            source,
        });
    }

    return ticks;
}

export function useDigitsLab() {
    const [connection, setConnection] = useState<ConnectionState>(INITIAL_CONNECTION);
    const [markets, setMarkets] = useState<MarketSymbol[]>([]);
    const [selectedMarket, setSelectedMarket] = useState<MarketSymbol | null>(null);
    const [ticks, setTicks] = useState<NormalizedTick[]>([]);
    const [analysisWindow, setAnalysisWindow] = useState(100);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [precision, setPrecision] = useState<PrecisionState>(UNRESOLVED_PRECISION);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResults, setScanResults] = useState<MarketScan[]>([]);
    const [scanError, setScanError] = useState<string | null>(null);

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
    const lastHistoryKeyRef = useRef<string | null>(null);
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
            if (!client) return;

            if (!client.isOpen()) {
                setErrorMessage('Connecting to the market feed…');
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
            setErrorMessage(null);
            setIsLoadingHistory(true);

            seenKeysRef.current = new Set();
            lastHistoryKeyRef.current = null;
            precisionInputsRef.current = { history: null, live: null, active: market.pipSize };
            recomputePrecision();

            const reqId = client.send({
                ticks_history: market.apiSymbol,
                end: 'latest',
                count: MAX_TICKS,
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

    /**
     * Scans every volatility market on a separate short-lived connection and
     * ranks them by how orderly their digits are. Never touches the live feed.
     */
    const scanMarkets = useCallback(async () => {
        setIsScanning(true);
        setScanError(null);
        try {
            const results = await scanDigitMarkets();
            setScanResults(results);
            if (results.length === 0) setScanError('No volatility market returned usable ticks.');
            return results;
        } catch (error) {
            setScanError((error as Error).message || 'The market scan failed.');
            return [] as MarketScan[];
        } finally {
            setIsScanning(false);
        }
    }, []);

    const handleMessage = useCallback(
        (message: DerivMessage) => {
            const msgType = message.msg_type;
            const payload = message as Record<string, any>;

            if (msgType === 'active_symbols') {
                // The lab only offers the digit-friendly volatility families.
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
                if (!pending || pending.generation !== generationRef.current) return; // stale response
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

                const built = buildTicks(symbol, prices, times, resolved.resolvedDecimalPlaces, 'history')
                    .sort((a, b) => a.epoch - b.epoch)
                    .slice(-MAX_TICKS);

                seenKeysRef.current = new Set(built.map(tick => tick.key));
                lastHistoryKeyRef.current = built.length > 0 ? built[built.length - 1].key : null;
                setTicks(built);
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
                if (key === lastHistoryKeyRef.current) return; // immediate duplicate of the last historical tick
                if (seenKeysRef.current.has(key)) return; // repeated delivery

                seenKeysRef.current.add(key);
                const normalized: NormalizedTick = {
                    key,
                    apiTickId: typeof tick.id === 'string' ? tick.id : null,
                    symbol: current.apiSymbol,
                    epoch,
                    date: new Date(epoch * 1000),
                    quote,
                    formattedQuote,
                    lastDigit,
                    source: 'live',
                };

                setTicks(previous => [...previous, normalized].slice(-MAX_TICKS));
                return;
            }

            if (msgType === 'forget') {
                subscriptionRef.current = { id: null, symbol: null, generation: subscriptionRef.current.generation };
                return;
            }

            if (payload.error && (msgType === 'ticks_history' || msgType === 'ticks')) {
                const pending = message.req_id !== undefined ? pendingRef.current.get(message.req_id) : undefined;
                if (pending && pending.generation !== generationRef.current) return;
                if (pending) pendingRef.current.delete(message.req_id as number);
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
            // The client also emits on heartbeat metadata, so only act on a real
            // status transition — reacting to every message would re-select the
            // market and invalidate the request that is still in flight.
            if (state.status !== lastStatusRef.current) {
                lastStatusRef.current = state.status;

                if (state.status === 'connected') {
                    if (selectedRef.current) {
                        selectMarket(selectedRef.current); // refresh history + one new subscription
                    } else {
                        const reqId = client.send({ active_symbols: 'full' });
                        pendingRef.current.set(reqId, { kind: 'active-symbols', generation: generationRef.current });
                    }
                } else {
                    // Any subscription from the previous socket is gone.
                    subscriptionRef.current = { id: null, symbol: null, generation: subscriptionRef.current.generation };
                }
            }

            // Re-render only when something the UI actually shows has changed.
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

    const analysisTicks = useMemo(() => ticks.slice(-analysisWindow), [ticks, analysisWindow]);
    const digits = useMemo(() => digitSequence(analysisTicks), [analysisTicks]);
    const statistics = useMemo(() => calculateDigitStatistics(analysisTicks), [analysisTicks]);
    const barrierStats = useMemo(() => calculateBarrierStats(digits, DEFAULT_BARRIERS), [digits]);
    const rulePerformance = useMemo(() => computeRulePerformance(digits), [digits]);
    const signals = useMemo(() => computeAdaptiveSignals(digits), [digits]);
    const backtests = useMemo(() => runBacktests(digits), [digits]);
    const marketGroups = useMemo(() => groupMarkets(markets), [markets]);

    const currentTick = ticks.length > 0 ? ticks[ticks.length - 1] : null;
    const previousTick = ticks.length > 1 ? ticks[ticks.length - 2] : null;
    const direction =
        currentTick && previousTick
            ? currentTick.quote > previousTick.quote
                ? 'up'
                : currentTick.quote < previousTick.quote
                  ? 'down'
                  : 'flat'
            : 'flat';

    return {
        connection,
        markets,
        marketGroups,
        selectedMarket,
        ticks,
        analysisTicks,
        analysisWindow,
        setAnalysisWindow,
        isLoadingHistory,
        errorMessage,
        precision,
        statistics,
        barrierStats,
        rulePerformance,
        signals,
        backtests,
        currentTick,
        previousTick,
        direction,
        selectMarket,
        refreshMarkets,
        isScanning,
        scanResults,
        scanError,
        scanMarkets,
    };
}
