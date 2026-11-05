/**
 * use-confluence-engine — drives the multi-window engine from the shared Digits
 * feed.
 *
 * The feed already holds the market's validated tick history, so the engine
 * never opens a socket of its own: it re-reads the same rolling digits on every
 * new tick and keeps only the small amount of state a tick-based engine needs
 * (tick counter, previous micro delta, previous alignment, cooldown deadline,
 * and the one signal waiting for its next-tick outcome).
 *
 * The signal journal is a VIRTUAL observer: it records what the engine said and
 * then checks the next genuine tick that arrives. It never invents a tick and it
 * never places an order.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionStatus, NormalizedTick } from '../digits/types';
import {
    MACRO_WINDOW,
    MICRO_WINDOW,
    evaluateConfluence,
    type Alignment,
    type ConfluenceResult,
    type EngineSettings,
    type Reliability,
    type StrategySelection,
    type Verdict,
} from './engine-scoring';

/** A larger jump than this between consecutive epochs is treated as a data gap. */
const GAP_SECONDS = 10;
/** At most one journalled signal per micro window, so the list stays readable. */
const JOURNAL_MIN_GAP_TICKS = MICRO_WINDOW;
const JOURNAL_LIMIT = 40;

export interface SignalRecord {
    id: string;
    tickIndex: number;
    epoch: number | null;
    market: string;
    strategyLabel: string;
    verdict: Verdict;
    masterScore: number;
    alignment: Alignment;
    reliability: Reliability;
    deltas: { micro: number; mid: number; macro: number };
    observedDigit: number | null;
    won: boolean | null;
}

interface EngineState {
    tickIndex: number;
    previousMicroDelta: number | null;
    previousAlignment: Alignment | null;
    cooldownUntilTick: number;
    cooldownReason: string | null;
    lastTickKey: string | null;
    lastEpoch: number | null;
    lastSymbol: string | null;
    gapTickIndex: number | null;
    pendingId: string | null;
    pendingWinning: number[];
    lastSignalTick: number | null;
    selectionKey: string | null;
    settingsKey: string | null;
}

const freshState = (): EngineState => ({
    tickIndex: 0,
    previousMicroDelta: null,
    previousAlignment: null,
    cooldownUntilTick: 0,
    cooldownReason: null,
    lastTickKey: null,
    lastEpoch: null,
    lastSymbol: null,
    gapTickIndex: null,
    pendingId: null,
    pendingWinning: [],
    lastSignalTick: null,
    selectionKey: null,
    settingsKey: null,
});

export interface UseConfluenceEngineOptions {
    ticks: NormalizedTick[];
    selection: StrategySelection;
    settings: EngineSettings;
    marketName: string;
    connectionStatus: ConnectionStatus;
    precisionReady: boolean;
}

export interface UseConfluenceEngineResult {
    result: ConfluenceResult | null;
    /** Digits the engine currently holds (the macro window reads the last 500). */
    sample: number;
    journal: SignalRecord[];
    resetJournal: () => void;
}

