import { formatPercent } from '../digits/format';
import { DIGIT_BASELINE_PCT, type ConfluenceResult } from './engine-scoring';

const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

/** Every digit 0–9 in all three windows, plus the chart behind the table. */
export default function DigitDistribution({ result }: { result: ConfluenceResult | null }) {
    if (!result) return null;
    const rows = result.digits;

    return (
        <section className='espec-digit-panel'>
            <div className='espec-panel-head'>
                <span className='espec-panel-head__kicker'>Distribution</span>
                <h3 className='espec-panel-head__title'>Digit comparison · 0–9</h3>
                <p className='espec-panel-head__intro'>
                    Each digit against the {DIGIT_BASELINE_PCT}% fair baseline. The “vs 10%” column is the macro
                    deviation; the trend compares the micro share with the macro share, so a digit heating up shows
                    positive. Digits in {result.strategy.label} are marked ●.
                </p>
            </div>

            <div className='espec-digit-chart' aria-hidden='true'>
                <div className='espec-digit-chart__legend'>
                    <span className='espec-digit-chart__key espec-digit-chart__key--micro'>Micro</span>
                    <span className='espec-digit-chart__key espec-digit-chart__key--mid'>Mid</span>
                    <span className='espec-digit-chart__key espec-digit-chart__key--macro'>Macro</span>
                </div>
                {rows.map(row => (
                    <div
                        className={`espec-digit-chart__row${row.inStrategy ? ' espec-digit-chart__row--win' : ''}`}
                        key={row.digit}
                    >
                        <span className='espec-digit-chart__digit'>{row.digit}</span>
                        <div className='espec-digit-chart__bars'>
                            {(['micro', 'mid', 'macro'] as const).map(layer => {
                                const value = layer === 'micro' ? row.microPct : layer === 'mid' ? row.midPct : row.macroPct;
                                return (
                                    <span
                                        key={layer}
                                        className={`espec-digit-chart__bar espec-digit-chart__bar--${layer}`}
                                        style={{ width: `${Math.max(1, Math.min(100, value * 5))}%` }}
                                    />
                                );
                            })}
                        </div>
                        <span className='espec-digit-chart__value'>{formatPercent(row.macroPct, 1)}</span>
                    </div>
                ))}
                <p className='espec-digit-chart__scale'>Bar length = share of its window (50% width ≈ 10% share).</p>
            </div>

            <figure className='espec-table'>
                <figcaption className='espec-table__caption'>Digit distribution table</figcaption>
                <div className='espec-table__scroll' role='region' aria-label='Digit distribution' tabIndex={0}>
                    <table style={{ minWidth: '760px' }}>
                        <thead>
                            <tr>
                                <th scope='col'>Digit</th>
                                <th scope='col'>Micro</th>
                                <th scope='col'>Mid</th>
                                <th scope='col'>Macro</th>
                                <th scope='col'>Baseline</th>
                                <th scope='col'>vs 10%</th>
                                <th scope='col'>Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.digit}>
                                    <th scope='row'>
                                        {row.digit} {row.inStrategy && <span className='espec-digit-table__win'>●</span>}
                                    </th>
                                    <td>{formatPercent(row.microPct, 1)}</td>
                                    <td>{formatPercent(row.midPct, 1)}</td>
                                    <td>{formatPercent(row.macroPct, 1)}</td>
                                    <td>{formatPercent(row.baselinePct, 0)}</td>
                                    <td className={row.deviationPp >= 0 ? 'is-up' : 'is-down'}>
                                        {signed(row.deviationPp)} pp
                                    </td>
                                    <td>
                                        {row.trend === 'rising' ? 'Rising' : row.trend === 'falling' ? 'Falling' : 'Flat'}{' '}
                                        ({signed(row.trendPp)} pp)
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className='espec-table__hint'>Scroll sideways inside the table when a column is out of view.</p>
            </figure>
        </section>
    );
}
