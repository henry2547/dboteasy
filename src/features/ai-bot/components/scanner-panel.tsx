/**
 * Scanner panel — live market scanner showing ranked eligible markets with
 * their scores, conditions passed/failed, and AI explanations.
 *
 * Scan results are collapsible: each market row can be expanded/collapsed to
 * reveal its detailed conditions, and a master toggle collapses/expands all.
 */

import { useState } from 'react';
import { useAiBotContext } from '../ai-bot-context';

export default function ScannerPanel() {
    const bot = useAiBotContext();
    const { state, runScanNow } = bot;
    const { rankings, isScanning, scanError } = state;

    const qualifying = rankings.filter(r => r.qualifies);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [allCollapsed, setAllCollapsed] = useState(false);

    const toggleRow = (symbol: string) => {
        setCollapsed(prev => ({ ...prev, [symbol]: !prev[symbol] }));
    };

    const toggleAll = () => {
        if (allCollapsed) {
            setCollapsed({});
            setAllCollapsed(false);
        } else {
            const next: Record<string, boolean> = {};
            rankings.forEach(r => { next[r.symbol] = true; });
            setCollapsed(next);
            setAllCollapsed(true);
        }
    };

    return (
        <section className='aibot-panel'>
            <div className='aibot-panel__header'>
                <h3 className='aibot-panel__title'>Live Market Scanner</h3>
                <div className='aibot-panel__header-actions'>
                    {rankings.length > 0 && (
                        <button
                            type='button'
                            className='aibot-btn aibot-btn--sm'
                            onClick={toggleAll}
                        >
                            {allCollapsed ? 'Expand all' : 'Collapse all'}
                        </button>
                    )}
                    <button
                        type='button'
                        className='aibot-btn aibot-btn--sm aibot-btn--primary'
                        onClick={runScanNow}
                        disabled={isScanning}
                    >
                        {isScanning ? 'Scanning…' : 'Scan now'}
                    </button>
                </div>
            </div>

            {scanError && <p className='aibot-banner aibot-banner--error'>{scanError}</p>}

            {rankings.length === 0 && !isScanning && (
                <p className='aibot-empty'>No markets scanned yet. Click "Scan now" to evaluate all volatility markets.</p>
            )}

            {rankings.length > 0 && qualifying.length === 0 && !isScanning && (
                <p className='aibot-empty aibot-empty--warning'>No qualifying setup. The scanner is waiting for conditions to align.</p>
            )}

            {rankings.length > 0 && (
                <div className='aibot-scanner-summary'>
                    <span className='aibot-scanner-summary__count'>{rankings.length} markets</span>
                    <span className='aibot-scanner-summary__sep'>·</span>
                    <span className='aibot-scanner-summary__qualify'>{qualifying.length} qualifying</span>
                </div>
            )}

            <div className='aibot-scanner'>
                {rankings.map((ranking, i) => {
                    const isCollapsed = collapsed[ranking.symbol] ?? false;
                    return (
                        <article
                            key={ranking.symbol}
                            className={`aibot-scan-row ${ranking.qualifies ? 'aibot-scan-row--qualifies' : ''}`}
                        >
                            <button
                                type='button'
                                className='aibot-scan-row__head'
                                onClick={() => toggleRow(ranking.symbol)}
                                aria-expanded={!isCollapsed}
                            >
                                <span className='aibot-scan-row__rank'>#{i + 1}</span>
                                <span className='aibot-scan-row__name'>{ranking.displayName}</span>
                                <span className='aibot-scan-row__category'>{ranking.category}</span>
                                <span className='aibot-scan-row__score'>Score: {ranking.score}</span>
                                {ranking.qualifies ? (
                                    <span className='aibot-badge aibot-badge--success'>Qualifies</span>
                                ) : (
                                    <span className='aibot-badge aibot-badge--muted'>No setup</span>
                                )}
                                <span className={`aibot-scan-row__chevron ${isCollapsed ? '' : 'aibot-scan-row__chevron--open'}`}>
                                    {isCollapsed ? '▸' : '▾'}
                                </span>
                            </button>

                            {!isCollapsed && ranking.qualifies && (
                                <div className='aibot-scan-row__detail'>
                                    <p className='aibot-scan-row__strategy'>
                                        Strategy: <strong>{ranking.strategyLabel}</strong>
                                        {ranking.proposedDigit !== null && ` — digit ${ranking.proposedDigit}`}
                                        {ranking.proposedBarrier !== null && ` — barrier ${ranking.proposedBarrier}`}
                                    </p>
                                    <p className='aibot-scan-row__reason'>{ranking.reason}</p>

                                    <div className='aibot-scan-row__conditions'>
                                        <div className='aibot-scan-row__conditions-group'>
                                            <span className='aibot-scan-row__conditions-label'>Passed:</span>
                                            {ranking.conditionsPassed.map(c => (
                                                <span key={c.id} className='aibot-condition aibot-condition--pass'>
                                                    {c.label}: {c.value}
                                                </span>
                                            ))}
                                            {ranking.conditionsPassed.length === 0 && (
                                                <span className='aibot-condition aibot-condition--muted'>None</span>
                                            )}
                                        </div>
                                        <div className='aibot-scan-row__conditions-group'>
                                            <span className='aibot-scan-row__conditions-label'>Failed:</span>
                                            {ranking.conditionsFailed.map(c => (
                                                <span key={c.id} className='aibot-condition aibot-condition--fail'>
                                                    {c.label}: {c.detail}
                                                </span>
                                            ))}
                                            {ranking.conditionsFailed.length === 0 && (
                                                <span className='aibot-condition aibot-condition--muted'>None</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className='aibot-scan-row__freq'>
                                        {ranking.analysis.frequencies.map(f => (
                                            <span
                                                key={f.digit}
                                                className={`aibot-freq ${f.isMostFrequent ? 'aibot-freq--hot' : ''} ${f.isLeastFrequent ? 'aibot-freq--cold' : ''}`}
                                                title={`Digit ${f.digit}: ${f.percentage.toFixed(1)}% (dev ${f.deviationFromExpected.toFixed(1)}%)`}
                                            >
                                                {f.digit}
                                            </span>
                                        ))}
                                        <span className='aibot-scan-row__sample'>
                                            n={ranking.analysis.sampleSize}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!isCollapsed && !ranking.qualifies && (
                                <div className='aibot-scan-row__detail'>
                                    <p className='aibot-scan-row__reason'>{ranking.reason}</p>
                                    <div className='aibot-scan-row__freq'>
                                        {ranking.analysis.frequencies.map(f => (
                                            <span
                                                key={f.digit}
                                                className={`aibot-freq ${f.isMostFrequent ? 'aibot-freq--hot' : ''} ${f.isLeastFrequent ? 'aibot-freq--cold' : ''}`}
                                                title={`Digit ${f.digit}: ${f.percentage.toFixed(1)}% (dev ${f.deviationFromExpected.toFixed(1)}%)`}
                                            >
                                                {f.digit}
                                            </span>
                                        ))}
                                        <span className='aibot-scan-row__sample'>
                                            n={ranking.analysis.sampleSize}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
