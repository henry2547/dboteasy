import { formatPercent } from '../format';
import { CONVERGENCE_HIGH_PERCENT, CONVERGENCE_LOW_PERCENT, isOutOfBand } from '../engines';
import type { VelocityMatrix } from '../engines';

/** Tone class for a cell outside the fair band (matches the stylesheet's `--hot` / `--cold`). */
function bandTone(percentage: number): string {
    if (!isOutOfBand(percentage)) return '';
    return percentage > CONVERGENCE_HIGH_PERCENT
        ? ' digits-matrix__cell--hot'
        : ' digits-matrix__cell--cold';
}

interface VelocityMatrixPanelProps {
    matrix: VelocityMatrix;
}

/**
 * Engine A — the concentric matrix as a digit × window grid. Cells outside the
 * fair 8–12% band are tinted, and a row whose *every* window agrees is called
 * out as a convergence signal.
 */
export default function VelocityMatrixPanel({ matrix }: VelocityMatrixPanelProps) {
    const flagged = Object.values(matrix.convergence).filter(entry => entry.state !== 'BALANCED');

    return (
        <section className='digits-panel digits-matrix'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Digit velocity matrix</h3>
                <span className='digits-panel__note'>Macro-to-micro · 20 → 1000 ticks</span>
            </header>

            <p className='digits-matrix__help'>
                Frequency % for each digit across five concentric windows. A cell is tinted when it falls outside the
                fair 8–12% band; a row is flagged only when <em>every</em> window agrees.
            </p>

            <div className='digits-matrix__scroll'>
                <table className='digits-matrix__table'>
                    <thead>
                        <tr>
                            <th scope='col'>Digit</th>
                            {matrix.windows.map(window => (
                                <th scope='col' key={window.windowSize}>
                                    {window.windowSize}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.values(matrix.convergence).map(entry => (
                            <tr
                                key={entry.digit}
                                className={entry.state !== 'BALANCED' ? `digits-matrix__row--${entry.state.toLowerCase()}` : undefined}
                            >
                                <th scope='row' className='digits-matrix__digit'>
                                    {entry.digit}
                                </th>
                                {matrix.windows.map(window => {
                                    const percentage = window.percentages[entry.digit];
                                    return (
                                        <td
                                            key={window.windowSize}
                                            className={`digits-matrix__cell${bandTone(percentage)}`}
                                            title={
                                                isOutOfBand(percentage)
                                                    ? `${percentage < CONVERGENCE_LOW_PERCENT ? 'Below' : 'Above'} the fair ${CONVERGENCE_LOW_PERCENT}–${CONVERGENCE_HIGH_PERCENT}% band`
                                                    : undefined
                                            }
                                        >
                                            {window.sampleSize === 0 ? '—' : formatPercent(percentage)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className='digits-matrix__footer'>
                {flagged.length === 0 ? (
                    <span className='digits-matrix__convergence digits-matrix__convergence--balanced'>
                        No digit is skewed across every horizon — the feed reads balanced.
                    </span>
                ) : (
                    flagged.map(entry => (
                        <span
                            key={entry.digit}
                            className={`digits-matrix__convergence digits-matrix__convergence--${entry.state.toLowerCase()}`}
                        >
                            Digit {entry.digit} · {entry.state.toLowerCase()} ({entry.windowsAligned.length}/
                            {matrix.windows.length} windows)
                        </span>
                    ))
                )}
            </div>
        </section>
    );
}
