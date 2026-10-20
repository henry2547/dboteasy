/**
 * Market results: every market the last scan read, with search, sorting and
 * filtering, an expandable detail view, and the honest list of what was not
 * read. Each row's Load Bot button is the existing scanner → Bot Builder row
 * (`ScannerBotResult`), so the strategy a row shows is the only one it can load.
 */

import { useMemo, useState } from 'react';
import ScannerBotResult from '@/pages/free-bots/components/scanner-bot-result';
import { formatAge, formatClock, formatCount, formatPercent } from '../format';
import type { MarketScan, MarketScanFailure, ScanSummary } from '../scan-markets';
import type { MarketSymbol } from '../types';

interface MarketResultsTableProps {
    results: MarketScan[];
    failures: MarketScanFailure[];
    summary: ScanSummary | null;
    isScanning: boolean;
    selectedMarket: MarketSymbol | null;
    onPick: (market: MarketSymbol) => void;
    onScan: () => void;
}

type SortKey = 'score' | 'market' | 'losing' | 'trend' | 'status' | 'scanned';
type StatusFilter = 'all' | 'qualified' | 'unqualified' | 'insufficient';
type StrategyFilter = 'all' | 'over1' | 'under8';

const statusRank: Record<MarketScan['setup']['status'], number> = {
    qualified: 0,
    unqualified: 1,
    insufficient: 2,
};

const trendRank: Record<string, number> = { improving: 0, stable: 1, unknown: 2, deteriorating: 3 };

const FAILURE_TONE: Record<MarketScanFailure['status'], string> = {
    failed: 'error',
    insufficient: 'warn',
    skipped: 'idle',
};

const FAILURE_LABEL: Record<MarketScanFailure['status'], string> = {
    failed: 'Failed',
    insufficient: 'Too few ticks',
    skipped: 'Not scanned',
};

