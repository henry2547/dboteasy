import {
    DEFAULT_SCAN_CONCURRENCY,
    MIN_SCAN_TICKS,
    scanDigitMarkets,
    type ScanClient,
    type ScanProgress,
} from '../scan-markets';
import type { DerivMessage } from '../deriv-public-ws';
import type { ConnectionState } from '../types';

/** Raw `active_symbols` entries, shaped like the public feed's response. */
function symbolEntry(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        underlying_symbol: 'R_100',
        underlying_symbol_name: 'Volatility 100 Index',
        underlying_symbol_type: 'synthetic_index',
        market: 'synthetic_index',
        submarket: 'random_index',
        pip_size: 0.01,
        exchange_is_open: 1,
        is_trading_suspended: 0,
        ...overrides,
    };
}

const SYMBOLS = [
    symbolEntry({ underlying_symbol: '1HZ100V', underlying_symbol_name: 'Volatility 100 (1s) Index' }),
    symbolEntry({}),
    symbolEntry({ underlying_symbol: 'R_50', underlying_symbol_name: 'Volatility 50 Index' }),
    // A non-digit market must never enter the scan.
    symbolEntry({ underlying_symbol: 'STEPIX', underlying_symbol_name: 'Step Index', submarket: 'step_index' }),
    // Closed and suspended markets are reported, not scanned.
    symbolEntry({
        underlying_symbol: 'R_25',
        underlying_symbol_name: 'Volatility 25 Index',
        exchange_is_open: 0,
    }),
    symbolEntry({
        underlying_symbol: 'R_75',
        underlying_symbol_name: 'Volatility 75 Index',
        is_trading_suspended: 1,
    }),
];

const ELIGIBLE = ['1HZ100V', 'R_100', 'R_50'];

/** Prices whose last digit (at 2 decimal places) follows the given digit list. */
function pricesFor(digits: number[]): number[] {
    return digits.map(digit => 100 + digit / 100);
}

/** 100 digits that satisfy the scanner's Over 1 conditions. */
function qualifiedDigits(): number[] {
    return [...Array(5).fill(0), ...Array(5).fill(1), ...Array(40).fill(5), ...Array(25).fill(5), ...Array(25).fill(7)];
}

interface FakeOptions {
    symbols?: Record<string, unknown>[];
    history?: (symbol: string) => number[] | 'hang' | 'error';
    onSend?: (payload: Record<string, unknown>) => void;
    /** Delay before a request is answered — used to observe concurrency. */
    responseDelayMs?: number;
}

class FakeScanClient implements ScanClient {
    private readonly messageHandlers = new Set<(message: DerivMessage) => void>();
    private readonly statusHandlers = new Set<(state: ConnectionState) => void>();
    private nextRequestId = 1;
    private open = false;
    readonly sent: Array<Record<string, unknown>> = [];

    constructor(private readonly options: FakeOptions = {}) {}

    connect(): void {
        this.open = true;
        setTimeout(() => this.emitStatus('connected'), 0);
    }

    disconnect(): void {
        this.open = false;
    }

    isOpen(): boolean {
        return this.open;
    }

