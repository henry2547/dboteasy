import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import { strategyLabel } from '../strategies';
import type { RiseFallSignal, StrategyId } from '../types';

interface StrategyRankingProps {
    signals: RiseFallSignal[];
    strategyId: StrategyId;
    onSelect: (id: StrategyId) => void;
}

const score = (signal: RiseFallSignal) => Math.max(signal.riseScore, signal.fallScore);

/** All eight readings for the same tick, best first. Picking a row selects that strategy. */
const StrategyRanking = ({ signals, strategyId, onSelect }: StrategyRankingProps) => {
    const ranked = signals
        .slice()
        .sort((a, b) => Number(b.suitable) - Number(a.suitable) || score(b) - score(a));

    return (
        <section className='rise-fall__section' data-testid='rise-fall-ranking'>
            <div className='rise-fall__section-head'>
                <h3>{localize('Strategies right now')}</h3>
                <span className='rise-fall__status'>{localize('live')}</span>
            </div>
            <p className='rise-fall__note'>
                {localize(
                    'Every strategy read the same tick. Only the selected one may enter; the rest are shown so the choice is visible.'
                )}
            </p>
            <ul className='rise-fall__rank'>
                {ranked.map(signal => (
                    <li key={signal.strategyId}>
                        <button
                            type='button'
                            className={classNames('rise-fall__rank-row', {
                                'is-selected': signal.strategyId === strategyId,
                            })}
                            data-testid={`rise-fall-rank-${signal.strategyId}`}
                            onClick={() => onSelect(signal.strategyId)}
                        >
                            <span className='rise-fall__rank-name'>{strategyLabel(signal.strategyId)}</span>
                            <span
                                className={classNames('rise-fall__tag', {
                                    'rise-fall__tag--won': signal.direction === 'rise',
                                    'rise-fall__tag--lost': signal.direction === 'fall',
                                })}
                            >
                                {signal.direction === 'none' ? 'NO TRADE' : signal.direction.toUpperCase()}
                            </span>
                            <span className='rise-fall__rank-score'>{score(signal)}</span>
                            <span
                                className={classNames('rise-fall__rank-state', {
                                    'is-ready': signal.suitable,
                                })}
                            >
                                {signal.suitable ? localize('entry allowed') : localize('no entry')}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default StrategyRanking;
