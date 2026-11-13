import { formatPercent } from '../format';
import type { DigitStatistics } from '../types';
import './digit-rank-strip.scss';

interface DigitRankStripProps {
    statistics: DigitStatistics;
}

type HeatRank = 'hot' | 'warm' | 'cool' | 'cold';

const RANK_CARDS: { heat: HeatRank; label: string; hint: string }[] = [
    { heat: 'hot', label: 'Hottest', hint: 'most frequent digit' },
    { heat: 'warm', label: '2nd hottest', hint: 'second most frequent' },
    { heat: 'cool', label: '2nd coldest', hint: 'second least frequent' },
    { heat: 'cold', label: 'Coldest', hint: 'least frequent digit' },
];

/**
 * The four heat ranks at a glance, directly under the page header: the hottest
 * digit, the second hottest, the second coldest and the coldest. It uses the
 * same four colours as the frequency grid (green, purple, yellow, red) so the
 * strip and the bubbles read as one key.
 */
export default function DigitRankStrip({ statistics }: DigitRankStripProps) {
    const hasSample = statistics.sampleSize > 0;

    const digitsFor = (heat: HeatRank): number[] => {
        switch (heat) {
            case 'hot':
                return statistics.mostFrequentDigits;
            case 'warm':
                return statistics.secondMostFrequentDigits;
            case 'cool':
                return statistics.secondLeastFrequentDigits;
            case 'cold':
                return statistics.leastFrequentDigits;
        }
    };

    return (
        <section className='digit-ranks' aria-label='Digit heat ranking'>
            {RANK_CARDS.map(card => {
                const digits = hasSample ? digitsFor(card.heat) : [];
                const lead = digits.length
                    ? statistics.frequencies.find(frequency => frequency.digit === digits[0])
                    : undefined;

                return (
                    <article key={card.heat} className={`digit-rank digit-rank--${card.heat}`}>
                        <span className='digit-rank__label'>{card.label}</span>
                        <span className='digit-rank__digits'>{digits.length ? digits.join(', ') : '—'}</span>
                        <span className='digit-rank__meta'>
                            {card.hint}
                            {lead ? ` · ${formatPercent(lead.percentage)}` : ''}
                        </span>
                    </article>
                );
            })}
        </section>
    );
}
