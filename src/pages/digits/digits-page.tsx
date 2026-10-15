import BacktestPanel from './components/backtest-panel';
import BarrierPanel from './components/barrier-panel';
import DigitDistribution from './components/digit-distribution';
import DigitGrid from './components/digit-grid';
import MarketConditionsPanel from './components/market-conditions-panel';
import MarketSelector from './components/market-selector';
import ScanMarketsButton from './components/scan-markets-button';
import StrategyPanel from './components/strategy-panel';
import TickPanel from './components/tick-panel';
import { useDigitsLabContext } from './digits-lab-context';
import { formatPercent } from './format';
import { ANALYSIS_WINDOWS } from './use-digits-lab';
import './digits-page.scss';
import './digits-enhancements.scss';

/**
 * Digits Analysis Lab — a read-only, public-market-data view of Deriv's feed.
 *
 * It discovers live markets, streams the latest 1,000 ticks and turns them into
 * digit statistics, barrier behaviour, hit-rates and a walk-forward backtest.
 * It never logs in, never sends a trade and never shows an invented value.
 */
export default function DigitsPage() {
    const lab = useDigitsLabContext();
    const { statistics } = lab;
    const recentDigits = lab.analysisTicks.map(tick => tick.lastDigit);

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
                        {lab.connection.status === 'connected' ? 'Connected' : lab.connection.status}
                    </span>
                    <button type='button' className='digits-button' onClick={lab.refreshMarkets}>
                        Refresh markets
                    </button>
                </div>
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

            {lab.errorMessage && <p className='digits-banner digits-banner--warning'>{lab.errorMessage}</p>}

            <TickPanel
                market={lab.selectedMarket}
                currentTick={lab.currentTick}
                previousTick={lab.previousTick}
                direction={lab.direction}
                precision={lab.precision}
                tickCount={lab.ticks.length}
                connection={lab.connection}
                isLoadingHistory={lab.isLoadingHistory}
            />

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
                            {statistics.leastFrequentDigits.length ? statistics.leastFrequentDigits.join(', ') : '—'}
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

            <DigitGrid statistics={statistics} />
            <DigitDistribution statistics={statistics} recentDigits={recentDigits} />
            <BarrierPanel barriers={lab.barrierStats} />
            <StrategyPanel performance={lab.rulePerformance} signals={lab.signals} />
            <BacktestPanel results={lab.backtests} />

            <ScanMarketsButton
                isScanning={lab.isScanning}
                results={lab.scanResults}
                error={lab.scanError}
                selectedMarket={lab.selectedMarket}
                onScan={lab.scanMarkets}
                onPick={lab.selectMarket}
            />

            <p className='digits-disclaimer'>
                Unofficial, educational tool reading Deriv&apos;s public market-data feed. No login, no trading, no
                financial advice.
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
