import { useMemo, useState } from 'react';
import { tradeSourceLabel } from '../config';
import type { EngineJournalEntry, EngineStatus, EngineTrade, SessionMetrics, TradeSource } from '../types';

interface ReportingPanelProps {
    trades: EngineTrade[];
    journal: EngineJournalEntry[];
    session: SessionMetrics;
    status: EngineStatus;
    winRate: number;
    currency: string;
}

type ReportTab = 'summary' | 'transactions' | 'journal';
const TABS: Array<{ id: ReportTab; label: string }> = [
    { id: 'summary', label: 'Summary' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'journal', label: 'Journal' },
];

const SOURCE_OPTIONS: Array<{ value: 'all' | TradeSource; label: string }> = [
    { value: 'all', label: 'GUI Trading Engine (all)' },
    { value: 'gui_over1', label: 'Over 1' },
    { value: 'gui_under8', label: 'Under 8' },
    { value: 'gui_recovery', label: 'Even/Odd recovery' },
];

function toDateInput(value: number | null): string {
    if (!value) return '';
    return new Date(value).toISOString().slice(0, 10);
}

function settled(trade: EngineTrade): boolean {
    return trade.status === 'settled';
}

function formatTime(value: number | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, { hour12: false });
}

/**
 * Engine-level reporting. Purchases also go to the app's shared Summary and
 * Transactions (the same stores the Blockly bot uses); this panel adds the
 * engine-specific filters the brief asks for.
 */
