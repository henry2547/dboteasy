import { buildMarketConditions } from '../market-conditions';
import type { AdaptiveSignal, DigitStatistics } from '../types';

interface MarketConditionsPanelProps {
    statistics: DigitStatistics;
    signals: AdaptiveSignal[];
}

/**
 * A plain-language read of the market right now, built from the digit
 * statistics and the adaptive strategy learning, with the Over 2 / Over 1
 * entry guidance.
 */
export default function MarketConditionsPanel({ statistics, signals }: MarketConditionsPanelProps) {
    const condition = buildMarketConditions(statistics, signals);

    return (
        <section className={`digits-panel digits-conditions digits-conditions--${condition.tone}`}>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Market conditions</h3>
                <span className='digits-panel__note'>Behaviour + strategy learning</span>
            </header>

            <div className='digits-conditions__headline'>
                <span className={`digits-conditions__pill digits-conditions__pill--${condition.tone}`}>
                    {condition.headline}
                </span>
                <span className='digits-conditions__score'>
                    Readiness <strong>{condition.score}</strong>/100
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
