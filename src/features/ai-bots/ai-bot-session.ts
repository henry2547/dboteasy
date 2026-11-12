/**
 * The AI Bots run, kept outside the page component.
 *
 * The tab strip unmounts the page the moment another tab is opened, and the
 * point of a running bot is to watch its trades in the Bot Builder's Summary,
 * Transactions and Journal. So the selected bot, its settings and the scan loop
 * live here, at module scope: switching tabs changes nothing, the bot keeps
 * rescanning every few seconds and keeps buying the signals it confirms.
 *
 * Two ways to run a bot:
 * - **Scan mode** (AI Bots tab): every open volatility market is read and the
 *   bot trades the first confirmed signal. The Even-Odd bot then stays on that
 *   market (see `lockedSymbol`) until its hot/cold parity breaks.
 * - **Single-market mode** (Free Bots tab): one volatility market chosen by the
 *   user is read and traded, with no multi-market scanner at all.
 */

import { scanDigitMarkets, type ScanProgress, type ScanReport } from '@/features/digits/scan-markets';
import { isAiBotMarketBusy, placeAiBotTrade, resetAiBotRun } from './ai-bot-runner';
import { AI_BOT_SETTINGS } from './catalog';
import { buildInsights, isEvenOddConditionValid, readHotCold } from './signals';
import type { AiBotId, AiBotSettings, ScanRow, ScanStatus } from './types';

/** Pause between two scans while the bot is running. */
export const RESCAN_INTERVAL_MS = 5000;

export interface AiBotSessionView {
    activeBot: AiBotId | null;
    settings: Record<AiBotId, AiBotSettings>;
    status: ScanStatus;
    running: boolean;
    rows: ScanRow[];
    progress: ScanProgress | null;
    error: string | null;
    /**
     * The market an Even-Odd run is trading until its conditions stop holding.
     * `null` while the bot is still looking for a market (or for Rise-Fall).
     */
    lockedSymbol: string | null;
    /** Single-market mode: only this symbol is read. `null` in scan mode. */
    onlySymbol: string | null;
}

let view: AiBotSessionView = {
    activeBot: null,
    settings: AI_BOT_SETTINGS,
    status: 'idle',
    running: false,
    rows: [],
    progress: null,
    error: null,
    lockedSymbol: null,
    onlySymbol: null,
};

const listeners = new Set<() => void>();
let abort: AbortController | null = null;
let timer: number | null = null;
let scanId = 0;

function setView(patch: Partial<AiBotSessionView>) {
    view = { ...view, ...patch };
    listeners.forEach(listener => listener());
}

export function getAiBotSessionView(): AiBotSessionView {
    return view;
}