export default function MarketResultsTable({
    results,
    failures,
    summary,
    isScanning,
    selectedMarket,
    onPick,
    onScan,
}: MarketResultsTableProps) {
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('score');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [strategy, setStrategy] = useState<StrategyFilter>('all');
    const [expanded, setExpanded] = useState<string | null>(null);

    const barriers = useMemo(
        () => Array.from(new Set(results.map(result => result.setup.barrier).filter((n): n is number => n !== null))),
        [results]
    );

    const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const filtered = results.filter(result => {
            if (strategy !== 'all' && result.setup.strategy !== strategy) return false;
            if (status !== 'all' && result.setup.status !== status) return false;
            if (!needle) return true;
            return (
                result.market.displayName.toLowerCase().includes(needle) ||
                result.market.apiSymbol.toLowerCase().includes(needle)
            );
        });

        const sorted = [...filtered];
        sorted.sort((a, b) => {
            switch (sortKey) {
                case 'market':
                    return a.market.displayName.localeCompare(b.market.displayName);
                case 'losing': {
                    const left = a.setup.combinedLosingPercentage ?? Number.POSITIVE_INFINITY;
                    const right = b.setup.combinedLosingPercentage ?? Number.POSITIVE_INFINITY;
                    return left - right;
                }
                case 'trend':
                    return (trendRank[a.setup.trend.direction] ?? 9) - (trendRank[b.setup.trend.direction] ?? 9);
                case 'status':
                    return statusRank[a.setup.status] - statusRank[b.setup.status] || b.score - a.score;
                case 'scanned':
                    return b.scannedAt - a.scannedAt;
                default:
                    return b.score - a.score;
            }
        });
        return sorted;
    }, [results, query, sortKey, status, strategy]);

    const selectedSymbol = selectedMarket?.apiSymbol ?? null;

    return (
        <section className='dash-section' aria-labelledby='dash-results-heading'>
            <header className='dash-section__head'>
                <h3 className='dash-section__title' id='dash-results-heading'>
                    Market results
                </h3>
                <span className='dash-section__note'>
                    {summary
                        ? `${formatCount(results.length)} of ${formatCount(summary.totalMarkets)} markets scanned · ${formatCount(summary.qualifiedSetups)} qualifying`
                        : 'No scan yet'}
                </span>
            </header>

            <div className='dash-filters'>
                <label className='dash-field'>
                    <span className='dash-field__label'>Search</span>
                    <input
                        type='search'
                        className='dash-field__input'
                        placeholder='Market name or symbol'
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                    />
                </label>

                <label className='dash-field'>
                    <span className='dash-field__label'>Sort by</span>
                    <select
                        className='dash-field__input'
                        value={sortKey}
                        onChange={event => setSortKey(event.target.value as SortKey)}
                    >
                        <option value='score'>Rank (best score first)</option>
                        <option value='status'>Qualification</option>
                        <option value='losing'>Combined losing %</option>
                        <option value='trend'>Trend</option>
                        <option value='market'>Market name</option>
                        <option value='scanned'>Most recently scanned</option>
                    </select>
                </label>

                <label className='dash-field'>
                    <span className='dash-field__label'>Strategy</span>
                    <select
                        className='dash-field__input'
                        value={strategy}
                        onChange={event => setStrategy(event.target.value as StrategyFilter)}
                    >
                        <option value='all'>All strategies</option>
                        <option value='over1'>Over 1</option>
                        <option value='under8'>Under 8</option>
                    </select>
                </label>

                <label className='dash-field'>
                    <span className='dash-field__label'>Qualification</span>
                    <select
                        className='dash-field__input'
                        value={status}
                        onChange={event => setStatus(event.target.value as StatusFilter)}
                    >
                        <option value='all'>All results</option>
                        <option value='qualified'>Qualified only</option>
                        <option value='unqualified'>Not qualified</option>
                        <option value='insufficient'>Insufficient data</option>
                    </select>
                </label>
            </div>

            {barriers.length > 0 && (
                <p className='dash-section__note'>
                    Barriers found in this scan: {barriers.map(barrier => `Over/Under ${barrier}`).join(' · ')}
                </p>
            )}

            {isScanning && results.length === 0 && (
                <p className='dash-empty'>Scanning every eligible market — results appear here as they arrive.</p>
            )}

            {!isScanning && results.length === 0 && (
                <div className='dash-empty dash-empty--block'>
                    <p className='dash-empty__title'>
                        {summary ? 'No market returned a usable sample.' : 'No market results yet.'}
                    </p>
                    <p className='dash-empty__body'>
                        {summary
                            ? 'Every eligible market failed or returned too few ticks — the reasons are listed below.'
                            : 'Run a scan to rank every eligible volatility market by how orderly its digits are.'}
                    </p>
                    <button type='button' className='dash-button dash-button--primary' onClick={onScan}>
                        {summary ? 'Scan again' : 'Scan all markets'}
                    </button>
                </div>
            )}

            {results.length > 0 && rows.length === 0 && (
                <p className='dash-empty'>No market matches the current search or filters.</p>
            )}

            {rows.length > 0 && (
                <div className='dash-table' role='table' aria-label='Scanned markets'>
                    <div className='dash-table__head' role='row'>
                        <span role='columnheader'>Market</span>
                        <span role='columnheader'>Strategy</span>
                        <span role='columnheader'>Barrier</span>
                        <span role='columnheader'>Combined losing digits</span>
                        <span role='columnheader'>Trend</span>
                        <span role='columnheader'>Qualification</span>
                        <span role='columnheader'>Score</span>
                        <span role='columnheader' aria-label='Details' />
                    </div>

                    {rows.map(result => {
                        const symbol = result.market.apiSymbol;
                        const isOpen = expanded === symbol;
                        const trend = result.setup.trend;

                        return (
                            <div className='dash-table__row-wrap' key={symbol}>
                                <div className={`dash-table__row${isOpen ? ' dash-table__row--open' : ''}`} role='row'>
                                    <span className='dash-table__cell dash-table__cell--market' role='cell' data-label='Market'>
                                        <button
                                            type='button'
                                            className='dash-table__market'
                                            onClick={() => onPick(result.market)}
                                            aria-label={`Select ${result.market.displayName}`}
                                        >
                                            {result.market.displayName}
                                        </button>
                                        <span className='dash-table__symbol'>{symbol}</span>
                                        <span className='dash-table__meta'>
                                            {formatCount(result.digits.length)} ticks · scanned {formatAge(result.scannedAt)}
                                            {symbol === selectedSymbol ? ' · selected' : ''}
                                        </span>
                                    </span>

                                    <span className='dash-table__cell' role='cell' data-label='Strategy'>
                                        {result.setup.strategy ? (
                                            <span className='dash-chip'>{result.setup.strategyLabel}</span>
                                        ) : (
                                            '—'
                                        )}
                                    </span>

                                    <span className='dash-table__cell' role='cell' data-label='Barrier'>
                                        {result.setup.barrier === null
                                            ? '—'
                                            : `${result.setup.strategy === 'under8' ? 'Under' : 'Over'} ${result.setup.barrier}`}
                                    </span>

                                    <span className='dash-table__cell' role='cell' data-label='Combined losing digits'>
                                        <strong>{formatPercent(result.setup.combinedLosingPercentage)}</strong>
                                        {result.setup.losingDigits.length > 0 && (
                                            <span className='dash-table__meta'>
                                                digits {result.setup.losingDigits.join(', ')} ·{' '}
                                                {formatPercent(result.setup.expectedLosingPercentage, 0)} expected
                                            </span>
                                        )}
                                    </span>

                                    <span className='dash-table__cell' role='cell' data-label='Trend'>
                                        <span className={`dash-chip dash-chip--trend-${trend.direction}`}>
                                            {trend.direction === 'unknown'
                                                ? 'No trend'
                                                : trend.direction === 'improving'
                                                  ? 'Improving'
                                                  : trend.direction === 'deteriorating'
                                                    ? 'Worsening'
                                                    : 'Stable'}
                                        </span>
                                    </span>

                                    <span className='dash-table__cell' role='cell' data-label='Qualification'>
                                        <span className={`dash-chip dash-chip--${result.setup.status}`}>
                                            {result.setup.statusLabel}
                                        </span>
                                        <span className='dash-table__meta'>
                                            {result.setup.armed ? 'Entry digit hit' : 'Waiting for entry digit'}
                                        </span>
                                    </span>

                                    <span className='dash-table__cell dash-table__cell--score' role='cell' data-label='Score'>
                                        {result.score}
                                    </span>

                                    <span className='dash-table__cell dash-table__cell--actions' role='cell'>
                                        <button
                                            type='button'
                                            className='dash-button'
                                            aria-expanded={isOpen}
                                            aria-controls={`dash-detail-${symbol}`}
                                            onClick={() => setExpanded(isOpen ? null : symbol)}
                                        >
                                            {isOpen ? 'Hide' : 'Details'}
                                        </button>
                                    </span>
                                </div>

                                {isOpen && (
                                    <div className='dash-detail' id={`dash-detail-${symbol}`}>
                                        <div className='dash-detail__facts'>
                                            <p className='dash-detail__line'>
                                                <span className='dash-detail__label'>Scanned</span> tick sample of{' '}
                                                {formatCount(result.digits.length)} at{' '}
                                                {formatClock(result.scannedAt / 1000)} ({formatAge(result.scannedAt)})
                                            </p>
                                            <p className='dash-detail__line'>
                                                <span className='dash-detail__label'>Latest digit</span>{' '}
                                                {result.digits.length ? result.digits[result.digits.length - 1] : '—'}
                                            </p>
                                            <p className='dash-detail__line'>
                                                <span className='dash-detail__label'>Trend</span> {trend.label}
                                            </p>
                                            <p className='dash-detail__line'>
                                                <span className='dash-detail__label'>Combined losing digits</span>{' '}
                                                {formatPercent(result.setup.combinedLosingPercentage)} on digits{' '}
                                                {result.setup.losingDigits.length
                                                    ? result.setup.losingDigits.join(', ')
                                                    : '—'}{' '}
                                                ({formatPercent(result.setup.expectedLosingPercentage, 0)} expected on a
                                                fair wheel)
                                            </p>
                                        </div>

                                        <div className='dash-digits' aria-label='Digit frequencies'>
                                            {result.statistics.frequencies.map(frequency => (
                                                <div className='dash-digits__item' key={frequency.digit}>
                                                    <span className='dash-digits__digit'>{frequency.digit}</span>
                                                    <span className='dash-digits__bar'>
                                                        <span
                                                            className={
                                                                'dash-digits__fill' +
                                                                (result.setup.losingDigits.includes(frequency.digit)
                                                                    ? ' dash-digits__fill--losing'
                                                                    : '')
                                                            }
                                                            style={{ height: `${Math.min(100, frequency.percentage * 4)}%` }}
                                                        />
                                                    </span>
                                                    <span className='dash-digits__value'>
                                                        {formatPercent(frequency.percentage, 1)}
                                                    </span>
                                                    <span className='dash-digits__count'>{frequency.count}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <ScannerBotResult
                                            result={result}
                                            selected={symbol === selectedSymbol}
                                            onPick={() => onPick(result.market)}
                                            onLoaded={() => setExpanded(null)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {failures.length > 0 && !isScanning && (
                <details className='dash-failures' open={summary?.scannedMarkets === 0}>
                    <summary className='dash-failures__summary'>
                        {formatCount(failures.length)} market{failures.length === 1 ? '' : 's'} not included in the
                        results
                    </summary>
                    <ul className='dash-failures__list'>
                        {failures.map(failure => (
                            <li className='dash-failures__item' key={`${failure.market.apiSymbol}-${failure.status}`}>
                                <span className={`dash-chip dash-chip--${FAILURE_TONE[failure.status]}`}>
                                    {FAILURE_LABEL[failure.status]}
                                </span>
                                <span className='dash-failures__market'>{failure.market.displayName}</span>
                                <span className='dash-failures__symbol'>{failure.market.apiSymbol}</span>
                                <span className='dash-failures__reason'>{failure.reason}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
