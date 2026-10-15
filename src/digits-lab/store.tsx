/**
 * Deriv Digits Analysis Lab — React Context Store
 *
 * Central state management using React context + hooks.
 * Manages WebSocket connection, market selection, tick data,
 * statistics, and strategy results.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DerivPublicWebSocketClient } from './websocket-client';
import { normalizeActiveSymbols } from './market-classification';
import {
    appendTickFIFO,
    calculateStatistics,
    evaluateBarrierStrategies,
    evaluateEvenOddStrategy,
    getDigitCirclePercentages,
    isDuplicateTick,
    normalizeTick,
    observeBarriers,
    resolvePrecision,
} from './domain';
import {
    ANALYSIS_WINDOWS,
    HISTORY_COUNT,
} from './constants';
import type {
    AnalysisWindow,
    BarrierObservation,
    ConnectionState,
    DigitStatistics,
    MarketSymbol,
    NormalizedTick,
    PrecisionState,
    StrategyResult,
} from './types';

interface DigitsLabContextValue {
    connection: ConnectionState;
    markets: MarketSymbol[];
    marketsLoading: boolean;
    marketsError: string | null;
    selectedMarket: MarketSymbol | null;
    isSwitching: boolean;
    ticks: NormalizedTick[];
    analysisWindow: AnalysisWindow;
    statistics: DigitStatistics;
    precision: PrecisionState;
    barrierStrategies: StrategyResult[];
    evenOddStrategies: StrategyResult[];
    barrierObservations: BarrierObservation[];
    digitCirclePercentages: number[];
    selectMarket: (market: MarketSymbol) => void;
    setAnalysisWindow: (window: AnalysisWindow) => void;
    selectMarketBySymbol: (symbol: string) => void;
}

const defaultStatistics: DigitStatistics = {
    sampleSize: 0,
    frequencies: [],
    mostFrequentDigits: [],
    leastFrequentDigits: [],
    evenCount: 0,
    oddCount: 0,
    evenPercentage: 0,
    oddPercentage: 0,
    lowCount: 0,
    highCount: 0,
    lowPercentage: 0,
    highPercentage: 0,
    averageDigit: null,
    currentStreak: null,
    longestStreak: null,
};

const defaultPrecision: PrecisionState = {
    activeSymbolPipIncrement: null,
    historyDecimalPlaces: null,
    liveDecimalPlaces: null,
    resolvedDecimalPlaces: null,
    source: 'unresolved',
};

const DigitsLabContext = createContext<DigitsLabContextValue | null>(null);

export function useDigitsLab(): DigitsLabContextValue {
    const ctx = useContext(DigitsLabContext);
    if (!ctx) throw new Error('useDigitsLab must be used within DigitsLabProvider');
    return ctx;
}

export function DigitsLabProvider({ children }: { children: React.ReactNode }) {
    const clientRef = useRef<DerivPublicWebSocketClient | null>(null);
    const marketGenerationRef = useRef(0);
    const subscriptionIdRef = useRef<string | null>(null);
    const precisionRef = useRef<PrecisionState>(defaultPrecision);

    const [connection, setConnection] = useState<ConnectionState>({
        status: 'idle',
        reconnectAttempt: 0,
        lastMessageAt: null,
        latencyMs: null,
        errorMessage: null,
    });
    const [markets, setMarkets] = useState<MarketSymbol[]>([]);
    const [marketsLoading, setMarketsLoading] = useState(false);
    const [marketsError, setMarketsError] = useState<string | null>(null);
    const [selectedMarket, setSelectedMarket] = useState<MarketSymbol | null>(null);
    const [isSwitching, setIsSwitching] = useState(false);
    const [ticks, setTicks] = useState<NormalizedTick[]>([]);
    const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow>(100);
    const [precision, setPrecision] = useState<PrecisionState>(defaultPrecision);

    // Initialize WebSocket connection
    useEffect(() => {
        const client = new DerivPublicWebSocketClient();
        clientRef.current = client;

        client.onStatus((state) => setConnection(state));

        client.onMessage((data) => {
            if (data.msg_type === 'active_symbols' && data.active_symbols) {
                const normalized = normalizeActiveSymbols(data.active_symbols);
                setMarkets(normalized);
                setMarketsLoading(false);
                // Auto-select first available volatility index
                if (!selectedMarket && normalized.length > 0) {
                    const firstVol = normalized.find(
                        (m) => m.category.includes('Volatility') && m.availability === 'available'
                    );
                    const target = firstVol ?? normalized.find((m) => m.availability === 'available') ?? normalized[0];
                    if (target) selectMarketInternal(target);
                }
            }

            if (data.msg_type === 'history' && data.history) {
                const gen = data.req_id ? getGenerationFromReqId(data.req_id) : marketGenerationRef.current;
                if (gen !== marketGenerationRef.current) return; // stale response

                const prices = data.history.prices as (number | string)[];
                const times = data.history.times as number[];

                if (!Array.isArray(prices) || !Array.isArray(times) || prices.length !== times.length) return;

                // Update precision from history pip_size
                if (data.pip_size != null) {
                    precisionRef.current = {
                        ...precisionRef.current,
                        historyDecimalPlaces: Number(data.pip_size),
                    };
                    const resolved = resolvePrecision(precisionRef.current);
                    precisionRef.current = resolved;
                    setPrecision(resolved);
                }

                const decimals = precisionRef.current.resolvedDecimalPlaces;
                if (decimals == null) return;

                const normalizedTicks = prices.map((price, i) =>
                    normalizeTick(price, times[i], selectedMarket?.apiSymbol ?? '', decimals, 'history')
                );

                setTicks(normalizedTicks.slice(-HISTORY_COUNT));
                setIsSwitching(false);

                // Start live subscription
                startLiveSubscription();
            }

            if (data.msg_type === 'tick' && data.tick) {
                const tick = data.tick;
                if (tick.symbol !== selectedMarket?.apiSymbol) return;

                const gen = data.req_id ? getGenerationFromReqId(data.req_id) : marketGenerationRef.current;
                if (gen !== marketGenerationRef.current) return;

                // Store subscription ID
                if (data.subscription?.id) {
                    subscriptionIdRef.current = data.subscription.id;
                }

                // Update precision from live tick
                if (tick.pip_size != null) {
                    precisionRef.current = {
                        ...precisionRef.current,
                        liveDecimalPlaces: Number(tick.pip_size),
                    };
                    const resolved = resolvePrecision(precisionRef.current);
                    precisionRef.current = resolved;
                    setPrecision(resolved);
                }

                const decimals = precisionRef.current.resolvedDecimalPlaces;
                if (decimals == null) return;

                const normalizedTick = normalizeTick(
                    tick.quote,
                    tick.epoch,
                    tick.symbol,
                    decimals,
                    'live',
                    tick.id
                );

                setTicks((prev) => {
                    if (isDuplicateTick(prev, normalizedTick)) return prev;
                    return appendTickFIFO(prev, normalizedTick);
                });
            }
        });

        client.connect();
        setMarketsLoading(true);

        // Request active symbols after connection
        const checkAndRequest = setInterval(() => {
            if (client.isConnected) {
                clearInterval(checkAndRequest);
                client
                    .send({ active_symbols: 'full' }, 'active-symbols')
                    .catch((err) => {
                        setMarketsError(err.message);
                        setMarketsLoading(false);
                    });
            }
        }, 500);

        return () => {
            clearInterval(checkAndRequest);
            forgetSubscription();
            client.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getGenerationFromReqId = (reqId: number): number => {
        // We encode generation in the upper bits of req_id for simplicity
        // Actually, we track generation separately via ref
        return marketGenerationRef.current;
    };

    const forgetSubscription = useCallback(() => {
        const client = clientRef.current;
        if (client && subscriptionIdRef.current) {
            client.sendRaw({ forget: subscriptionIdRef.current });
        }
        subscriptionIdRef.current = null;
    }, []);

    const startLiveSubscription = useCallback(() => {
        const client = clientRef.current;
        if (!client || !client.isConnected || !selectedMarket) return;

        const gen = marketGenerationRef.current;
        client
            .send({ ticks: selectedMarket.apiSymbol, subscribe: 1 }, 'live-ticks')
            .catch((err) => console.error('Live subscription failed:', err));
    }, [selectedMarket]);

    const requestHistory = useCallback(
        (market: MarketSymbol, gen: number) => {
            const client = clientRef.current;
            if (!client || !client.isConnected) return;

            // Set precision from active symbol pip_size
            if (market.pipSize != null) {
                precisionRef.current = {
                    ...precisionRef.current,
                    activeSymbolPipIncrement: market.pipSize,
                    historyDecimalPlaces: null,
                    liveDecimalPlaces: null,
                };
                const resolved = resolvePrecision(precisionRef.current);
                precisionRef.current = resolved;
                setPrecision(resolved);
            }

            client
                .send(
                    {
                        ticks_history: market.apiSymbol,
                        end: 'latest',
                        count: HISTORY_COUNT,
                        style: 'ticks',
                        subscribe: 0,
                    },
                    'history'
                )
                .catch((err) => {
                    console.error('History request failed:', err);
                    setIsSwitching(false);
                });
        },
        []
    );

    const selectMarketInternal = useCallback(
        (market: MarketSymbol) => {
            marketGenerationRef.current++;
            const gen = marketGenerationRef.current;

            setIsSwitching(true);
            forgetSubscription();
            setTicks([]);
            precisionRef.current = {
                activeSymbolPipIncrement: market.pipSize ?? null,
                historyDecimalPlaces: null,
                liveDecimalPlaces: null,
                resolvedDecimalPlaces: null,
                source: 'unresolved',
            };
            setPrecision(precisionRef.current);
            setSelectedMarket(market);

            // Request history after a brief delay to allow state to settle
            setTimeout(() => {
                requestHistory(market, gen);
            }, 100);
        },
        [forgetSubscription, requestHistory]
    );

    const selectMarket = useCallback(
        (market: MarketSymbol) => {
            selectMarketInternal(market);
        },
        [selectMarketInternal]
    );

    const selectMarketBySymbol = useCallback(
        (symbol: string) => {
            const market = markets.find((m) => m.apiSymbol === symbol);
            if (market) selectMarketInternal(market);
        },
        [markets, selectMarketInternal]
    );

    // Derived data
    const analysisTicks = ticks.slice(-analysisWindow);
    const statistics = calculateStatistics(analysisTicks);
    const barrierStrategies = evaluateBarrierStrategies(analysisTicks);
    const evenOddStrategies = evaluateEvenOddStrategy(analysisTicks);
    const digitCirclePercentages = getDigitCirclePercentages(analysisTicks);
    const barrierObs = React.useMemo(
        () => observeBarriers(analysisTicks),
        [analysisTicks]
    );

    const value: DigitsLabContextValue = {
        connection,
        markets,
        marketsLoading,
        marketsError,
        selectedMarket,
        isSwitching,
        ticks: analysisTicks,
        analysisWindow,
        statistics,
        precision,
        barrierStrategies,
        evenOddStrategies,
        barrierObservations: barrierObs,
        digitCirclePercentages,
        selectMarket,
        setAnalysisWindow,
        selectMarketBySymbol,
    };

    return <DigitsLabContext.Provider value={value}>{children}</DigitsLabContext.Provider>;
}
