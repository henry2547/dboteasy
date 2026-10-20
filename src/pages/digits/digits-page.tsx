import BacktestPanel from './components/backtest-panel';
import BarrierPanel from './components/barrier-panel';
import DigitDistribution from './components/digit-distribution';
import DigitGrid from './components/digit-grid';
import FeedbackPanel from './components/feedback-panel';
import LabEnginesSection from './components/lab-engines-section';
import MarketConditionsPanel from './components/market-conditions-panel';
import MarketOverview from './components/market-overview';
import MarketResultsTable from './components/market-results-table';
import MarketSelector from './components/market-selector';
import ScanControlPanel from './components/scan-control-panel';
import StrategyPanel from './components/strategy-panel';
import { useDigitsLabContext } from './digits-lab-context';
import { formatPercent } from './format';
import { useLabEngines } from './use-lab-engines';
import { ANALYSIS_WINDOWS } from './use-digits-lab';
import './digits-page.scss';
import './digits-enhancements.scss';
import './digits-lab-engines.scss';
import './digits-dashboard.scss';

/**
 * Digits Analysis Lab — a read-only, public-market-data view of Deriv's feed.
 *
 * It discovers live markets, streams the latest 1,000 ticks and turns them into
 * digit statistics, barrier behaviour, hit-rates and a walk-forward backtest.
 * It never logs in, never sends a trade and never shows an invented value.
 *
 * The page is organised as a dashboard: market overview, the scan action and
 * its honest summary, the scan results, then the historical digit analysis.
 */