    onMessage(handler: (message: DerivMessage) => void): () => void {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    onStatus(handler: (state: ConnectionState) => void): () => void {
        this.statusHandlers.add(handler);
        handler({
            status: 'idle',
            reconnectAttempt: 0,
            lastMessageAt: null,
            lastPingAt: null,
            lastPongAt: null,
            latencyMs: null,
            errorMessage: null,
        });
        return () => this.statusHandlers.delete(handler);
    }

    send(payload: Record<string, unknown>): number {
        const req_id = this.nextRequestId;
        this.nextRequestId += 1;
        this.sent.push({ ...payload, req_id });
        this.options.onSend?.(payload);
        if (this.open) setTimeout(() => this.respond(req_id, payload), this.options.responseDelayMs ?? 0);
        return req_id;
    }

    private respond(req_id: number, payload: Record<string, unknown>): void {
        if (payload.active_symbols) {
            this.emit({ msg_type: 'active_symbols', req_id, active_symbols: this.options.symbols ?? SYMBOLS });
            return;
        }

        if (typeof payload.ticks_history === 'string') {
            const symbol = payload.ticks_history;
            const digits = this.options.history ? this.options.history(symbol) : qualifiedDigits();
            if (digits === 'hang') return; // never answers — used for the timeout case
            if (digits === 'error') {
                this.emit({ msg_type: 'history', req_id, error: { code: 'MarketIsDisabled', message: 'Market unavailable' } });
                return;
            }
            this.emit({
                msg_type: 'history',
                req_id,
                pip_size: 2,
                history: { prices: pricesFor(digits), times: digits.map((_, index) => 1_700_000_000 + index) },
                subscription: { id: `${symbol}-sub` },
            });
            return;
        }

        this.emit({ msg_type: 'forget', req_id });
    }

    private emit(message: Record<string, unknown>): void {
        this.messageHandlers.forEach(handler => handler(message as DerivMessage));
    }

    private emitStatus(status: ConnectionState['status']): void {
        const state: ConnectionState = {
            status,
            reconnectAttempt: 0,
            lastMessageAt: null,
            lastPingAt: null,
            lastPongAt: null,
            latencyMs: null,
            errorMessage: null,
        };
        this.statusHandlers.forEach(handler => handler(state));
    }
}

function historyRequests(client: FakeScanClient, symbol: string): number {
    return client.sent.filter(payload => payload.ticks_history === symbol).length;
}

describe('scanDigitMarkets', () => {
    it('attempts every eligible market, once each, and reports the skipped ones', async () => {
        const client = new FakeScanClient();
        const report = await scanDigitMarkets({ createClient: () => client });

        expect(report.summary.totalMarkets).toBe(ELIGIBLE.length);
        expect(report.summary.scannedMarkets).toBe(ELIGIBLE.length);
        expect(report.results.map(result => result.market.apiSymbol).sort()).toEqual([...ELIGIBLE].sort());
        ELIGIBLE.forEach(symbol => expect(historyRequests(client, symbol)).toBe(1));

        // The non-digit, closed and suspended markets are never requested.
        expect(historyRequests(client, 'STEPIX')).toBe(0);
        expect(historyRequests(client, 'R_25')).toBe(0);
        expect(historyRequests(client, 'R_75')).toBe(0);

        const skipped = report.failures.filter(failure => failure.status === 'skipped');
        expect(skipped.map(failure => failure.market.apiSymbol).sort()).toEqual(['R_25', 'R_75']);
        expect(skipped.find(failure => failure.market.apiSymbol === 'R_25')?.reason).toMatch(/closed/i);
        expect(skipped.find(failure => failure.market.apiSymbol === 'R_75')?.reason).toMatch(/suspended/i);
    });

    it('keeps the real symbol, the barrier and the combined losing share on each row', async () => {
        const client = new FakeScanClient();
        const report = await scanDigitMarkets({ createClient: () => client });
        const row = report.results[0];

        expect(ELIGIBLE).toContain(row.market.apiSymbol);
        expect(row.digits).toHaveLength(qualifiedDigits().length);
        expect(row.setup.strategy).toBe('over1');
        expect(row.setup.barrier).toBe(1);
        expect(row.setup.losingDigits).toEqual([0, 1]);
        expect(row.setup.combinedLosingPercentage).toBeCloseTo(10, 5);
        expect(row.setup.qualified).toBe(true);
        expect(report.summary.qualifiedSetups).toBe(ELIGIBLE.length);
        expect(report.summary.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('isolates a failing market and records why it failed', async () => {
        const client = new FakeScanClient({
            history: symbol => {
                if (symbol === 'R_100') return 'error';
                if (symbol === 'R_50') return Array(MIN_SCAN_TICKS - 5).fill(3);
                return qualifiedDigits();
            },
        });

        const report = await scanDigitMarkets({ createClient: () => client });

        expect(report.results.map(result => result.market.apiSymbol)).toEqual(['1HZ100V']);
        expect(report.summary.failedMarkets).toBe(1);
        expect(report.summary.insufficientMarkets).toBe(1);
        expect(report.failures.find(failure => failure.market.apiSymbol === 'R_100')?.reason).toBe('Market unavailable');
        expect(report.failures.find(failure => failure.market.apiSymbol === 'R_50')?.status).toBe('insufficient');
        expect(
            report.summary.scannedMarkets + report.summary.failedMarkets + report.summary.insufficientMarkets
        ).toBe(ELIGIBLE.length);
    });

    it('reports an honest timeout instead of a false success', async () => {
        const client = new FakeScanClient({
            history: symbol => (symbol === 'R_100' ? 'hang' : qualifiedDigits()),
        });

        const report = await scanDigitMarkets({ createClient: () => client, requestTimeoutMs: 150 });

        expect(report.summary.scannedMarkets).toBe(ELIGIBLE.length - 1);
        expect(report.summary.failedMarkets).toBe(1);
        expect(report.failures.find(failure => failure.market.apiSymbol === 'R_100')?.reason).toMatch(/timed out/i);
    });

    it('reports real progress with the market being read', async () => {
        const progress: ScanProgress[] = [];
        const client = new FakeScanClient();
        await scanDigitMarkets({ createClient: () => client, onProgress: update => progress.push(update) });

        expect(progress[0].phase).toBe('connecting');
        const final = progress[progress.length - 1];
        expect(final?.phase).toBe('done');
        expect(final?.marketsTotal).toBe(ELIGIBLE.length);
        expect(final?.marketsCompleted).toBe(ELIGIBLE.length);
        expect(progress.every((entry, index) => index === 0 || entry.marketsCompleted >= progress[index - 1].marketsCompleted)).toBe(
            true
        );

        const reading = progress.filter(entry => entry.currentMarket !== null);
        expect(reading.length).toBeGreaterThanOrEqual(ELIGIBLE.length);
    });

    it('uses bounded concurrency rather than one request at a time', async () => {
        let outstanding = 0;
        let peak = 0;
        const client = new FakeScanClient({
            responseDelayMs: 5,
            onSend: payload => {
                if (!payload.ticks_history) return;
                outstanding += 1;
                peak = Math.max(peak, outstanding);
            },
            history: () => {
                outstanding -= 1; // the market was answered, so its slot is free again
                return qualifiedDigits();
            },
        });

        await scanDigitMarkets({ createClient: () => client, concurrency: 2 });
        expect(peak).toBe(2);
        expect(peak).toBeLessThanOrEqual(DEFAULT_SCAN_CONCURRENCY);
    });

    it('stops on cancel and reports the markets it never reached', async () => {
        const controller = new AbortController();
        const client = new FakeScanClient({
            onSend: payload => {
                if (payload.ticks_history) controller.abort();
            },
        });

        const report = await scanDigitMarkets({
            createClient: () => client,
            signal: controller.signal,
            concurrency: 1,
        });

        expect(report.summary.cancelled).toBe(true);
        expect(report.summary.scannedMarkets).toBeLessThan(ELIGIBLE.length);

        const cancelled = report.failures.filter(failure => /cancelled/i.test(failure.reason));
        expect(cancelled.length).toBeGreaterThan(0);
        expect(cancelled.every(failure => failure.status === 'skipped')).toBe(true);

        // Every eligible market is accounted for: scanned, failed, or never reached.
        const eligibleFailures = report.failures.filter(failure => ELIGIBLE.includes(failure.market.apiSymbol));
        expect(report.summary.scannedMarkets + eligibleFailures.length).toBe(ELIGIBLE.length);
    });

    it('fails loudly when the feed cannot be reached', async () => {
        const client = new FakeScanClient();
        jest.spyOn(client, 'connect').mockImplementation(() => {
            throw new Error('no socket');
        });

        await expect(scanDigitMarkets({ createClient: () => client, requestTimeoutMs: 120 })).rejects.toThrow();
    });
});
