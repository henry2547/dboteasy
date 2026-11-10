import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import { REGIME_LABELS } from '../regime';
import { STRATEGY_DEFINITIONS, type StrategyConfig } from '../strategies';
import type { RiseFallSignal, StrategyId } from '../types';

interface StrategyPanelProps {
    signal: RiseFallSignal;
    strategyId: StrategyId;
    config: StrategyConfig;
    durationTicks: number;
    onSelect: (id: StrategyId) => void;
    onConfig: (patch: Partial<StrategyConfig>) => void;
    onDuration: (ticks: number) => void;
}

const CONFIG_FIELDS: Array<{ field: keyof StrategyConfig; label: string; min: number }> = [
    { field: 'fastPeriod', label: 'Fast EMA', min: 2 },
    { field: 'mediumPeriod', label: 'Medium EMA', min: 3 },
    { field: 'slowPeriod', label: 'Slow EMA', min: 5 },
    { field: 'minScore', label: 'Entry score', min: 1 },
    { field: 'confirmationTicks', label: 'Confirmation ticks', min: 2 },
];

/** The selected strategy's live reading, its components and its parameters. */
const StrategyPanel = ({
    signal,
    strategyId,
    config,
    durationTicks,
    onSelect,
    onConfig,
    onDuration,
}: StrategyPanelProps) => {
    const definition = STRATEGY_DEFINITIONS.find(item => item.id === strategyId);

    return (
        <section className='rise-fall__section' data-testid='rise-fall-strategy'>
            <div className='rise-fall__section-head'>
                <h3>{localize('Strategy')}</h3>
                <span
                    className={classNames('rise-fall__tag', {
                        'rise-fall__tag--won': signal.direction === 'rise',
                        'rise-fall__tag--lost': signal.direction === 'fall',
                    })}
                    data-testid='rise-fall-direction'
                >
                    {signal.direction === 'none' ? 'NO TRADE' : signal.direction === 'rise' ? 'RISE' : 'FALL'}
                </span>
            </div>

            <select
                className='rise-fall__select'
                data-testid='rise-fall-strategy-select'
                aria-label={localize('Strategy')}
                value={strategyId}
                onChange={event => onSelect(event.target.value as StrategyId)}
            >
                {STRATEGY_DEFINITIONS.map(item => (
                    <option key={item.id} value={item.id}>
                        {item.label}
                    </option>
                ))}
            </select>
            {definition && <p className='rise-fall__note'>{definition.blurb}</p>}

            <div className='rise-fall__scores'>
                <div className='rise-fall__score'>
                    <span>
                        {localize('Rise')} · <b data-testid='rise-fall-rise-score'>{signal.riseScore}</b>
                    </span>
                    <div className='rise-fall__bar'>
                        <span className='rise-fall__bar-fill is-rise' style={{ width: `${signal.riseScore}%` }} />
                    </div>
                </div>
                <div className='rise-fall__score'>
                    <span>
                        {localize('Fall')} · <b data-testid='rise-fall-fall-score'>{signal.fallScore}</b>
                    </span>
                    <div className='rise-fall__bar'>
                        <span className='rise-fall__bar-fill is-fall' style={{ width: `${signal.fallScore}%` }} />
                    </div>
                </div>
            </div>

            <p className='rise-fall__regime' data-testid='rise-fall-regime'>
                {localize('Regime')}: <b>{REGIME_LABELS[signal.regime] ?? signal.regime}</b>
                {signal.direction !== 'none' && !signal.suitable && ` · ${localize('not suitable — no entry')}`}
            </p>
            <p className='rise-fall__explanation' data-testid='rise-fall-explanation'>
                {signal.explanation}
            </p>

            <ul className='rise-fall__contributions'>
                {signal.contributions.map(item => (
                    <li key={item.id}>
                        <span>{item.label}</span>
                        <b>
                            {item.score.toFixed(0)}/{item.weight.toFixed(0)}
                        </b>
                        <em>{item.detail}</em>
                    </li>
                ))}
            </ul>

            <div className='rise-fall__grid'>
                {CONFIG_FIELDS.map(({ field, label, min }) => (
                    <label className='rise-fall__field' key={field} htmlFor={`rise-fall-${field}`}>
                        <span>{localize(label)}</span>
                        <input
                            id={`rise-fall-${field}`}
                            data-testid={`rise-fall-config-${field}`}
                            type='number'
                            min={min}
                            value={config[field] as number}
                            onChange={event => onConfig({ [field]: Number(event.target.value) })}
                        />
                    </label>
                ))}
                <label className='rise-fall__field' htmlFor='rise-fall-duration'>
                    <span>{localize('Duration (ticks)')}</span>
                    <input
                        id='rise-fall-duration'
                        data-testid='rise-fall-duration'
                        type='number'
                        min={1}
                        max={300}
                        value={durationTicks}
                        onChange={event => onDuration(Number(event.target.value))}
                    />
                </label>
            </div>
        </section>
    );
};

export default StrategyPanel;
