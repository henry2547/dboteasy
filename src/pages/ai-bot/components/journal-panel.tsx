/**
 * Journal panel — event and execution journal showing all bot events.
 */

import { useAiBotContext } from '../ai-bot-context';
import type { JournalLevel } from '../types';

const LEVEL_LABELS: Record<JournalLevel, string> = {
    info: 'INFO',
    signal: 'SIGNAL',
    trade: 'TRADE',
    risk: 'RISK',
    warning: 'WARN',
    error: 'ERROR',
};

export default function JournalPanel() {
    const bot = useAiBotContext();
    const { state } = bot;
    const entries = [...state.journal].reverse();

    return (
        <section className='aibot-panel'>
            <h3 className='aibot-panel__title'>Event & Execution Journal</h3>
            <div className='aibot-journal'>
                {entries.length === 0 && <p className='aibot-empty'>No events yet.</p>}
                {entries.map(entry => (
                    <div key={entry.id} className={`aibot-journal__entry aibot-journal__entry--${entry.level}`}>
                        <span className='aibot-journal__time'>
                            {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`aibot-journal__level aibot-journal__level--${entry.level}`}>
                            {LEVEL_LABELS[entry.level]}
                        </span>
                        <span className='aibot-journal__category'>{entry.category}</span>
                        <span className='aibot-journal__message'>{entry.message}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
