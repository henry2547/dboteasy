import type { ScanProgress } from '@/features/digits/scan-markets';
import { EVEN_ODD_WINDOW } from '../signals';
import type { MarketInsight } from '../signals';
import type { ScanStatus } from '../types';

interface LiveMarketScanProps {
    insights: MarketInsight[];
    status: ScanStatus;
    /** A running bot rescans on a timer, so the panel says so. */
    running: boolean;
    progress: ScanProgress | null;
    error: string | null;
    signals: number;
}

function badgeText(status: ScanStatus, signals: number, progress: ScanProgress | null): string {
    if (status === 'scanning') {
        return progress ? `Scanning ${progress.marketsCompleted}/${progress.marketsTotal}` : 'Scanning';
    }
    if (status === 'ready') return `${signals} signal${signals === 1 ? '' : 's'} ready`;
    if (status === 'error') return 'Scan failed';
    return 'No scan yet';
}

/** Live market scan — one row per volatility market with its newest digits and status. */
function LiveMarketScan({ insights, status, running, progress, error, signals }: LiveMarketScanProps) {
    const tone = status === 'ready' && signals > 0 ? 'success' : status === 'error' ? 'danger' : 'idle';

    return (
        <section className='ai-scan' aria-label='Live market scan'>
            <header className='ai-scan__head'>
                <h2 className='ai-scan__title'>
                    <span className='ai-scan__icon' aria-hidden='true'>
                        ⌁
                    </span>
                    Live market scan
                </h2>
                <span className={`ai-scan__badge ai-scan__badge--${tone}`}>{badgeText(status, signals, progress)}</span>
            </header>

            {status === 'scanning' && (
                <p className='ai-scan__note'>
                    Reading every open volatility market on the public feed
                    {progress?.currentMarket ? ` — ${progress.currentMarket}` : '…'}
                </p>
            )}

            {status === 'error' && error && <p className='ai-scan__note ai-scan__note--danger'>{error}</p>}

            {status === 'idle' && insights.length === 0 && (
                <p className='ai-scan__note'>Press START AI BOT to read every volatility market.</p>
            )}

            {running && insights.length > 0 && (
                <p className='ai-scan__note'>Live · this scan re-reads every market automatically.</p>
            )}

            {insights.length > 0 && (
                <ul className='ai-scan__list'>
                    {insights.map(insight => {
                        const { row, signal, status: line, detail } = insight;
                        const digits = row.digits.slice(-EVEN_ODD_WINDOW);
                        const failed = row.status !== 'scanned';

                        return (
                            <li
                                className={`ai-scan__row${signal ? ' ai-scan__row--signal' : ''}`}
                                key={row.symbol}
                            >
                                <div className='ai-scan__market'>
                                    <span
                                        className={`ai-scan__dot${signal ? ' ai-scan__dot--signal' : ''}${
                                            failed ? ' ai-scan__dot--failed' : ''
                                        }`}
                                        aria-hidden='true'
                                    />
                                    <span className='ai-scan__names'>
                                        <span className='ai-scan__name'>{row.displayName}</span>
                                        <span className='ai-scan__detail'>{detail}</span>
                                    </span>
                                </div>

                                <div className='ai-scan__digits' aria-label='Newest digits'>
                                    {digits.length > 0 ? (
                                        digits.map((digit, index) => (
                                            <span
                                                className={`ai-scan__digit${
                                                    index === digits.length - 1 ? ' ai-scan__digit--newest' : ''
                                                }`}
                                                key={`${row.symbol}-${index}`}
                                            >
                                                {digit}
                                            </span>
                                        ))
                                    ) : (
                                        <span className='ai-scan__digit ai-scan__digit--empty'>–</span>
                                    )}
                                </div>

                                <span
                                    className={`ai-scan__status${signal ? ' ai-scan__status--signal' : ''}${
                                        failed ? ' ai-scan__status--failed' : ''
                                    }`}
                                >
                                    {line}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export default LiveMarketScan;
