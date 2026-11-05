import { formatPercent } from '../format';
import type { AdaptiveSignal, RulePerformance } from '../types';

interface StrategyPanelProps {
    performance: RulePerformance[];
    signals: AdaptiveSignal[];
}

/** Educational hit-rates plus the adaptive entry signals derived from recent ticks. */
export default function StrategyPanel({ performance, signals }: StrategyPanelProps) {
    return (
        <section className='digits-panel'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Strategy learning</h3>
                <span className='digits-panel__note'>Hit-rate + adaptive entries</span>
            </header>

            <div className='digits-strategies'>
                {performance.map(rule => {
                    const signal = signals.find(item => item.id === rule.id);
                    return (
                        <article key={rule.id} className='digits-strategy'>
                            <div className='digits-strategy__head'>
                                <h4 className='digits-strategy__label'>{rule.label}</h4>
                                {signal && (
                                    <span
                                        className={
                                            'digits-signal ' +
                                            (signal.recommendation === 'enter'
                                                ? 'digits-signal--enter'
                                                : 'digits-signal--skip')
                                        }
                                    >
                                        {signal.recommendation === 'enter' ? 'Enter' : 'Skip'} ·{' '}
                                        {Math.round(signal.confidence)}%
                                    </span>
                                )}
                            </div>

                            <div className='digits-strategy__rate'>
                                <div className='digits-strategy__rate-bar'>
                                    <span
                                        className='digits-strategy__rate-fill'
                                        style={{ width: `${Math.min(rule.winRate ?? 0, 100)}%` }}
                                    />
                                </div>
                                <span className='digits-strategy__rate-value'>{formatPercent(rule.winRate)}</span>
                            </div>

                            <ul className='digits-strategy__stats'>
                                <li>
                                    Wins <strong>{rule.wins}</strong>
                                </li>
                                <li>
                                    Losses <strong>{rule.losses}</strong>
                                </li>
                                <li>
                                    Recent <strong>{formatPercent(rule.recentWinRate)}</strong>
                                </li>
                                <li>
                                    Streak{' '}
                                    <strong>
                                        {rule.winStreak > 0 ? `${rule.winStreak}W` : `${rule.lossStreak}L`}
                                    </strong>
                                </li>
                            </ul>

                            {signal && <p className='digits-strategy__reason'>{signal.reason}</p>}
                        </article>
                    );
                })}
            </div>

            <p className='digits-disclaimer'>
                Educational analysis of the public feed — not a prediction or trading advice.
            </p>
        </section>
    );
}
