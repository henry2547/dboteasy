import { formatClock, formatPercent } from '../digits/format';
import { ALIGNMENT_LABELS, RELIABILITY_LABELS } from './engine-scoring';
import type { SignalRecord } from './use-confluence-engine';

interface SignalJournalProps {
    journal: SignalRecord[];
    onReset: () => void;
}

/**
 * Virtual signal journal for this session. Every qualifying verdict is saved
 * with its windows and then judged against the very next genuine tick — no
 * fabricated outcomes, and nothing here is an actual contract result.
 */
export default function SignalJournal({ journal, onReset }: SignalJournalProps) {
    const resolved = journal.filter(record => record.won !== null);
    const wins = resolved.filter(record => record.won === true).length;
    const losses = resolved.length - wins;
    const winRate = resolved.length > 0 ? (wins / resolved.length) * 100 : null;

    return (
        <section className='espec-journal'>
            <div className='espec-panel-head'>
                <span className='espec-panel-head__kicker'>Virtual hook</span>
                <h3 className='espec-panel-head__title'>Signal journal</h3>
                <p className='espec-panel-head__intro'>
                    Each qualifying verdict is stored, then observed against the next real tick. This is a virtual
                    observation of the engine, never a purchased contract — it is kept apart from any trading result.
                </p>
            </div>

            <div className='espec-journal__stats'>
                <div className='espec-journal__stat'>
                    <span className='espec-journal__stat-label'>Signals</span>
                    <span className='espec-journal__stat-value'>{journal.length}</span>
                </div>
                <div className='espec-journal__stat'>
                    <span className='espec-journal__stat-label'>Resolved</span>
                    <span className='espec-journal__stat-value'>{resolved.length}</span>
                </div>
                <div className='espec-journal__stat'>
                    <span className='espec-journal__stat-label'>Virtual W / L</span>
                    <span className='espec-journal__stat-value'>
                        {wins} / {losses}
                    </span>
                </div>
                <div className='espec-journal__stat'>
                    <span className='espec-journal__stat-label'>Virtual win rate</span>
                    <span className='espec-journal__stat-value'>{formatPercent(winRate, 1)}</span>
                </div>
            </div>

            {journal.length === 0 ? (
                <p className='espec-journal__empty'>
                    No qualifying signals yet. A signal is journalled only while the verdict is EXECUTE TRADE or FADE
                    with all gates passing — at most one per 25 ticks.
                </p>
            ) : (
                <figure className='espec-table'>
                    <figcaption className='espec-table__caption'>Last {journal.length} qualifying signals</figcaption>
                    <div className='espec-table__scroll' role='region' aria-label='Signal journal' tabIndex={0}>
                        <table style={{ minWidth: '900px' }}>
                            <thead>
                                <tr>
                                    <th scope='col'>Tick</th>
                                    <th scope='col'>Market</th>
                                    <th scope='col'>Strategy</th>
                                    <th scope='col'>Verdict</th>
                                    <th scope='col'>Master</th>
                                    <th scope='col'>Align</th>
                                    <th scope='col'>Reliability</th>
                                    <th scope='col'>Micro / Mid / Macro</th>
                                    <th scope='col'>Next digit</th>
                                    <th scope='col'>Virtual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {journal.map(record => (
                                    <tr key={record.id}>
                                        <th scope='row'>{formatClock(record.epoch)}</th>
                                        <td>{record.market}</td>
                                        <td>{record.strategyLabel}</td>
                                        <td>{record.verdict === 'execute' ? 'EXECUTE' : 'FADE'}</td>
                                        <td className={record.masterScore >= 0 ? 'is-up' : 'is-down'}>
                                            {record.masterScore >= 0 ? '+' : ''}
                                            {record.masterScore.toFixed(2)} pp
                                        </td>
                                        <td>{ALIGNMENT_LABELS[record.alignment]}</td>
                                        <td>{RELIABILITY_LABELS[record.reliability]}</td>
                                        <td>
                                            {record.deltas.micro.toFixed(1)} / {record.deltas.mid.toFixed(1)} /{' '}
                                            {record.deltas.macro.toFixed(1)}
                                        </td>
                                        <td>{record.observedDigit ?? 'waiting'}</td>
                                        <td className={record.won === null ? '' : record.won ? 'is-up' : 'is-down'}>
                                            {record.won === null ? 'observing' : record.won ? 'Win' : 'Loss'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className='espec-table__hint'>Scroll sideways inside the table when a column is out of view.</p>
                </figure>
            )}

            <button type='button' className='espec-journal__reset' onClick={onReset} disabled={journal.length === 0}>
                Clear journal
            </button>
        </section>
    );
}
