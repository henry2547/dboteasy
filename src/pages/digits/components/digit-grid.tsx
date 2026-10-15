import { formatCount, formatPercent, formatSigned } from '../format';
import type { DigitStatistics } from '../types';

interface DigitGridProps {
    statistics: DigitStatistics;
}

export default function DigitGrid({ statistics }: DigitGridProps) {
    const hasSample = statistics.sampleSize > 0;

    return (
        <section className='digits-panel'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Digit frequency</h3>
                <span className='digits-panel__note'>
                    {hasSample ? `${formatCount(statistics.sampleSize)} ticks in window` : 'Waiting for ticks'}
                </span>
            </header>

            <div className='digits-grid'>
                {statistics.frequencies.map(frequency => {
                    const tie =
                        hasSample && statistics.frequencies.filter(item => item.count === frequency.count).length > 1;

                    return (
                        <article
                            key={frequency.digit}
                            className={
                                'digits-card' +
                                (frequency.isMostFrequent ? ' digits-card--top' : '') +
                                (frequency.isLeastFrequent ? ' digits-card--low' : '')
                            }
                        >
                            <span className='digits-card__digit'>{frequency.digit}</span>
                            <span className='digits-card__percent'>{formatPercent(frequency.percentage)}</span>
                            <span className='digits-card__count'>{formatCount(frequency.count)} ticks</span>
                            <span
                                className={
                                    'digits-card__deviation ' +
                                    (frequency.deviationFromExpected >= 0
                                        ? 'digits-card__deviation--up'
                                        : 'digits-card__deviation--down')
                                }
                            >
                                {formatSigned(frequency.deviationFromExpected)} pts
                            </span>
                            <span className='digits-card__rank'>Rank {frequency.rank}</span>
                            {(frequency.isMostFrequent || frequency.isLeastFrequent) && (
                                <span className='digits-card__badges'>
                                    {frequency.isMostFrequent && <em className='digits-badge'>Most</em>}
                                    {frequency.isLeastFrequent && <em className='digits-badge'>Least</em>}
                                    {tie && <em className='digits-badge digits-badge--tie'>Tie</em>}
                                </span>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
