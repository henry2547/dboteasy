/**
 * The dashboard's primary action: scanning every eligible digit market.
 *
 * The button drives the real scan pipeline in `useDigitsLab` — it starts the
 * scan, shows the progress the scan actually reports, refuses a second scan
 * while one is running, offers a cancel and a retry, and shows the honest
 * summary (markets read, qualifying setups, duration, failures).
 */

import { formatCount, formatDuration, formatPercent } from '../format';
import type { MarketScanFailure, ScanProgress, ScanSummary } from '../scan-markets';

interface ScanControlPanelProps {
    isScanning: boolean;
    progress: ScanProgress | null;
    summary: ScanSummary | null;
    failures: MarketScanFailure[];
    error: string | null;
    /** Digit markets the lab has discovered — what the scan will attempt. */
    eligibleMarkets: number;
    onScan: () => void;
    onCancel: () => void;
}

export default function ScanControlPanel({
    isScanning,
    progress,
    summary,
    failures,
    error,
    eligibleMarkets,
    onScan,
    onCancel,
}: ScanControlPanelProps) {
    const total = progress?.marketsTotal ?? eligibleMarkets;
    const completed = progress?.marketsCompleted ?? 0;
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const elapsedSeconds = progress ? Math.round(progress.elapsedMs / 1000) : 0;
    const failedMarkets = failures.filter(failure => failure.status === 'failed').length;
    const otherSkips = failures.length - failedMarkets;

    const statusTone = isScanning ? 'busy' : error ? 'error' : summary ? (summary.cancelled ? 'warn' : 'ok') : 'idle';
    const statusLabel = isScanning
        ? 'Scanning'
        : error
          ? 'Scan failed'
          : summary
            ? summary.cancelled
                ? 'Cancelled'
                : 'Complete'
            : 'Idle';

    const buttonLabel = isScanning
        ? total > 0
            ? `Scanning ${completed}/${total}…`
            : 'Scanning…'
        : error
          ? 'Retry scan'
          : 'Scan all markets';

    return (
        <section className='dash-section' aria-labelledby='dash-scan-heading'>
            <header className='dash-section__head'>
                <h3 className='dash-section__title' id='dash-scan-heading'>
                    Market scan
                </h3>
                <span className={`dash-chip dash-chip--${statusTone}`}>{statusLabel}</span>
            </header>

            <div className='dash-scan__actions'>
                <button
                    type='button'
                    className='dash-button dash-button--primary dash-button--scan'
                    onClick={onScan}
                    disabled={isScanning}
                    aria-describedby='dash-scan-hint'
                >
                    {buttonLabel}
                </button>

                {isScanning && (
                    <button type='button' className='dash-button' onClick={onCancel}>
                        Cancel scan
                    </button>
                )}

                <p className='dash-scan__hint' id='dash-scan-hint'>
                    {isScanning
                        ? `Reading real ticks from Deriv's public feed — one failed market never stops the others.`
                        : eligibleMarkets > 0
                          ? `${formatCount(eligibleMarkets)} eligible markets will be scanned in batches.`
                          : 'Waiting for the market list before a scan can start.'}
                </p>
            </div>

            {isScanning && (
                <div className='dash-progress'>
                    <div
                        className={`dash-progress__track${total > 0 ? '' : ' dash-progress__track--indeterminate'}`}
                        role='progressbar'
                        aria-label='Scan progress'
                        aria-valuemin={0}
                        aria-valuemax={total > 0 ? total : undefined}
                        aria-valuenow={total > 0 ? completed : undefined}
                        aria-valuetext={total > 0 ? `${completed} of ${total} markets read` : 'Discovering markets'}
                    >
                        <span className='dash-progress__bar' style={total > 0 ? { width: `${percent}%` } : undefined} />
                    </div>
                    <p className='dash-progress__label'>
                        {total > 0 ? `${completed} of ${total} markets read` : 'Discovering markets…'}
                        {progress?.currentMarket ? ` · reading ${progress.currentMarket}` : ''}
                        {elapsedSeconds > 0 ? ` · ${elapsedSeconds}s` : ''}
                    </p>
                </div>
            )}

            {error && !isScanning && (
                <p className='dash-alert dash-alert--error' role='alert'>
                    {error}
                </p>
            )}

            {summary && !isScanning && (
                <>
                    <div className='dash-tiles'>
                        <div className='dash-tile'>
                            <span className='dash-tile__label'>Markets scanned</span>
                            <span className='dash-tile__value'>
                                {formatCount(summary.scannedMarkets)}
                                <span className='dash-tile__sub'>of {formatCount(summary.totalMarkets)}</span>
                            </span>
                        </div>
                        <div className='dash-tile'>
                            <span className='dash-tile__label'>Qualifying setups</span>
                            <span className='dash-tile__value'>{formatCount(summary.qualifiedSetups)}</span>
                        </div>
                        <div className='dash-tile'>
                            <span className='dash-tile__label'>Scan duration</span>
                            <span className='dash-tile__value'>{formatDuration(summary.durationMs)}</span>
                        </div>
                        <div className='dash-tile'>
                            <span className='dash-tile__label'>Qualifying share</span>
                            <span className='dash-tile__value'>
                                {summary.scannedMarkets > 0
                                    ? formatPercent((summary.qualifiedSetups / summary.scannedMarkets) * 100, 0)
                                    : '—'}
                            </span>
                        </div>
                    </div>

                    {(failedMarkets > 0 || otherSkips > 0) && (
                        <p className='dash-alert dash-alert--warn'>
                            {failedMarkets > 0 && `${failedMarkets} market${failedMarkets === 1 ? '' : 's'} could not be read`}
                            {failedMarkets > 0 && otherSkips > 0 ? ' and ' : ''}
                            {otherSkips > 0 && `${otherSkips} market${otherSkips === 1 ? ' was' : 's were'} not scanned`}
                            . Each is listed with its reason under the results.
                        </p>
                    )}
                </>
            )}

            {!summary && !isScanning && !error && (
                <p className='dash-empty'>
                    No scan yet. The scan reads the latest ticks of every eligible volatility market and ranks them by
                    how orderly their digits are. Historical analysis, not a promise of profit.
                </p>
            )}
        </section>
    );
}
