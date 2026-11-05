import BarrierPanel from '../digits/components/barrier-panel';
import DigitGrid from '../digits/components/digit-grid';
import MarketSelector from '../digits/components/market-selector';
import { useDigitsLabContext } from '../digits/digits-lab-context';
import { formatClock, formatCount, formatDecimal } from '../digits/format';
import { ANALYSIS_WINDOWS } from '../digits/use-digits-lab';
import '../digits/digits-page.scss';
import '../digits/digits-enhancements.scss';
import './statistics-page.scss';

/**
 * Statistics tab — the detail view for the market selected on the Digits tab.
 * It shares the same live feed (see DigitsLabProvider), so the market picked
 * there is the market analysed here.
 */
export default function StatisticsPage() {
    const lab = useDigitsLabContext();
    const { selectedMarket, statistics } = lab;

    const recentDigits = lab.analysisTicks.map(tick => tick.lastDigit).reverse();
    const recentTicks = [...lab.analysisTicks].reverse().slice(0, 20);

    return (
        <div className='digits statistics-page'>
            <header className='digits-hero'>
                <div className='digits-hero__titles'>
                    <h2 className='digits-hero__title'>Market statistics</h2>
                    <p className='digits-hero__subtitle'>
                        Detailed digit history and behaviour for the selected market
                    </p>
                </div>
                <div className='digits-hero__actions'>
                    <span className={`digits-status digits-status--${lab.connection.status}`}>
                        {lab.connection.status === 'connected' ? 'Connected' : lab.connection.status}
                    </span>
                </div>
            </header>

            <div className='digits-controls'>
                <MarketSelector
                    markets={lab.markets}
                    selectedMarket={selectedMarket}
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

            <section className='digits-panel'>
                <header className='digits-panel__head'>
                    <h3 className='digits-panel__title'>
                        {selectedMarket ? selectedMarket.displayName : 'Market details'}
                    </h3>
                    <span className='digits-panel__note'>{selectedMarket ? selectedMarket.apiSymbol : '—'}</span>
                </header>

                {selectedMarket ? (
                    <dl className='statistics-details'>
                        <div>
                            <dt>Category</dt>
                            <dd>{selectedMarket.category}</dd>
                        </div>
                        <div>
                            <dt>Availability</dt>
                            <dd>
                                {selectedMarket.isSuspended
                                    ? 'Suspended'
                                    : selectedMarket.isOpen
                                      ? 'Open'
                                      : 'Closed'}
                            </dd>
                        </div>
                        <div>
                            <dt>Pip size</dt>
                            <dd>{selectedMarket.pipSize ?? '—'}</dd>
                        </div>
                        <div>
                            <dt>Decimal places</dt>
                            <dd>{selectedMarket.decimalPlaces ?? '—'}</dd>
                        </div>
                        <div>
                            <dt>Last quote</dt>
                            <dd>{lab.currentTick ? lab.currentTick.formattedQuote : '—'}</dd>
                        </div>
                        <div>
                            <dt>Ticks stored</dt>
                            <dd>{formatCount(lab.ticks.length)}</dd>
                        </div>
                        <div>
                            <dt>In window</dt>
                            <dd>{formatCount(statistics.sampleSize)}</dd>
                        </div>
                        <div>
                            <dt>Average digit</dt>
                            <dd>{formatDecimal(statistics.averageDigit, 2)}</dd>
                        </div>
                    </dl>
                ) : (
                    <p className='digits-empty'>Select a market to see its statistics.</p>
                )}
            </section>

            <section className='digits-panel'>
                <header className='digits-panel__head'>
                    <h3 className='digits-panel__title'>Digit history</h3>
                    <span className='digits-panel__note'>Latest first</span>
                </header>
                <div className='statistics-digits'>
                    {recentDigits.length === 0 && <span className='digits-empty'>Waiting for ticks…</span>}
                    {recentDigits.map((digit, index) => (
                        <span
                            key={`${index}-${digit}`}
                            className={
                                'statistics-digit' + (index === 0 ? ' statistics-digit--latest' : '')
                            }
                        >
                            {digit}
                        </span>
                    ))}
                </div>
            </section>

            <section className='digits-panel'>
                <header className='digits-panel__head'>
                    <h3 className='digits-panel__title'>Recent ticks</h3>
                    <span className='digits-panel__note'>Last {recentTicks.length}</span>
                </header>
                <div className='statistics-table-wrap'>
                    <table className='statistics-table'>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Quote</th>
                                <th>Last digit</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentTicks.map(tick => (
                                <tr key={tick.key}>
                                    <td>{formatClock(tick.epoch)}</td>
                                    <td>{tick.formattedQuote}</td>
                                    <td>
                                        <strong>{tick.lastDigit}</strong>
                                    </td>
                                    <td>{tick.source}</td>
                                </tr>
                            ))}
                            {recentTicks.length === 0 && (
                                <tr>
                                    <td colSpan={4} className='statistics-table__empty'>
                                        Waiting for ticks…
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <DigitGrid statistics={statistics} />
            <BarrierPanel barriers={lab.barrierStats} />
        </div>
    );
}
