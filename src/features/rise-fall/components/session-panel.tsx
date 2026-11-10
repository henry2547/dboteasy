import React from 'react';
import { localize } from '@deriv-com/translations';
import { VIRTUAL_PAYOUT_RATE } from '../execution-service';
import { MODE_LABELS } from '../types';
import type { ExecutionMode, JournalEntry, ModeSnapshot } from '../types';
import JournalList from './journal-list';

interface SessionPanelProps {
    mode: ExecutionMode;
    active: ModeSnapshot;
    journal: JournalEntry[];
    decimalPlaces: number | null;
    onClearJournal: () => void;
}

const price = (value: number | null, places: number | null) => (value === null ? '—' : value.toFixed(places ?? 2));

/** The active mode's own open contract, session figures and journal. */
const SessionPanel = ({ mode, active, journal, decimalPlaces, onClearJournal }: SessionPanelProps) => {
    const winRate =
        active.stats.wins + active.stats.losses > 0
            ? (active.stats.wins / (active.stats.wins + active.stats.losses)) * 100
            : null;
    const contract = active.openContract;

    return (
        <section className='rise-fall__section' data-testid='rise-fall-session'>
            <div className='rise-fall__section-head'>
                <h3>{localize('Open contract & session')}</h3>
                <span className='rise-fall__status'>{MODE_LABELS[mode]}</span>
            </div>

            {contract ? (
                <dl className='rise-fall__facts' data-testid='rise-fall-contract'>
                    <div>
                        <dt>{localize('Direction')}</dt>
                        <dd>{contract.direction === 'rise' ? 'RISE' : 'FALL'}</dd>
                    </div>
                    <div>
                        <dt>{localize('Source')}</dt>
                        <dd>
                            {contract.source}
                            {contract.contractId ? ` · ${contract.contractId}` : ''}
                            {contract.awaitingBroker ? ` · ${localize('sending…')}` : ''}
                        </dd>
                    </div>
                    <div>
                        <dt>{localize('Entry')}</dt>
                        <dd>{price(contract.entryQuote, decimalPlaces)}</dd>
                    </div>
                    <div>
                        <dt>{localize('Ticks left')}</dt>
                        <dd>
                            {contract.source === 'VIRTUAL'
                                ? contract.ticksRemaining
                                : `${contract.durationTicks} (${localize('Deriv settles')})`}
                        </dd>
                    </div>
                    <div>
                        <dt>{localize('Stake / payout')}</dt>
                        <dd>
                            {contract.stake.toFixed(2)} {contract.currency} ·{' '}
                            {contract.payout === null ? '—' : contract.payout.toFixed(2)}
                        </dd>
                    </div>
                </dl>
            ) : (
                <p className='rise-fall__empty' data-testid='rise-fall-no-contract'>
                    {localize('No open contract.')}
                </p>
            )}

            <dl className='rise-fall__facts'>
                <div>
                    <dt>{localize('Trades')}</dt>
                    <dd data-testid='rise-fall-trades'>{active.stats.trades}</dd>
                </div>
                <div>
                    <dt>{localize('Wins / losses')}</dt>
                    <dd>
                        {active.stats.wins} / {active.stats.losses}
                        {active.stats.ties > 0 && ` (${active.stats.ties} ${localize('ties')})`}
                    </dd>
                </div>
                <div>
                    <dt>{localize('Win rate')}</dt>
                    <dd>{winRate === null ? '—' : `${winRate.toFixed(0)}%`}</dd>
                </div>
                <div>
                    <dt>{localize('Net P/L')}</dt>
                    <dd data-testid='rise-fall-net'>
                        {active.stats.netProfit.toFixed(2)} {active.account.currency ?? ''}
                        {mode === 'virtual' && <em> · {localize('ESTIMATED')}</em>}
                    </dd>
                </div>
                <div>
                    <dt>{localize('Max drawdown')}</dt>
                    <dd>{active.stats.maxDrawdown.toFixed(2)}</dd>
                </div>
                <div>
                    <dt>{localize('Consecutive losses')}</dt>
                    <dd>{active.stats.consecutiveLosses}</dd>
                </div>
            </dl>

            <JournalList entries={journal} decimalPlaces={decimalPlaces} />
            <button
                type='button'
                className='rise-fall__button'
                data-testid='rise-fall-clear-journal'
                onClick={onClearJournal}
            >
                {localize('Clear this mode’s journal')}
            </button>

            <p className='rise-fall__disclaimer'>
                {localize(
                    `Rise/Fall contracts carry a house edge, so their expected value at typical stakes is negative. Risk limits cap losses — they do not create an edge. Virtual P/L is simulated against a stated payout assumption (${(
                        VIRTUAL_PAYOUT_RATE * 100
                    ).toFixed(0)}% on a win) and is labelled ESTIMATED. Automated real-money trading is your own responsibility.`
                )}
            </p>
        </section>
    );
};

export default SessionPanel;
