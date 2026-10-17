/** Event and execution journal. */

import type { JournalEntry } from '../scanner-types';

function fmtTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function JournalPanel({
    journal,
    onClear,
}: {
    journal: JournalEntry[];
    onClear: () => void;
}) {
    const entries = [...journal].reverse();

    return (
        <article className='scanner-card'>
            <div className='scanner-journal__head'>
                <h3 className='scanner-card__title' style={{ margin: 0 }}>Event journal</h3>
                <button type='button' className='scanner-btn' onClick={onClear}>Clear</button>
            </div>

            {entries.length === 0 ? (
                <p className='scanner-card__muted'>No events yet.</p>
            ) : (
                <div className='scanner-journal__list'>
                    {entries.map(entry => (
                        <div key={entry.id} className={`scanner-journal__entry scanner-journal__entry--${entry.level}`}>
                            <span className='scanner-journal__time'>{fmtTime(entry.timestamp)}</span>
                            <span>{entry.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </article>
    );
}
