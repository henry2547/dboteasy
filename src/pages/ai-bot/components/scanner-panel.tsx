/**
 * Scanner panel — live market scanner showing ranked eligible markets with
 * their scores, conditions passed/failed, and AI explanations.
 */

import { useAiBotContext } from '../ai-bot-context';

export default function ScannerPanel() {
    const bot = useAiBotContext();
    const { state, runScanNow } = bot;
    const { rankings, isScanning, scanError } = state;

    const qualifying = rankings.filter(r => r.qualifies);

    return (
        <section className='aibot-panel'>
            <div className='aibot-panel__header'>
                <h3 className='aibot-panel__title'>Live Market Scanner</h3>
                <button
                    type='button'
                    className='aibot-btn aibot-btn--sm'
                    onClick={runScanNow}
                    disabled={isScanning}
                >
                    {isScanning ? 'Scanning…' : 'Scan now'}
                </button>
            </div>

            {scanError && <p className='aibot-banner aibot-banner--error'>{scanError}</p>}

            {rankings.length === 0 && !isScanning && (
                <p className='aibot-empty'>No markets scanned yet. Click "Scan now" to evaluate all volatility markets.</p>
            )}

            {rankings.length > 0 && qualifying.length === 0 && !isScanning && (
                <p className='aibot-empty aibot-empty--warning'>No qualifying setup. The scanner is waiting for conditions to align.</p>
            )}

            <div className='aibot-scanner'>
                {rankings.map((ranking, i) => (
                    <article
                        key={ranking.symbol}
                        className={`aibot-scan-row ${ranking.qualifies ? 'aibot-scan-row--qualifies' : ''}`}
                    >
                        <div className='aibot-scan-row__head'>
                            <span className='aibot-scan-row__rank'>#{i + 1}</span>
                            <span className='aibot-scan-row__name'>{ranking.displayName}</span>
                            <span className='aibot-scan-row__category'>{ranking.category}</span>
                            <span className='aibot-scan-row__score'>Score: {ranking.score}</span>
                            {ranking.qualifies ? (
                                <span className='aibot-badge aibot-badge--success'>Qualifies</span>
                            ) : (
                                <span className='aibot-badge aibot-badge--muted'>No setup</span>
                            )}
                        </div>

                        {ranking.qualifies && (
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
                    </article>
                ))}
            </div>
        </section>
    );
}
