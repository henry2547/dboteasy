import { buildMarketConditions } from '../market-conditions';
import type { DigitStatistics } from '../types';

interface MarketConditionsPanelProps {
    statistics: DigitStatistics;
    /** The digits of the current analysis window, oldest first — the drift check reads the newest 100. */
    recentDigits?: number[];
}

/**
 * A plain-language read of the five digit markets right now — Over 1, Over 2,
 * Under 7, Under 8 and Even/Odd — with the entry guidance for each of them.
 */
export default function MarketConditionsPanel({ statistics, recentDigits = [] }: MarketConditionsPanelProps) {
    const condition = buildMarketConditions(statistics, recentDigits);

    return (
        <section className={`digits-panel digits-conditions digits-conditions--${condition.tone}`}>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Market conditions</h3>
                <span className='digits-panel__note'>Over/Under · Even/Odd · last 100-tick drift</span>
            </header>

            <div className='digits-conditions__headline'>
                <span className={`digits-conditions__pill digits-conditions__pill--${condition.tone}`}>
                    {condition.headline}
                </span>
                <span className='digits-conditions__score'>
                    Clean markets <strong>{condition.score}</strong>%
                </span>
            </div>

            <p className='digits-conditions__summary'>{condition.summary}</p>

            <ul className='digits-conditions__list'>
                {condition.items.map(item => (
                    <li key={item.label} className={`digits-conditions__item digits-conditions__item--${item.tone}`}>
                        <div className='digits-conditions__item-head'>
                            <span className='digits-conditions__item-label'>{item.label}</span>
                            <span className='digits-conditions__item-value'>{item.value}</span>
                        </div>
                        <p className='digits-conditions__item-detail'>{item.detail}</p>
                    </li>
                ))}
            </ul>

            <div className='digits-conditions__guidance'>
                <h4 className='digits-conditions__guidance-title'>Entry guidance</h4>
                <ul>
                    {condition.entryGuidance.map(line => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
