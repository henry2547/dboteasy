/**
 * React hook that owns the BotEngine singleton and exposes its state.
 * Persists settings, strategies, and scanner config to localStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BotEngine, type BotEngineState } from './bot-engine';
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
    startBot: () => void;
    stopBot: () => void;
    pauseBot: () => void;
    resumeBot: () => void;
    runScanNow: () => void;
}

export function useAiBot(): UseAiBot {
    const [state, setState] = useState<BotEngineState | null>(null);
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
        // The engine's runScan is private; we trigger it by calling start if not running,
        // or by updating the state to re-scan. For a manual scan, we use a small trick:
        // if the bot is running, the interval handles it; if stopped, we do a one-off scan.
        // We expose this via a lightweight public method on the engine.
        engineRef.current?.scanNow();
    }, []);

    return {
        state: state ?? engineRef.current?.getState() ?? ({} as BotEngineState),
        settings,
        strategies,
        scannerConfig,
        updateSettings,
        updateStrategies,
        updateScannerConfig,
        connectAuth,
        disconnectAuth,
        startBot,
        stopBot,
        pauseBot,
        resumeBot,
        runScanNow,
    };
}