export function useConfluenceEngine(options: UseConfluenceEngineOptions): UseConfluenceEngineResult {
    const { ticks, selection, settings, marketName, connectionStatus, precisionReady } = options;

    const digits = useMemo(
        () => ticks.map(tick => tick.lastDigit).filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9),
        [ticks]
    );

    const [result, setResult] = useState<ConfluenceResult | null>(null);
    const [journal, setJournal] = useState<SignalRecord[]>([]);
    const stateRef = useRef<EngineState>(freshState());

    const selectionKey = `${selection.family}:${selection.target}`;
    const settingsKey = JSON.stringify(settings);

    useEffect(() => {
        const latest = ticks[ticks.length - 1];
        const state = stateRef.current;

        if (!latest) {
            stateRef.current = freshState();
            setResult(null);
            return;
        }

        // A market switch is a new stream: drop every window-derived value but
        // keep the journal, which is a session log across markets.
        if (state.lastSymbol !== null && state.lastSymbol !== latest.symbol) {
            stateRef.current = freshState();
            stateRef.current.lastSymbol = latest.symbol;
        }
        const engine = stateRef.current;

        const isNewTick = latest.key !== engine.lastTickKey;
        const selectionChanged = engine.selectionKey !== null && engine.selectionKey !== selectionKey;
        const settingsChanged = engine.settingsKey !== null && engine.settingsKey !== settingsKey;
        if (!isNewTick && !selectionChanged && !settingsChanged) return;

        // 1. The previous signal's outcome is the first genuine tick after it.
        if (isNewTick && engine.pendingId !== null) {
            const pendingId = engine.pendingId;
            const winning = new Set(engine.pendingWinning);
            const digit = latest.lastDigit;
            const won = Number.isInteger(digit) && digit >= 0 && digit <= 9 ? winning.has(digit) : null;
            setJournal(previous =>
                previous.map(record =>
                    record.id === pendingId ? { ...record, observedDigit: digit, won } : record
                )
            );
            engine.pendingId = null;
            engine.pendingWinning = [];
        }

        // 2. Advance the tick clock and detect a gap in the genuine stream.
        if (isNewTick) {
            if (engine.lastEpoch !== null && latest.epoch - engine.lastEpoch > GAP_SECONDS) {
                engine.gapTickIndex = engine.tickIndex + 1;
            }
            engine.lastEpoch = latest.epoch;
            engine.tickIndex += 1;
            engine.lastTickKey = latest.key;
        }

        // A window reset is not a momentum flip: start flip detection fresh.
        if (selectionChanged) engine.previousMicroDelta = null;

        const gapTicksLeft =
            engine.gapTickIndex === null
                ? 0
                : Math.max(0, MACRO_WINDOW - (engine.tickIndex - engine.gapTickIndex));

        let dataBlock: string | null = null;
        if (connectionStatus !== 'connected') {
            dataBlock = 'The market-data stream is not connected — signals are suspended.';
        } else if (!precisionReady) {
            dataBlock =
                'Quote precision is unresolved, so last digits cannot be trusted. History must reload before a signal.';
        } else if (gapTicksLeft > 0) {
            dataBlock = `A tick gap was detected; the three windows must refill with genuine post-gap ticks (${gapTicksLeft} of ${MACRO_WINDOW} left).`;
        }

        // 3. Evaluate the whole engine on the validated digit stream.
        const next = evaluateConfluence({
            digits,
            selection,
            settings,
            tickIndex: engine.tickIndex,
            previousMicroDelta: engine.previousMicroDelta,
            previousAlignment: engine.previousAlignment,
            cooldownUntilTick: engine.cooldownUntilTick,
            cooldownReason: engine.cooldownReason,
            dataBlock,
        });

        // 4. Carry the per-tick state forward.
        engine.previousMicroDelta = next.windows.micro.deltaPp;
        engine.previousAlignment = next.alignment;
        engine.cooldownUntilTick = next.cooldown.untilTick;
        engine.cooldownReason = next.cooldown.reason;
        engine.selectionKey = selectionKey;
        engine.settingsKey = settingsKey;

        // 5. Journal a qualifying signal once, and wait for its next genuine tick.
        const qualifying = next.verdict === 'execute' || next.verdict === 'fade';
        const spacedOut =
            engine.lastSignalTick === null || engine.tickIndex - engine.lastSignalTick >= JOURNAL_MIN_GAP_TICKS;
        if (isNewTick && qualifying && spacedOut && engine.pendingId === null) {
            const acted = next.verdict === 'fade' ? next.opposite : next.strategy;
            const record: SignalRecord = {
                id: `${latest.symbol}:${engine.tickIndex}:${next.verdict}`,
                tickIndex: engine.tickIndex,
                epoch: latest.epoch ?? null,
                market: marketName,
                strategyLabel: acted.label,
                verdict: next.verdict,
                masterScore: next.masterScore,
                alignment: next.alignment,
                reliability: next.reliability,
                deltas: {
                    micro: next.windows.micro.deltaPp,
                    mid: next.windows.mid.deltaPp,
                    macro: next.windows.macro.deltaPp,
                },
                observedDigit: null,
                won: null,
            };
            engine.pendingId = record.id;
            engine.pendingWinning = acted.winningDigits;
            engine.lastSignalTick = engine.tickIndex;
            setJournal(previous => [record, ...previous].slice(0, JOURNAL_LIMIT));
        }

        setResult(next);
    }, [ticks, digits, selection, selectionKey, settings, settingsKey, marketName, connectionStatus, precisionReady]);

    const resetJournal = useCallback(() => {
        stateRef.current.pendingId = null;
        stateRef.current.pendingWinning = [];
        setJournal([]);
    }, []);

    return { result, sample: digits.length, journal, resetJournal };
}
