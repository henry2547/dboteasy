import React from 'react';
import { localize } from '@deriv-com/translations';
import type { JournalEntry } from '../types';

interface JournalListProps {
    entries: JournalEntry[];
    decimalPlaces: number | null;
}

const formatPrice = (value: number | null, decimalPlaces: number | null) =>
    value === null ? '—' : value.toFixed(decimalPlaces ?? 2);

/** The active mode's own journal. It never mixes in another mode's trades. */
const JournalList = ({ entries, decimalPlaces }: JournalListProps) => {
    if (entries.length === 0) {
        return (
            <p className='rise-fall__empty' data-testid='rise-fall-journal-empty'>
                {localize('No trades in this mode yet.')}
            </p>
        );
    }

    return (
        <ul className='rise-fall__journal' data-testid='rise-fall-journal'>
            {entries.slice(0, 8).map(entry => (
                <li className='rise-fall__journal-row' key={entry.id} data-testid='rise-fall-journal-row'>
                    <span className={`rise-fall__tag rise-fall__tag--${entry.status}`}>
                        {entry.source} · {entry.status.toUpperCase()}
                    </span>
                    <span className='rise-fall__journal-main'>
                        {entry.symbol} · {entry.direction === 'rise' ? 'RISE' : 'FALL'} ·{' '}
                        {formatPrice(entry.entryQuote, decimalPlaces)} → {formatPrice(entry.exitQuote, decimalPlaces)}
                    </span>
                    <span
                        className={`rise-fall__journal-profit ${entry.profit !== null && entry.profit < 0 ? 'is-loss' : ''}`}
                    >
                        {entry.profit === null
                            ? localize('open')
                            : `${entry.profit > 0 ? '+' : ''}${entry.profit.toFixed(2)} ${entry.currency}`}
                        {entry.estimated && <em> · {localize('ESTIMATED')}</em>}
                    </span>
                </li>
            ))}
        </ul>
    );
};

export default JournalList;