export function subscribeAiBotSessionView(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function reportToRows(report: ScanReport): ScanRow[] {
    const scanned: ScanRow[] = report.results.map(result => ({
        symbol: result.market.apiSymbol,
        displayName: result.market.displayName,
        digits: result.digits,
        prices: result.prices,
        status: 'scanned',
        reason: null,
        scannedAt: result.scannedAt,
    }));

    const failed: ScanRow[] = report.failures.map(failure => ({
        symbol: failure.market.apiSymbol,
        displayName: failure.market.displayName,
        digits: [],
        prices: [],
        status: failure.status,
        reason: failure.reason,
        scannedAt: null,
    }));

    return [...scanned, ...failed].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function placeNext(insight: { row: ScanRow; signal: string | null } | undefined, settings: AiBotSettings) {
    if (!insight?.signal || !view.activeBot) return false;
    void placeAiBotTrade({
        botId: view.activeBot,
        settings,
        symbol: insight.row.symbol,
        displayName: insight.row.displayName,
        side: insight.signal as Parameters<typeof placeAiBotTrade>[0]['side'],
    });
    return true;
}

/** Buys the next confirmed signal of the scan that just finished. */
function tradeFromScan() {
    const { activeBot, settings, rows, running, lockedSymbol } = view;
    if (!activeBot || !running) return;

    const botSettings = settings[activeBot];
    const insights = buildInsights(activeBot, rows, botSettings);

    // The Even-Odd bot stays on the market where it found its entry, and only
    // leaves it once the hot/cold parity that justified the entry breaks.
    if (activeBot === 'even_odd' && lockedSymbol) {
        const lockedRow = rows.find(row => row.symbol === lockedSymbol);
        const reading = lockedRow ? readHotCold(lockedRow.digits) : null;
        if (!lockedRow || !reading || !isEvenOddConditionValid(reading)) {
            setView({ lockedSymbol: null });
        } else {
            const next = insights.find(
                insight => insight.row.symbol === lockedSymbol && insight.signal && !isAiBotMarketBusy(insight.row.symbol)
            );
            placeNext(next, botSettings);
            return;
        }
    }

    const next = insights.find(insight => insight.signal && !isAiBotMarketBusy(insight.row.symbol));
    if (!next) return;
    if (activeBot === 'even_odd') setView({ lockedSymbol: next.row.symbol });
    placeNext(next, botSettings);
}

async function scanOnce() {
    if (!view.running) return;

    const current = (scanId += 1);
    const controller = new AbortController();
    abort = controller;
    setView({ status: 'scanning', progress: null });

    try {
        const report = await scanDigitMarkets({
            signal: controller.signal,
            // Single-market mode reads that one market only — there is no scanner.
            symbols: view.onlySymbol ? [view.onlySymbol] : undefined,
            onProgress: next => {
                if (scanId === current) setView({ progress: next });
            },
        });
        if (!view.running || scanId !== current) return;
        setView({ rows: reportToRows(report), status: 'ready', error: null, progress: null });
        tradeFromScan();
    } catch (caught) {
        if (!view.running || scanId !== current) return;
        setView({
            status: 'error',
            progress: null,
            error: (caught as Error).message || 'The market scan could not be completed.',
        });
    } finally {
        if (abort === controller) abort = null;
    }

    // A running bot scans again a few seconds later; a stopped one keeps its last report.
    if (!view.running || scanId !== current) return;
    timer = window.setTimeout(() => {
        timer = null;
        void scanOnce();
    }, RESCAN_INTERVAL_MS);
}

function clearTimer() {
    if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
    }
}

function beginRun(patch: Partial<AiBotSessionView>) {
    resetAiBotRun();
    setView({ running: true, rows: [], error: null, status: 'scanning', lockedSymbol: null, ...patch });
    void scanOnce();
}

/** Starts the scanning bot (every volatility market). */
export function startAiBot() {
    if (view.running) return;
    beginRun({ onlySymbol: null });
}

/**
 * Starts a bot on ONE market the user picked — the Free Bots single-market
 * bots. No other market is read or traded.
 */
export function startMarketBot(botId: AiBotId, symbol: string) {
    if (!symbol) return;
    if (view.running) stopAiBot();
    setView({ activeBot: botId, onlySymbol: symbol, lockedSymbol: null });
    beginRun({
        onlySymbol: symbol,
        settings: { ...view.settings, [botId]: { ...view.settings[botId], marketScope: symbol } },
    });
}

export function stopAiBot() {
    if (!view.running) return;
    scanId += 1;
    clearTimer();
    abort?.abort();
    abort = null;
    setView({ running: false, status: 'idle', progress: null, lockedSymbol: null });
}

export function openAiBot(id: AiBotId) {
    stopAiBot();
    setView({ activeBot: id, onlySymbol: null, lockedSymbol: null });
}

export function closeAiBot() {
    stopAiBot();
    setView({ activeBot: null, onlySymbol: null, lockedSymbol: null });
}

export function updateAiBotSettings(id: AiBotId, patch: Partial<AiBotSettings>) {
    setView({ settings: { ...view.settings, [id]: { ...view.settings[id], ...patch } } });
}
