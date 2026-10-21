/**
 * Market overview: the market the lab is watching, the live-feed reading and
 * the state of the analysis, in one place.
 *
 * It reuses the existing live-tick panel and only adds the context that was
 * missing (how many markets are available, how much of the feed the analysis
 * is using, and what the last scan did). Nothing here is simulated — every
 * value comes from the live feed or the last real scan.
 */

import TickPanel from './tick-panel';
import { formatAge, formatCount, formatDuration } from '../format';
import type { ConnectionState, MarketSymbol, NormalizedTick, PrecisionState } from '../types';
import type { ScanSummary } from '../scan-markets';

interface MarketOverviewProps {
    market: MarketSymbol | null;
    currentTick: NormalizedTick | null;
    previousTick: NormalizedTick | null;
    direction: 'up' | 'down' | 'flat';
    precision: PrecisionState;
    tickCount: number;
    connection: ConnectionState;
    isLoadingHistory: boolean;
    /** Markets the lab discovered on the feed (before the scan). */
    availableMarkets: number;
    /** Ticks inside the configured rolling window. */
    analysedTicks: number;
    analysisWindow: number;
    scanSummary: ScanSummary | null;
}

export default function MarketOverview({
    availableMarkets,
    analysedTicks,
    analysisWindow,
    scanSummary,
    tickCount,
    isLoadingHistory,
    ...tickProps
}: MarketOverviewProps) {
    const analysisReady = analysedTicks > 0;
    const analysisLabel = isLoadingHistory
        ? 'Loading history'
        : !tickProps.market
          ? 'No market selected'
          : analysisReady
            ? 'Analysing live feed'
            : 'Waiting for ticks';

    return (
        <section className='dash-section' aria-labelledby='dash-overview-heading'>
            <header className='dash-section__head'>
                <h3 className='dash-section__title' id='dash-overview-heading'>
                    Market overview
                </h3>
                <span className='dash-section__note'>
                    {availableMarkets > 0
                        ? `${formatCount(availableMarkets)} digit markets available`
                        : 'Discovering markets…'}
                </span>
            </header>

            <div className='dash-grid dash-grid--overview'>
                <TickPanel tickCount={tickCount} isLoadingHistory={isLoadingHistory} {...tickProps} />

                <article className='dash-card'>
                    <h4 className='dash-card__title'>Analysis</h4>
                    <dl className='dash-facts'>
                        <div className='dash-facts__row'>
                            <dt>Status</dt>
                            <dd>
                                <span className={`dash-chip dash-chip--${analysisReady ? 'ok' : 'idle'}`}>
                                    {analysisLabel}
                                </span>
                            </dd>
                        </div>
                        <div className='dash-facts__row'>
                            <dt>Rolling window</dt>
                            <dd>{formatCount(analysisWindow)} ticks</dd>
                        </div>
                        <div className='dash-facts__row'>
                            <dt>Ticks analysed</dt>
                            <dd>{formatCount(analysedTicks)}</dd>
                        </div>
                        <div className='dash-facts__row'>
                            <dt>Stored ticks</dt>
                            <dd>{formatCount(tickCount)}</dd>
                        </div>
                    </dl>
                    <p className='dash-card__note'>
                        Figures describe the ticks already received — they are not a prediction of the next tick.
                    </p>
                </article>

                <article className='dash-card'>
                    <h4 className='dash-card__title'>Last scan</h4>
                    {scanSummary ? (
                        <dl className='dash-facts'>
                            <div className='dash-facts__row'>
                                <dt>Markets scanned</dt>
                                <dd>
                                    {formatCount(scanSummary.scannedMarkets)} of {formatCount(scanSummary.totalMarkets)}
                                </dd>
                            </div>
                            <div className='dash-facts__row'>
                                <dt>Qualifying</dt>
                                <dd>{formatCount(scanSummary.qualifiedSetups)}</dd>
                            </div>
                            <div className='dash-facts__row'>
                                <dt>Duration</dt>
                                <dd>{formatDuration(scanSummary.durationMs)}</dd>
                            </div>
                            <div className='dash-facts__row'>
                                <dt>Finished</dt>
                                <dd>{formatAge(scanSummary.finishedAt)}</dd>
                            </div>
                        </dl>
                    ) : (
                        <p className='dash-empty'>
                            No scan yet. Scan the markets to compare the digit behaviour of every eligible market.
                        </p>
                    )}
                </article>
            </div>
        </section>
    );
}
