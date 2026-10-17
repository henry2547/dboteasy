/**
 * Trade monitor — the AI Bot's live trade views: Summary (open positions with
 * their current contract status and live profit/loss), Transactions (every
 * position the bot opened and closed, with its settlement result) and Journal.
 */

import { useState } from 'react';
import { useAiBotContext } from '../ai-bot-context';
import type { SessionStats, TradePosition } from '../types';
import AnalysisView from './analysis-view';
import JournalPanel from './journal-panel';

type MonitorTab = 'summary' | 'transactions' | 'analysis' | 'journal';

const TAB_LABELS: Record<MonitorTab, string> = {
    summary: 'Summary',
    transactions: 'Transactions',
    analysis: 'Analysis',
    journal: 'Journal',
};

/** Signed money for display; em dash while a value is still unknown. */
function money(value: number | null, currency: string | null): string {
    if (value === null) return '—';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

function toneOf(value: number | null): string {
    if (value === null || value === 0) return '';
    return value > 0 ? 'aibot-positive' : 'aibot-negative';
}

export default function TradeMonitor() {
    const { state } = useAiBotContext();
    const [tab, setTab] = useState<MonitorTab>('summary');

    const { positions, session, auth } = state;
    const open = positions.filter(p => p.status === 'open');

    return (
        <section className='aibot-panel'>
            <div className='aibot-panel__header'>
                <h3 className='aibot-panel__title'>Trade Monitor</h3>
                <span className='aibot-badge aibot-badge--muted'>
                    {open.length} open
                </span>
            </div>

            <div className='aibot-tabs' role='tablist'>
                {(Object.keys(TAB_LABELS) as MonitorTab[]).map(id => (
                    <button
                        key={id}
                        type='button'
                        role='tab'
                        aria-selected={tab === id}
                        className={`aibot-tab${tab === id ? ' aibot-tab--active' : ''}`}
                        onClick={() => setTab(id)}
                    >
                        {TAB_LABELS[id]}
                        {id === 'transactions' && positions.length > 0 ? ` (${positions.length})` : ''}
                    </button>
                ))}
            </div>

            {tab === 'summary' && <SummaryView open={open} session={session} currency={auth.currency} />}
            {tab === 'transactions' && <TransactionsView positions={positions} currency={auth.currency} />}
            {tab === 'analysis' && <AnalysisView />}
            {tab === 'journal' && <JournalPanel />}
        </section>
    );
}

function SummaryView({
    open,
    session,
    currency,
}: {
    open: TradePosition[];
    session: SessionStats;
    currency: string | null;
}) {
    return (
        <>
            <div className='aibot-dashboard__stats'>
                <Stat label='Open positions' value={String(open.length)} />
                <Stat label='Closed' value={String(session.tradeCount)} />
                <Stat label='Won / Lost' value={`${session.winCount} / ${session.lossCount}`} />
                <Stat
                    label='Realized P/L'
                    value={money(session.realizedProfit, currency)}
                    tone={session.realizedProfit > 0 ? 'positive' : session.realizedProfit < 0 ? 'negative' : 'neutral'}
                />
            </div>

            {open.length === 0 ? (
                <p className='aibot-empty'>
                    No open positions. A position appears here as soon as the bot buys a contract, and keeps
                    updating with its current contract status and profit/loss until it settles.
                </p>
            ) : (
                <div className='aibot-contracts'>
                    {open.map(position => (
                        <article key={position.contractId} className='aibot-contract'>
                            <div className='aibot-contract__head'>
                                <span className='aibot-contract__id'>#{position.contractId}</span>
                                <span className='aibot-contract__type'>{position.contractType}</span>
                                <span className='aibot-contract__symbol'>{position.symbol}</span>
                                {position.strategyLabel && (
                                    <span className='aibot-contract__symbol'>{position.strategyLabel}</span>
                                )}
                                <span className='aibot-badge aibot-badge--success'>
                                    {position.contractStatus ?? 'open'}
                                </span>
                            </div>
                            <div className='aibot-contract__body'>
                                <span>Stake: {position.stake.toFixed(2)}</span>
                                <span>Payout: {position.payout.toFixed(2)}</span>
                                <span className={toneOf(position.profit)}>P/L: {money(position.profit, currency)}</span>
                                {position.entrySpot !== null && <span>Entry: {position.entrySpot}</span>}
                                {position.currentSpot !== null && <span>Now: {position.currentSpot}</span>}
                                <span>{position.isValidToSell ? 'Can be closed early' : 'Running to expiry'}</span>
                                <span className='aibot-txn__meta'>
                                    {position.accountMode.toUpperCase()} · opened{' '}
                                    {new Date(position.openedAt).toLocaleTimeString()}
                                </span>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </>
    );
}

function TransactionsView({ positions, currency }: { positions: TradePosition[]; currency: string | null }) {
    // The ledger holds trades from both trading accounts; let the user isolate one.
    const [accountFilter, setAccountFilter] = useState<'all' | 'demo' | 'real'>('all');

    if (positions.length === 0) {
        return (
            <p className='aibot-empty'>
                No positions yet. Every contract the bot opens is listed here with its contract status and, once it
                closes, its settlement result.
            </p>
        );
    }

    const countOf = (mode: 'demo' | 'real') => positions.filter(p => p.accountMode === mode).length;
    const filtered = accountFilter === 'all' ? positions : positions.filter(p => p.accountMode === accountFilter);
    const rows = [...filtered].sort((a, b) => b.openedAt - a.openedAt);

    return (
        <>
            <div className='aibot-txn-filter'>
                {(['all', 'demo', 'real'] as const).map(id => (
                    <button
                        key={id}
                        type='button'
                        className={`aibot-btn aibot-btn--sm${accountFilter === id ? ' aibot-btn--active' : ''}`}
                        onClick={() => setAccountFilter(id)}
                    >
                        {id === 'all' ? 'All' : id === 'demo' ? 'Demo' : 'Real'} (
                        {id === 'all' ? positions.length : countOf(id)})
                    </button>
                ))}
            </div>
            <div className='aibot-txn'>
            {rows.map(position => {
                const isOpen = position.status === 'open';
                const outcome = position.settlement === 'pending' ? 'settled' : position.settlement;
                return (
                    <article key={position.contractId} className={`aibot-txn__row aibot-txn__row--${isOpen ? 'open' : outcome}`}>
                        <span className='aibot-txn__id'>#{position.contractId}</span>
                        <span className='aibot-txn__meta'>
                            {position.symbol} · {position.contractType}
                            {position.strategyLabel ? ` · ${position.strategyLabel}` : ''}
                        </span>
                        <span className='aibot-txn__meta'>
                            {position.accountMode.toUpperCase()}
                            {position.loginid ? ` ${position.loginid}` : ''} · stake {position.stake.toFixed(2)} · payout{' '}
                            {position.payout.toFixed(2)}
                        </span>
                        <span className='aibot-txn__meta'>
                            {isOpen
                                ? `running · opened ${new Date(position.openedAt).toLocaleTimeString()}`
                                : `closed ${new Date(position.settledAt ?? position.openedAt).toLocaleTimeString()}`}
                            {position.contractStatus ? ` · contract status: ${position.contractStatus}` : ''}
                        </span>
                        <span className='aibot-txn__status'>
                            <span className={`aibot-badge ${isOpen ? 'aibot-badge--success' : 'aibot-badge--muted'}`}>
                                {isOpen ? 'open' : 'settled'}
                            </span>
                            <span
                                className={`aibot-badge ${
                                    !isOpen && outcome === 'won'
                                        ? 'aibot-badge--success'
                                        : !isOpen && outcome === 'lost'
                                          ? 'aibot-badge--danger'
                                          : 'aibot-badge--muted'
                                }`}
                            >
                                {isOpen ? 'pending' : outcome}
                            </span>
                        </span>
                        <span className={`aibot-txn__pnl ${toneOf(position.profit)}`}>
                            {money(position.profit, currency)}
                        </span>
                    </article>
                );
            })}
            </div>
        </>
    );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: string }) {
    return (
        <div className={`aibot-stat aibot-stat--${tone}`}>
            <span className='aibot-stat__label'>{label}</span>
            <span className='aibot-stat__value'>{value}</span>
        </div>
    );
}
