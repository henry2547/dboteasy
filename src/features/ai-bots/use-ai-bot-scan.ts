/**
 * Runs the app's public market scan for the AI Bots tab.
 *
 * `scanDigitMarkets` opens its own short-lived public WebSocket, reads every
 * open volatility market and returns the ticks it saw; this hook only shapes
 * that report into rows. It never subscribes the user's live feed twice and it
 * never places a trade.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { scanDigitMarkets, type ScanProgress, type ScanReport } from '@/features/digits/scan-markets';
import type { ScanRow, ScanStatus } from './types';

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

export function useAiBotScan() {
    const [status, setStatus] = useState<ScanStatus>('idle');
    const [rows, setRows] = useState<ScanRow[]>([]);
    const [progress, setProgress] = useState<ScanProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const scanIdRef = useRef(0);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        scanIdRef.current += 1;
        setStatus('idle');
    }, []);

    const start = useCallback(async () => {
        if (abortRef.current) return;

        const controller = new AbortController();
        abortRef.current = controller;
        const scanId = scanIdRef.current + 1;
        scanIdRef.current = scanId;

        setStatus('scanning');
        setError(null);
        setProgress(null);
        setRows([]);

        try {
            const report = await scanDigitMarkets({
                signal: controller.signal,
                onProgress: next => {
                    if (scanIdRef.current === scanId) setProgress(next);
                },
            });
            if (scanIdRef.current !== scanId || controller.signal.aborted) return;
            setRows(reportToRows(report));
            setStatus('ready');
        } catch (caught) {
            if (scanIdRef.current !== scanId || controller.signal.aborted) return;
            setStatus('error');
            setError((caught as Error).message || 'The market scan could not be completed.');
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            if (scanIdRef.current === scanId) setProgress(null);
        }
    }, []);

    useEffect(
        () => () => {
            abortRef.current?.abort();
            abortRef.current = null;
        },
        []
    );

    return { status, rows, progress, error, start, stop };
}
