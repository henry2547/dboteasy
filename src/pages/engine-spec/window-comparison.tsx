import { formatPercent } from '../digits/format';
import { RELIABILITY_LABELS, type ConfluenceResult, type WindowSnapshot } from './engine-scoring';

const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

const windowsOf = (result: ConfluenceResult) => [result.windows.micro, result.windows.mid, result.windows.macro];

/**
 * Detailed window comparison: the same three windows, every metric exposed,
 * plus a bar chart against the strategy's expected baseline.
 */
export default function WindowComparison({ result }: { result: ConfluenceResult | null }) {
    if (!result) return null;
    const windows = windowsOf(result);
    const rows: Array<{ label: string; values: string[] }> = [
        { label: 'Observations', values: windows.map(w => `${w.sample} / ${w.size}`) },
        { label: 'Observed frequency', values: windows.map(w => formatPercent(w.actual * 100, 1)) },
        { label: 'Expected frequency', values: windows.map(w => formatPercent(w.expected * 100, 0)) },
        { label: 'Delta', values: windows.map(w => `${signed(w.deltaPp)} pp`) },
        { label: 'Weighted contribution', values: windows.map(w => `${signed(w.deltaPp * w.weight, 2)} pp`) },
        { label: 'Standard error', values: windows.map(w => `${w.standardErrorPp.toFixed(2)} pp`) },
        { label: '95% confidence interval', values: windows.map(w => `${formatPercent(w.ciLowPct, 0)}–${formatPercent(w.ciHighPct, 0)}`) },
        { label: 'z-score', values: windows.map(w => signed(w.zScore, 2)) },
        { label: 'Alignment', values: windows.map(w => (w.aligned ? 'Aligned' : w.opposing ? 'Opposing' : 'Neutral')) },
        { label: 'Reliability', values: windows.map(w => RELIABILITY_LABELS[w.reliability]) },
    ];

    return (
        <section className='espec-window-panel'>
            <div className='espec-panel-head'>
                <span className='espec-panel-head__kicker'>Evidence</span>
                <h3 className='espec-panel-head__title'>Window comparison</h3>
                <p className='espec-panel-head__intro'>
                    Every window is measured against the same fair baseline for {result.strategy.label} (
                    {formatPercent(result.strategy.expectedShare * 100, 0)}). The windows overlap and share ticks, so
                    they are not independent confirmations.
                </p>
            </div>

            <div className='espec-bars' aria-hidden='true'>
                {windows.map(window => (
                    <div className='espec-bars__row' key={window.label}>
                        <span className='espec-bars__label'>{window.label}</span>
                        <div className='espec-bars__track'>
                            <span className='espec-bars__baseline' style={{ left: `${window.expected * 100}%` }} />
                            <span
                                className={`espec-bars__fill${window.deltaPp < 0 ? ' espec-bars__fill--down' : ''}`}
                                style={{ width: `${Math.max(0, Math.min(100, window.actual * 100))}%` }}
                            />
                        </div>
                        <span className='espec-bars__value'>{formatPercent(window.actual * 100, 1)}</span>
                    </div>
                ))}
                <p className='espec-bars__legend'>
                    Bar = observed share · the line marks the {formatPercent(result.strategy.expectedShare * 100, 0)}{' '}
                    fair baseline.
                </p>
            </div>

            <figure className='espec-table'>
                <figcaption className='espec-table__caption'>Window metrics</figcaption>
                <div className='espec-table__scroll' role='region' aria-label='Window metrics' tabIndex={0}>
                    <table style={{ minWidth: '720px' }}>
                        <thead>
                            <tr>
                                <th scope='col'>Metric</th>
                                {windows.map(window => (
                                    <th scope='col' key={window.label}>
                                        {window.label} · {window.size}t
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.label}>
                                    <th scope='row'>{row.label}</th>
                                    {row.values.map((value, index) => (
                                        <td key={`${row.label}-${windows[index].label}`}>{value}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className='espec-table__hint'>Scroll sideways inside the table when a column is out of view.</p>
            </figure>

            <p className='espec-window-panel__note'>
                Standard error uses the binomial approximation SE = √(p(1−p)/n) with p = the fair baseline. It
                assumes independent ticks; genuine ticks can be serially dependent, so treat the interval as
                indicative rather than exact. Macro regime: spread {result.regime.spreadPp.toFixed(1)} pp, entropy{' '}
                {result.regime.entropyBits.toFixed(2)} bits.
            </p>
        </section>
    );
}
