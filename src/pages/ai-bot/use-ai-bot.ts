/**
 * React hook that owns the BotEngine singleton and exposes its state.
 * Persists settings, strategies, and scanner config to localStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthInfo } from '@/external/deriv-core';
import { BotEngine, createBotEngineState, type BotEngineState } from './bot-engine';
import { DEFAULT_SCANNER_CONFIG, DEFAULT_SETTINGS, DEFAULT_STRATEGIES, STORAGE_KEYS } from './constants';
import type { ScannerConfig, StrategyConfig, TradingSettings } from './types';

function loadSettings(): TradingSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.settings);
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
        /* ignore */
    }
    return DEFAULT_SETTINGS;
}

function loadStrategies(): StrategyConfig[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.strategies);
        if (raw) return JSON.parse(raw);
    } catch {
        /* ignore */
    }
    return DEFAULT_STRATEGIES;
}

function loadScannerConfig(): ScannerConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.scannerConfig);
        if (raw) return { ...DEFAULT_SCANNER_CONFIG, ...JSON.parse(raw) };
    } catch {
        /* ignore */
    }
    return DEFAULT_SCANNER_CONFIG;
}

export interface UseAiBot {
    state: BotEngineState;
    settings: TradingSettings;
    strategies: StrategyConfig[];
    scannerConfig: ScannerConfig;
    updateSettings: (settings: TradingSettings) => void;
    updateStrategies: (strategies: StrategyConfig[]) => void;
    updateScannerConfig: (config: ScannerConfig) => void;
    connectAuth: () => void;
    disconnectAuth: () => void;
    selectAccount: (loginid: string) => void;
    startBot: () => void;
    stopBot: () => void;
    pauseBot: () => void;
    resumeBot: () => void;
    runScanNow: () => void;
}

export function useAiBot(): UseAiBot {
    // Seeded with the engine's own starting state so the first render (which
    // happens before the mount effect creates the engine) has a valid snapshot.
    const [state, setState] = useState<BotEngineState>(createBotEngineState);
    const [settings, setSettings] = useState<TradingSettings>(loadSettings);
    const [strategies, setStrategies] = useState<StrategyConfig[]>(loadStrategies);
    const [scannerConfig, setScannerConfig] = useState<ScannerConfig>(loadScannerConfig);
    const engineRef = useRef<BotEngine | null>(null);

    // Create the engine once.
    useEffect(() => {
        const engine = new BotEngine(settings, strategies, scannerConfig);
        engineRef.current = engine;

        const unsub = engine.subscribe(setState);

        return () => {
            unsub();
            engine.destroy();
            engineRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-connect the authenticated WebSocket when the user is already logged
    // in (OAuth login is a full page redirect, so the token is in localStorage
    // by the time this mounts). Also react to login/logout in other tabs via
    // the storage event so the auth status stays in sync without a manual click.
    useEffect(() => {
        const syncAuth = () => {
            const engine = engineRef.current;
            if (!engine) return;
            const authInfo = getAuthInfo();
            if (authInfo?.access_token) {
                engine.connectAuth();
            } else {
                engine.disconnectAuth();
            }
        };

        // Connect immediately if already logged in.
        syncAuth();

        const onStorage = (e: StorageEvent) => {
            if (e.key === 'auth_info' || e.key === 'active_loginid') {
                syncAuth();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateSettings = useCallback((next: TradingSettings) => {
        setSettings(next);
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
        engineRef.current?.updateSettings(next);
    }, []);

    const updateStrategies = useCallback((next: StrategyConfig[]) => {
        setStrategies(next);
        localStorage.setItem(STORAGE_KEYS.strategies, JSON.stringify(next));
        engineRef.current?.updateStrategies(next);
    }, []);

    const updateScannerConfig = useCallback((next: ScannerConfig) => {
        setScannerConfig(next);
        localStorage.setItem(STORAGE_KEYS.scannerConfig, JSON.stringify(next));
        engineRef.current?.updateScannerConfig(next);
    }, []);

    const connectAuth = useCallback(() => {
        engineRef.current?.connectAuth();
    }, []);

    const disconnectAuth = useCallback(() => {
        engineRef.current?.disconnectAuth();
    }, []);

    const selectAccount = useCallback((loginid: string) => {
        engineRef.current?.selectAccount(loginid);
    }, []);

    const startBot = useCallback(() => {
        engineRef.current?.start();
    }, []);

    const stopBot = useCallback(() => {
        engineRef.current?.stop();
    }, []);

    const pauseBot = useCallback(() => {
        engineRef.current?.pause();
    }, []);

    const resumeBot = useCallback(() => {
        engineRef.current?.resume();
    }, []);

    const runScanNow = useCallback(() => {
        // One-off scan cycle; works whether the bot is running or stopped.
        engineRef.current?.scanNow();
    }, []);

    return {
        state,
        settings,
        strategies,
        scannerConfig,
        updateSettings,
        updateStrategies,
        updateScannerConfig,
        connectAuth,
        disconnectAuth,
        selectAccount,
        startBot,
        stopBot,
        pauseBot,
        resumeBot,
        runScanNow,
    };
}
