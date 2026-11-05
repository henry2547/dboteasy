import { filterText, indicatorText } from '../spec-model';
import type { AnalysisPlan, RealismPlan, StrategyLeg } from '../types';

const familyText = (leg: StrategyLeg): string =>
    leg.strategy === 'over' || leg.strategy === 'under' ? 'Over/Under' : leg.strategy === 'even' || leg.strategy === 'odd' ? 'Even/Odd' : 'Matches/Differs';

const analysisTools = (analysis: AnalysisPlan): string[] =>
    [
        analysis.rankMarkets ? 'Rank the discovered markets before the scan picks one' : null,
        analysis.bestParityMarket ? 'Measure every market and use the strongest even/odd split' : null,
        analysis.strategyReport ? 'Write the engine’s own per-strategy results when the session stops' : null,
    ].filter((item): item is string => !!item);

const realismTools = (realism: RealismPlan): string[] =>
    [
        realism.entryDelaySeconds + realism.entryJitterSeconds > 0
            ? `Wait ${realism.entryDelaySeconds}s${realism.entryJitterSeconds > 0 ? ` + up to ${realism.entryJitterSeconds}s random` : ''} before each entry`
            : null,
        realism.lossCooldownSeconds > 0 ? `${realism.lossCooldownSeconds}s pause after a losing contract` : null,
        realism.stakeJitterPercent > 0 ? `Stake varies by up to ${realism.stakeJitterPercent}% either way` : null,
    ].filter((item): item is string => !!item);

/**
 * The analysis tools of the generated bot, read straight from its spec: the custom strategy of each
 * entry rule (with its own entry digits, filters and indicators), the analysis blocks placed around
 * the entry, and the session pacing. Nothing here is a separate claim — each row is a field the
 * builder turns into a block.
 */
export function StrategyPlanPanel({ legs, analysis, realism }: { legs: StrategyLeg[]; analysis: AnalysisPlan; realism: RealismPlan }) {
    const tools = analysisTools(analysis);
    const pacing = realismTools(realism);

    return (
        <section className='aa-card' aria-labelledby='aa-plan-title'>
            <h3 id='aa-plan-title' className='aa-card__title'>
                Strategies, indicators & analysis{' '}
                <span className='aa-badge aa-badge--ok'>{legs.length === 1 ? 'One rule' : 'Two rules'}</span>
            </h3>

            <div className='aa-blocks__group'>
                <h4 className='aa-blocks__category'>Custom strategies</h4>
                <ul className='aa-plan'>
                    {legs.map((leg, index) => (
                        <li key={`${leg.label}-${index}`} className='aa-plan__row'>
                            <span className='aa-plan__name'>{leg.label}</span>
                            <span className='aa-plan__meta'>
                                {index === 0 ? 'Trades while winning' : 'Trades after a loss'} · {familyText(leg)} ·{' '}
                                {leg.digits.length ? `entry digit ${leg.digits.join(' or ')}` : 'contract rule entry'} · window {leg.filters.window} ticks
                            </span>
                            <span className='aa-plan__meta'>Filters: {filterText(leg.filters)}</span>
                            <span className='aa-plan__meta'>Indicators: {indicatorText(leg.indicators) || 'None'}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className='aa-blocks__group'>
                <h4 className='aa-blocks__category'>Analysis tools</h4>
                {tools.length ? (
                    <ul className='aa-list'>
                        {tools.map(tool => (
                            <li key={tool}>{tool}</li>
                        ))}
                    </ul>
                ) : (
                    <p className='aa-card__hint'>None requested — the bot only reads the entry rule it was given.</p>
                )}
            </div>

            <div className='aa-blocks__group'>
                <h4 className='aa-blocks__category'>Session realism</h4>
                {pacing.length ? (
                    <ul className='aa-list'>
                        {pacing.map(item => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                ) : (
                    <p className='aa-card__hint'>Off — the bot buys on the first qualifying tick at its planned stake. Ask for a realistic bot to pace the entries.</p>
                )}
            </div>
        </section>
    );
}
