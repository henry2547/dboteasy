/**
 * Digit frequency cards — 10 cards (0-9) showing count, percentage,
 * rank, and deviation from expected 10%.
 */

import React from 'react';
import { useDigitsLab } from '../store';

const DigitFrequencyCards: React.FC = () => {
    const { statistics } = useDigitsLab();

    if (statistics.sampleSize === 0) {
        return <div className="dl-digit-cards dl-digit-cards--empty">No data yet</div>;
    }

    return (
        <div className="dl-digit-cards">
            {statistics.frequencies.map((freq) => (
                <div
                    key={freq.digit}
                    className={`dl-digit-card ${freq.isMostFrequent ? 'dl-digit-card--hot' : ''} ${freq.isLeastFrequent ? 'dl-digit-card--cold' : ''}`}
                >
                    <div className="dl-digit-card__digit">{freq.digit}</div>
                    <div className="dl-digit-card__count">{freq.count}</div>
                    <div className="dl-digit-card__pct">{freq.percentage.toFixed(1)}%</div>
                    <div className="dl-digit-card__deviation">
                        {freq.deviationFromExpected >= 0 ? '+' : ''}
                        {freq.deviationFromExpected.toFixed(1)}
                    </div>
                    <div className="dl-digit-card__rank">#{freq.rank}</div>
                    {freq.isMostFrequent && <span className="dl-digit-card__badge dl-digit-card__badge--hot">HOT</span>}
                    {freq.isLeastFrequent && <span className="dl-digit-card__badge dl-digit-card__badge--cold">COLD</span>}
                </div>
            ))}
        </div>
    );
};

export default DigitFrequencyCards;