export default function ReportingPanel({ trades, journal, session, status, winRate, currency }: ReportingPanelProps) {
    const [tab, setTab] = useState<ReportTab>('summary');
    const [source, setSource] = useState<'all' | TradeSource>('all');
    const [market, setMarket] = useState('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [query, setQuery] = useState('');

    const markets = useMemo(() => {
        const unique = new Set<string>();
        trades.forEach(trade => unique.add(trade.marketName));
        return Array.from(unique).sort();
    }, [trades]);

    const filteredTrades = useMemo(() => {
        const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
        const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;

        return trades
            .filter(trade => (source === 'all' ? true : trade.source === source))
            .filter(trade => (market === 'all' ? true : trade.marketName === market))
            .filter(trade => (fromTime === null ? true : trade.entryAt >= fromTime))
            .filter(trade => (toTime === null ? true : trade.entryAt <= toTime))
            .slice()
            .reverse();
    }, [trades, source, market, from, to]);

    const filteredJournal = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
        const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;

        return journal
            .filter(entry => (source === 'all' ? true : entry.strategy.toLowerCase().includes(source === 'gui_over1' ? 'over' : source === 'gui_under8' ? 'under' : 'even')))
            .filter(entry => (market === 'all' ? true : entry.market === market))
            .filter(entry => (fromTime === null ? true : entry.at >= fromTime))
            .filter(entry => (toTime === null ? true : entry.at <= toTime))
            .filter(entry => (needle ? `${entry.message} ${entry.strategy} ${entry.type}`.toLowerCase().includes(needle) : true))
            .slice()
            .reverse();
    }, [journal, source, market, from, to, query]);

    const summary = useMemo(() => {
        const rows = filteredTrades.filter(settled);
        const wins = rows.filter(trade => trade.outcome === 'won').length;
        const losses = rows.filter(trade => trade.outcome === 'lost').length;
        const totalStake = rows.reduce((total, trade) => total + trade.stake, 0);
        const profit = rows.reduce((total, trade) => total + (trade.profit ?? 0), 0);
        const settledCount = wins + losses;

        return {
            total: filteredTrades.length,
            primary: filteredTrades.filter(trade => trade.source !== 'gui_recovery').length,
            recovery: filteredTrades.filter(trade => trade.source === 'gui_recovery').length,
            wins,
            losses,
            winRate: settledCount === 0 ? 0 : (wins / settledCount) * 100,
            totalStake,
            profit,
        };
    }, [filteredTrades]);

    return (
        <section className='ge-panel' aria-label='Engine reporting'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Reporting</h3>
                <span className='ge-panel__meta'>Also mirrored into the app Summary, Transactions and Journal</span>
            </header>

            <div className='ge-tabs' role='tablist'>
                {TABS.map(item => (
                    <button
                        key={item.id}
                        type='button'
                        role='tab'
                        aria-selected={tab === item.id}
                        className={`ge-tabs__btn${tab === item.id ? ' ge-tabs__btn--active' : ''}`}
                        onClick={() => setTab(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className='ge-filters'>
                <label className='ge-field ge-field--inline'>
                    <span className='ge-field__label'>Source</span>
                    <select
                        className='ge-input'
                        value={source}
                        onChange={event => setSource(event.target.value as 'all' | TradeSource)}
                    >
                        {SOURCE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='ge-field ge-field--inline'>
                    <span className='ge-field__label'>Market</span>
                    <select className='ge-input' value={market} onChange={event => setMarket(event.target.value)}>
                        <option value='all'>All markets</option>
                        {markets.map(name => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='ge-field ge-field--inline'>
                    <span className='ge-field__label'>From</span>
                    <input className='ge-input' type='date' value={from} onChange={event => setFrom(event.target.value)} />
                </label>
                <label className='ge-field ge-field--inline'>
                    <span className='ge-field__label'>To</span>
                    <input className='ge-input' type='date' value={to} onChange={event => setTo(event.target.value)} />
                </label>
                {tab === 'journal' && (
                    <label className='ge-field ge-field--inline ge-field--grow'>
                        <span className='ge-field__label'>Search</span>
                        <input
                            className='ge-input'
                            type='search'
                            value={query}
                            placeholder='Pair, reason, contract…'
                            onChange={event => setQuery(event.target.value)}
                        />
                    </label>
                )}
            </div>

            {tab === 'summary' && (
                <div className='ge-report'>
                    <div className='ge-report__grid'>
                        <div className='ge-report__item'>
                            <span>Total engine trades</span>
                            <strong>{summary.total}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Primary trades</span>
                            <strong>{summary.primary}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Recovery trades</span>
                            <strong>{summary.recovery}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Wins</span>
                            <strong>{summary.wins}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Losses</span>
                            <strong>{summary.losses}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Win rate</span>
                            <strong>{summary.winRate.toFixed(1)}%</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Total stake</span>
                            <strong>
                                {summary.totalStake.toFixed(2)} {currency}
                            </strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Total profit / loss</span>
                            <strong className={summary.profit > 0 ? 'ge-good' : summary.profit < 0 ? 'ge-bad' : ''}>
                                {summary.profit > 0 ? '+' : ''}
                                {summary.profit.toFixed(2)} {currency}
                            </strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Session P/L</span>
                            <strong className={session.profit > 0 ? 'ge-good' : session.profit < 0 ? 'ge-bad' : ''}>
                                {session.profit > 0 ? '+' : ''}
                                {session.profit.toFixed(2)}
                            </strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Engine status</span>
                            <strong>{status}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Consecutive losses</span>
                            <strong>{session.consecutiveLosses}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Recovery attempts</span>
                            <strong>{session.recoveryAttempts}</strong>
                        </div>
                        <div className='ge-report__item'>
                            <span>Overall win rate</span>
                            <strong>{winRate.toFixed(1)}%</strong>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'transactions' && (
                <div className='ge-table-wrap'>
                    <table className='ge-table ge-table--wide'>
                        <thead>
                            <tr>
                                <th scope='col'>Tx</th>
                                <th scope='col'>Contract</th>
                                <th scope='col'>Market</th>
                                <th scope='col'>Type</th>
                                <th scope='col'>Source</th>
                                <th scope='col'>Stake</th>
                                <th scope='col'>Buy</th>
                                <th scope='col'>Sell</th>
                                <th scope='col'>Entry</th>
                                <th scope='col'>Settlement</th>
                                <th scope='col'>Outcome</th>
                                <th scope='col'>P/L</th>
                                <th scope='col'>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTrades.length === 0 && (
                                <tr>
                                    <td colSpan={13} className='ge-table__empty'>
                                        No confirmed purchases in this filter yet.
                                    </td>
                                </tr>
                            )}
                            {filteredTrades.map(trade => (
                                <tr key={trade.id}>
                                    <td className='ge-mono'>{trade.transactionId ?? '—'}</td>
                                    <td className='ge-mono'>{trade.contractId ?? '—'}</td>
                                    <td>{trade.marketName}</td>
                                    <td className='ge-mono'>
                                        {trade.contractType}
                                        {trade.barrier !== null ? ` ${trade.barrier}` : ''}
                                    </td>
                                    <td>{tradeSourceLabel(trade.source)}</td>
                                    <td>{trade.stake.toFixed(2)}</td>
                                    <td>{trade.buyPrice === null ? '—' : trade.buyPrice.toFixed(2)}</td>
                                    <td>{trade.sellPrice === null ? '—' : trade.sellPrice.toFixed(2)}</td>
                                    <td>{formatTime(trade.entryAt)}</td>
                                    <td>{formatTime(trade.settlementAt)}</td>
                                    <td>
                                        <span
                                            className={`ge-pill ge-pill--${
                                                trade.outcome === 'won' ? 'pass' : trade.outcome === 'lost' ? 'fail' : 'idle'
                                            }`}
                                        >
                                            {trade.outcome}
                                        </span>
                                    </td>
                                    <td className={trade.profit && trade.profit > 0 ? 'ge-good' : trade.profit && trade.profit < 0 ? 'ge-bad' : ''}>
                                        {trade.profit === null ? '—' : trade.profit.toFixed(2)}
                                    </td>
                                    <td>{trade.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'journal' && (
                <ul className='ge-journal'>
                    {filteredJournal.length === 0 && <li className='ge-journal__empty'>No journal entries yet.</li>}
                    {filteredJournal.map(entry => (
                        <li key={entry.id} className={`ge-journal__item ge-journal__item--${entry.level}`}>
                            <div className='ge-journal__head'>
                                <span className='ge-journal__time'>
                                    {new Date(entry.at).toLocaleTimeString(undefined, { hour12: false })}
                                </span>
                                <span className='ge-journal__strategy'>{entry.strategy}</span>
                                <span className='ge-journal__type'>{entry.type}</span>
                            </div>
                            <p className='ge-journal__message'>{entry.message}</p>
                            <span className='ge-journal__market'>{entry.market}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
