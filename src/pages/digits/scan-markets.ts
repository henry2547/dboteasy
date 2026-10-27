/**
 * Scans every eligible volatility market on the public feed and scores how
 * orderly its digits currently are, so the dashboard (and the floating scan
 * button) can point the user at the calmest market to trade.
 *
 * Design rules this module keeps:
 * - Real data only. Every digit comes from a `ticks_history` response on
 *   Deriv's public WebSocket; nothing is generated, cached or assumed.
 * - One short-lived socket per scan, never the live subscription the Digits
 *   page is streaming.
 * - Every eligible market is attempted, in bounded batches, and one failing
 *   market can never stop or corrupt the others.
 * - The report is honest: a market that returned too few ticks, failed, or was
 *   never reached is reported as such, never as a successful scan.
 */

import { DerivPublicWebSocketClient } from './deriv-public-ws';
import type { DerivMessage } from './deriv-public-ws';
import { filterDigitMarkets, normalizeActiveSymbols } from './markets';
import { summariseScanSetup, type ScanSetupSummary } from './market-analysis';
import { extractLastDigit, formatQuote, resolvePrecision } from './precision';
import { calculateStatisticsFromDigits } from './statistics';
import { computeAdaptiveSignals } from './strategies';
import type { ConnectionState, DigitStatistics, MarketSymbol } from './types';

/** Ticks requested per market — the same window the lab's rules are tuned for. */
export const SCAN_TICKS = 120;
/** Fewer ticks than this cannot be judged, and is reported as insufficient. */
export const MIN_SCAN_TICKS = 30;
/** How many markets may be in flight at once on the shared socket. */
export const DEFAULT_SCAN_CONCURRENCY = 4;
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
    /** Setup, barrier, combined losing share and trend for this market. */
    setup: ScanSetupSummary;
}

export type MarketScanStatus = 'ok' | 'insufficient' | 'failed' | 'skipped';

export interface MarketScanFailure {
    market: MarketSymbol;
    status: Exclude<MarketScanStatus, 'ok'>;
    reason: string;
}

export type ScanPhase = 'connecting' | 'symbols' | 'scanning' | 'done' | 'failed' | 'cancelled';

export interface ScanProgress {
    phase: ScanPhase;
    /** Eligible markets this scan will attempt. */
    marketsTotal: number;
    /** Markets already finished (scanned + failed). */
    marketsCompleted: number;
    marketsScanned: number;
    marketsFailed: number;
    /** Display name of the market currently being read, when one is in flight. */
    currentMarket: string | null;
    startedAt: number;
    elapsedMs: number;
}

export interface ScanSummary {
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    /** Eligible markets attempted. */
    totalMarkets: number;
    /** Markets that returned a usable sample. */
    scannedMarkets: number;
    failedMarkets: number;
    /** Markets that answered but with too few usable ticks. */
    insufficientMarkets: number;
    /** Closed, suspended or cancelled-out markets — never scanned. */
    skippedMarkets: number;
    /** Markets whose sample passed the scanner's own conditions. */
    qualifiedSetups: number;
    cancelled: boolean;
}

export interface ScanReport {
    results: MarketScan[];
    failures: MarketScanFailure[];
    summary: ScanSummary;
}

/** The slice of the public client the scanner needs — a seam for the tests. */
export interface ScanClient {
    connect(): void;
    disconnect(): void;
    isOpen(): boolean;
    send(message: Record<string, unknown>): number;
    onMessage(handler: (message: DerivMessage) => void): () => void;
    onStatus(handler: (state: ConnectionState) => void): () => void;
}

export interface ScanDigitMarketsOptions {
    /** Bounded concurrency; defaults to `DEFAULT_SCAN_CONCURRENCY`. */
    concurrency?: number;
    /** Cancels the scan; markets not reached are reported as skipped. */
    signal?: AbortSignal;
    onProgress?: (progress: ScanProgress) => void;
    /** Injected for tests. */
    createClient?: () => ScanClient;
    requestTimeoutMs?: number;
    ticks?: number;
}

function openClient(client: ScanClient, timeoutMs: number): Promise<void> {
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

        timer = setTimeout(() => finish(new Error('Could not reach the market feed in time.')), timeoutMs);
        off = client.onStatus((state: ConnectionState) => {
            if (state.status === 'connected') finish();
            else if (state.status === 'error') finish(new Error(state.errorMessage ?? 'The market feed failed.'));
        });
        client.connect();
    });
}

function request(
    client: ScanClient,
    payload: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal
): Promise<DerivMessage> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Scan cancelled'));
            return;
        }

        let settled = false;
        const reqId = client.send(payload);

        const finish = (error?: Error, message?: DerivMessage) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            off();
            signal?.removeEventListener('abort', handleAbort);
            if (error) reject(error);
            else resolve(message as DerivMessage);
        };

        const handleAbort = () => finish(new Error('Scan cancelled'));
        const timer = setTimeout(
            () => finish(new Error(`Timed out waiting for ${Object.keys(payload)[0]}`)),
            timeoutMs
        );

        const off = client.onMessage(message => {
            if (message.req_id !== reqId) return;
            const error = (message as Record<string, any>).error;
            if (error) finish(new Error(String(error.message ?? 'Request failed')));
            else finish(undefined, message);
        });

        signal?.addEventListener('abort', handleAbort, { once: true });
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
        setup: summariseScanSetup(digits, statistics),
    };
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight, so a slow
 * market cannot hold up the rest of the scan.
 */
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
    const size = Math.max(1, Math.min(concurrency, items.length));
    let cursor = 0;

    await Promise.all(
        Array.from({ length: size }, async () => {
            for (;;) {
                const index = cursor;
                cursor += 1;
                if (index >= items.length) return;
                await worker(items[index]);
            }
        })
    );
}

