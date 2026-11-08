import { useState } from 'react';
import { ENGINE_WINDOW, PRIMARY_DIGIT_CEILING, PRIMARY_STRATEGIES, strategiesFor } from '../config';
import type { DigitWindowStats, FrequencyPermission, PrimaryStrategyId, StrategySelection } from '../types';

interface DigitFrequencyPanelProps {
    stats: DigitWindowStats;
    parityEvenPercent: number;
    strategy: StrategySelection;
    permission: Partial<Record<PrimaryStrategyId, FrequencyPermission>>;
    lastTickAt: number | null;
    isDataFresh: boolean;
    isHistoryLoading: boolean;
    precisionLabel: string;
}

const CELL_COUNT = 10;

/**
 * Live individual-digit frequencies against the 10.2% ceiling. The digits the
 * selected strategy trades against are shown by default; the rest expand on
 * demand.
 */
export default function DigitFrequencyPanel({
    stats,
    parityEvenPercent,
    strategy,
    permission,
    lastTickAt,
    isDataFresh,
    isHistoryLoading,
    precisionLabel,
}: DigitFrequencyPanelProps) {
    const [expanded, setExpanded] = useState(false);
    const strategies = strategiesFor(strategy);
    const relevantDigits = new Set<number>();
    strategies.forEach(id => PRIMARY_STRATEGIES[id].filterDigits.forEach(digit => relevantDigits.add(digit)));

    const digits = expanded ? Array.from({ length: CELL_COUNT }, (_, index) => index) : Array.from(relevantDigits).sort();

    const lastUpdate = lastTickAt
        ? new Date(lastTickAt).toLocaleTimeString(undefined, { hour12: false })
        : 'No tick yet';

    return (
        <section className='ge-panel' aria-label='Digit frequency'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Digit frequency · rolling {ENGINE_WINDOW} ticks</h3>
                <button type='button' className='ge-link' onClick={() => setExpanded(value => !value)}>
                    {expanded ? 'Show strategy digits only' : 'Show all digits'}
                </button>
            </header>

            <div className='ge-table-wrap'>
                <table className='ge-table'>
                    <thead>
                        <tr>
                            <th scope='col'>Digit</th>
                            <th scope='col'>Frequency</th>
                            <th scope='col'>Threshold</th>
                            <th scope='col'>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {digits.map(digit => {
                            const owner = strategies.find(id => PRIMARY_STRATEGIES[id].filterDigits.includes(digit));
                            const percent = stats.percent[digit] ?? 0;
                            const failing = percent > PRIMARY_DIGIT_CEILING;
                            return (
                                <tr key={digit} className={failing ? 'ge-table__row--warn' : ''}>
                                    <th scope='row'>{digit}</th>
                                    <td>
                                        <span className='ge-bar'>
                                            <span
                                                className='ge-bar__fill'
                                                style={{ width: `${Math.min(100, percent * 4)}%` }}
                                                aria-hidden='true'
                                            />
                                        </span>
                                        <span className='ge-mono'>{percent.toFixed(2)}%</span>
                                    </td>
                                    <td className='ge-mono'>{PRIMARY_DIGIT_CEILING}%</td>
                                    <td>
                                        <span className={`ge-pill ge-pill--${failing ? 'fail' : 'pass'}`}>
                                            {failing ? 'Fail' : 'Pass'}
                                        </span>
                                        {owner && (
                                            <span className='ge-table__owner'>{PRIMARY_STRATEGIES[owner].label}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className='ge-meta'>
                <span>
                    Window size <strong>{ENGINE_WINDOW}</strong>
                </span>
                <span>
                    Valid observations <strong>{stats.total}</strong>
                </span>
                <span>
                    Even share <strong>{parityEvenPercent.toFixed(1)}%</strong>
                </span>
                <span>
                    Last update <strong>{lastUpdate}</strong>
                </span>
                <span>
                    Data <strong>{isDataFresh ? 'fresh' : isHistoryLoading ? 'loading history' : 'stale'}</strong>
                </span>
                <span>
                    Precision <strong>{precisionLabel}</strong>
                </span>
            </div>

            {strategies.map(id => {
                const entry = permission[id];
                if (!entry) return null;
                return (
                    <p key={id} className={`ge-gate ge-gate--${entry.passed ? 'pass' : 'fail'}`}>
                        <strong>{PRIMARY_STRATEGIES[id].label}</strong>{' '}
                        {entry.passed
                            ? 'permission filter passed — both losing digits are at or below the ceiling.'
                            : entry.reason}
                    </p>
                );
            })}
        </section>
    );
}