export default function DigitsPage() {
    const lab = useDigitsLabContext();
    const engines = useLabEngines();
    const { statistics } = lab;
    const recentDigits = lab.analysisTicks.map(tick => tick.lastDigit);
    const eligibleMarkets = lab.markets.filter(market => market.isOpen && !market.isSuspended).length;

    return (
        <div className='digits'>
            <header className='digits-hero'>
                <div className='digits-hero__titles'>
                    <h2 className='digits-hero__title'>Digits Analysis Lab</h2>
                    <p className='digits-hero__subtitle'>
                        Public market data · statistical analysis · educational strategy research
                    </p>
                </div>

                <div className='digits-hero__actions'>
                    <span className={`digits-status digits-status--${lab.connection.status}`}>
                        {lab.connection.status === 'connected' ? 'Feed connected' : lab.connection.status}
                    </span>
                    <button
                        type='button'
                        className='dash-button'
                        onClick={lab.refreshMarkets}
                        disabled={lab.isScanning || lab.connection.status !== 'connected'}
                        title={lab.isScanning ? 'A scan is running — market refresh resumes when it finishes.' : undefined}
                    >
                        Refresh markets
                    </button>
                </div>
            </header>

            <section className='dash-section' aria-labelledby='dash-settings-heading'>
                <header className='dash-section__head'>
                    <h3 className='dash-section__title' id='dash-settings-heading'>
                        Market &amp; analysis settings
                    </h3>
                    <span className='dash-section__note'>
                        The rolling window sizes every digit statistic on this page.
                    </span>
                </header>

                <div className='digits-controls'>
                    <MarketSelector
                        markets={lab.markets}
                        selectedMarket={lab.selectedMarket}
                        onSelect={lab.selectMarket}
                        disabled={lab.connection.status !== 'connected'}
                    />

                    <div className='digits-window' role='group' aria-label='Analysis window'>
                        <span className='digits-window__label'>Window</span>
                        {ANALYSIS_WINDOWS.map(size => (
                            <button
                                type='button'
                                key={size}
                                className={
                                    'digits-window__option' +
                                    (lab.analysisWindow === size ? ' digits-window__option--active' : '')
                                }
                                onClick={() => lab.setAnalysisWindow(size)}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {lab.errorMessage && <p className='digits-banner digits-banner--warning'>{lab.errorMessage}</p>}

            <MarketOverview
                market={lab.selectedMarket}
                currentTick={lab.currentTick}
                previousTick={lab.previousTick}
                direction={lab.direction}
                precision={lab.precision}
                tickCount={lab.ticks.length}
                connection={lab.connection}
                isLoadingHistory={lab.isLoadingHistory}
                availableMarkets={lab.markets.length}
                analysedTicks={lab.analysisTicks.length}
                analysisWindow={lab.analysisWindow}
                scanSummary={lab.scanSummary}
            />

            <ScanControlPanel
                isScanning={lab.isScanning}
                progress={lab.scanProgress}
                summary={lab.scanSummary}
                failures={lab.scanFailures}
                error={lab.scanError}
                eligibleMarkets={eligibleMarkets}
                onScan={lab.scanMarkets}
                onCancel={lab.cancelScan}
            />

            <MarketResultsTable
                results={lab.scanResults}
                failures={lab.scanFailures}
                summary={lab.scanSummary}
                isScanning={lab.isScanning}
                selectedMarket={lab.selectedMarket}
                onPick={lab.selectMarket}
                onScan={lab.scanMarkets}
            />

            <section className='dash-section' aria-labelledby='dash-digits-heading'>
                <header className='dash-section__head'>
                    <h3 className='dash-section__title' id='dash-digits-heading'>
                        Digit analysis
                    </h3>
                    <span className='dash-section__note'>
                        {lab.analysisTicks.length} ticks in the analysis window · {lab.ticks.length} stored
                    </span>
                </header>

                <section className='digits-summary'>
                    <SummaryCard
                        title='Even / Odd'
                        primaryLabel='Even'
                        primaryValue={formatPercent(statistics.evenPercentage)}
                        secondaryLabel='Odd'
                        secondaryValue={formatPercent(statistics.oddPercentage)}
                        primaryShare={statistics.evenPercentage}
                    />
                    <SummaryCard
                        title='Low (0–4) / High (5–9)'
                        primaryLabel='Low'
                        primaryValue={formatPercent(statistics.lowPercentage)}
                        secondaryLabel='High'
                        secondaryValue={formatPercent(statistics.highPercentage)}
                        primaryShare={statistics.lowPercentage}
                    />
                    <article className='digits-summary__card'>
                        <h4 className='digits-summary__title'>Digit circle read</h4>
                        <p className='digits-summary__line'>
                            Most:{' '}
                            <strong>
                                {statistics.mostFrequentDigits.length ? statistics.mostFrequentDigits.join(', ') : '—'}
                            </strong>
                        </p>
                        <p className='digits-summary__line'>
                            Least:{' '}
                            <strong>
                                {statistics.leastFrequentDigits.length
                                    ? statistics.leastFrequentDigits.join(', ')
                                    : '—'}
                            </strong>
                        </p>
                        <p className='digits-summary__line'>
                            Streak:{' '}
                            <strong>
                                {statistics.currentStreak
                                    ? `${statistics.currentStreak.digit} ×${statistics.currentStreak.length}`
                                    : '—'}
                            </strong>
                        </p>
                    </article>
                </section>

                <MarketConditionsPanel statistics={statistics} signals={lab.signals} />

                <DigitGrid
                    statistics={statistics}
                    currentDigit={recentDigits.length ? recentDigits[recentDigits.length - 1] : null}
                />
                <DigitDistribution statistics={statistics} recentDigits={recentDigits} />
            </section>

            <section className='dash-section' aria-labelledby='dash-research-heading'>
                <header className='dash-section__head'>
                    <h3 className='dash-section__title' id='dash-research-heading'>
                        Barrier &amp; strategy research
                    </h3>
                    <span className='dash-section__note'>Historical hit-rates over the analysis window</span>
                </header>

                <BarrierPanel barriers={lab.barrierStats} />
                <StrategyPanel performance={lab.rulePerformance} signals={lab.signals} />
                <BacktestPanel results={lab.backtests} />
            </section>

            <LabEnginesSection engines={engines} />

            <FeedbackPanel />

            <p className='digits-disclaimer'>
                Unofficial, educational tool reading Deriv&apos;s public market-data feed. No login, no trading, no
                financial advice. Statistical qualification is not proof that a setup will win.
            </p>
        </div>
    );
}

interface SummaryCardProps {
    title: string;
    primaryLabel: string;
    primaryValue: string;
    secondaryLabel: string;
    secondaryValue: string;
    primaryShare: number;
}

function SummaryCard({ title, primaryLabel, primaryValue, secondaryLabel, secondaryValue, primaryShare }: SummaryCardProps) {
    return (
        <article className='digits-summary__card'>
            <h4 className='digits-summary__title'>{title}</h4>
            <div className='digits-summary__split'>
                <span className='digits-summary__share' style={{ width: `${Math.min(Math.max(primaryShare, 0), 100)}%` }} />
            </div>
            <p className='digits-summary__line'>
                {primaryLabel} <strong>{primaryValue}</strong> · {secondaryLabel} <strong>{secondaryValue}</strong>
            </p>
        </article>
    );
}