/**
 * Scans every eligible digit market and returns them ranked, best score first,
 * together with the failures and the honest counts of what actually happened.
 */
export async function scanDigitMarkets(options: ScanDigitMarketsOptions = {}): Promise<ScanReport> {
    const {
        concurrency = DEFAULT_SCAN_CONCURRENCY,
        signal,
        onProgress,
        createClient = () => new DerivPublicWebSocketClient(),
        requestTimeoutMs = REQUEST_TIMEOUT_MS,
        ticks = SCAN_TICKS,
    } = options;

    const startedAt = Date.now();
    const client = createClient();
    const results: MarketScan[] = [];
    const failures: MarketScanFailure[] = [];
    const started = new Set<string>();
    let feedDown = false;
    let total = 0;
    let scanned = 0;
    let failed = 0;
    let current: string | null = null;

    const emit = (phase: ScanPhase) => {
        onProgress?.({
            phase,
            marketsTotal: total,
            marketsCompleted: scanned + failed,
            marketsScanned: scanned,
            marketsFailed: failed,
            currentMarket: current,
            startedAt,
            elapsedMs: Date.now() - startedAt,
        });
    };

    try {
        emit('connecting');
        await openClient(client, requestTimeoutMs);
        client.onStatus(state => {
            if (state.status === 'disconnected' || state.status === 'error') feedDown = true;
        });

        emit('symbols');
        const symbolsMessage = await request(client, { active_symbols: 'full' }, requestTimeoutMs, signal);
        const normalized = normalizeActiveSymbols((symbolsMessage as Record<string, any>).active_symbols);

        // One queue entry per unique symbol — nothing is scanned twice.
        const unique = new Map<string, MarketSymbol>();
        filterDigitMarkets(normalized).forEach(market => {
            if (!unique.has(market.apiSymbol)) unique.set(market.apiSymbol, market);
        });

        const eligible: MarketSymbol[] = [];
        unique.forEach(market => {
            if (market.isOpen && !market.isSuspended) {
                eligible.push(market);
            } else {
                failures.push({
                    market,
                    status: 'skipped',
                    reason: market.isSuspended ? 'Trading is suspended on this market.' : 'This market is closed.',
                });
            }
        });

        total = eligible.length;
        emit('scanning');

        await runPool(eligible, concurrency, async market => {
            if (signal?.aborted) return;
            if (started.has(market.apiSymbol)) return;
            started.add(market.apiSymbol);

            current = market.displayName;
            emit('scanning');

            if (feedDown || !client.isOpen()) {
                failures.push({
                    market,
                    status: 'failed',
                    reason: 'The market feed was not connected when this market was read.',
                });
                failed += 1;
                return;
            }

            let subscriptionId: string | undefined;
            try {
                const history = await request(
                    client,
                    {
                        ticks_history: market.apiSymbol,
                        end: 'latest',
                        count: ticks,
                        style: 'ticks',
                        // The public feed rejects `subscribe: 0` on ticks_history.
                        subscribe: 1,
                    },
                    requestTimeoutMs,
                    signal
                );
                subscriptionId = (history as Record<string, any>).subscription?.id;
                if (subscriptionId) client.send({ forget: subscriptionId });

                const digits = digitsFromHistory(history, market);
                if (digits.length < MIN_SCAN_TICKS) {
                    failures.push({
                        market,
                        status: 'insufficient',
                        reason: `Only ${digits.length} of ${ticks} ticks were usable — at least ${MIN_SCAN_TICKS} are needed.`,
                    });
                    failed += 1;
                    return;
                }

                results.push(scoreMarket(market, digits));
                scanned += 1;
            } catch (error) {
                if (subscriptionId) client.send({ forget: subscriptionId });
                const message = (error as Error).message || 'The market could not be read.';
                if (message === 'Scan cancelled' || signal?.aborted) return;
                failures.push({ market, status: 'failed', reason: message });
                failed += 1;
            } finally {
                current = null;
                emit('scanning');
            }
        });

        const cancelled = Boolean(signal?.aborted);
        if (cancelled) {
            eligible.forEach(market => {
                const reported = results.some(result => result.market.apiSymbol === market.apiSymbol);
                const failed = failures.some(failure => failure.market.apiSymbol === market.apiSymbol);
                if (!reported && !failed) {
                    failures.push({ market, status: 'skipped', reason: 'Scan cancelled before this market was read.' });
                }
            });
        }

        emit(cancelled ? 'cancelled' : 'done');

        const finishedAt = Date.now();
        return {
            results: results.sort((a, b) => b.score - a.score),
            failures,
            summary: {
                startedAt,
                finishedAt,
                durationMs: finishedAt - startedAt,
                totalMarkets: total,
                scannedMarkets: results.length,
                failedMarkets: failures.filter(failure => failure.status === 'failed').length,
                insufficientMarkets: failures.filter(failure => failure.status === 'insufficient').length,
                skippedMarkets: failures.filter(failure => failure.status === 'skipped').length,
                qualifiedSetups: results.filter(result => result.setup.qualified).length,
                cancelled,
            },
        };
    } catch (error) {
        emit('failed');
        throw error;
    } finally {
        client.disconnect();
    }
}
