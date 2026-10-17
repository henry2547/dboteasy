/** Ranked eligible markets with the measurements and reasons behind each. */

import type { BotState, MarketScan } from '../scanner-types';

function fmtPct(n: number): string {
    return `${n.toFixed(0)}%`;
}

export default function MarketRankings({
    rankings,
    topMarket,
    state,
}: {
    rankings: MarketScan[];
    topMarket: MarketScan | null;
    state: BotState;
}) {
    const list = rankings.slice(0, 6);

    return (
        <article className='scanner-card'>
            <h3 className='scanner-card__title'>
                Market scanner {rankings.length > 0 ? `· ${rankings.length} markets` : ''}
            </h3>

            {list.length === 0 ? (
                <p className='scanner-card__muted'>
                    {state === 'Scanning' ? 'Scanning eligible markets…' : 'No market data yet — connect the feed.'}
                </p>
            ) : (
                <div className='scanner-rank'>
                    {list.map((scan, index) => (
                        <div
                            key={scan.symbol}
                            className={`scanner-rank__item${scan === topMarket ? ' scanner-rank__item--top' : ''}`}
                        >
                            <div className='scanner-rank__head'>
                                <span className='scanner-rank__name'>
                                    {index === 0 ? '★ ' : ''}
                                    {scan.displayName}
                                    <span className='scanner-card__muted'> · {scan.category}</span>
                                </span>
                                <span className='scanner-rank__score'>{scan.score.toFixed(1)}</span>
                            </div>

                            <div className='scanner-rank__freq'>
                                {scan.frequencies.map((pct, digit) => (
                                    <div key={digit} className='scanner-rank__bar' title={`Digit ${digit}: ${pct.toFixed(1)}%`}>
                                        {digit}
                                    </div>
                                ))}
                            </div>

                            <div className='scanner-card__muted' style={{ fontSize: '1rem' }}>
                                Sample {scan.sampleSize} · MAD {scan.meanAbsoluteDeviation.toFixed(1)} ·
                                stability {scan.frequencyStability.toFixed(0)}% ·
                                feed {scan.feedAgeMs !== null ? `${Math.round(scan.feedAgeMs / 1000)}s` : '—'}
                            </div>

                            {scan.qualifyingStrategies.length > 0 && (
                                <div className='scanner-rank__strategies'>
                                    {scan.qualifyingStrategies.map(s => (
                                        <span key={s} className='scanner-tag'>{s}</span>
                                    ))}
                                </div>
                            )}

                            {scan.reasons.length > 0 && (
                                <ul className='scanner-rank__reasons'>
                                    {scan.reasons.slice(0, 4).map((reason, i) => (
                                        <li key={i}>{reason}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {topMarket && state === 'Scanning' && topMarket.qualifyingStrategies.length === 0 && (
                <p className='scanner-card__muted' style={{ marginTop: '0.8rem' }}>
                    No qualifying setup — waiting for evidence.
                </p>
            )}
        </article>
    );
}
