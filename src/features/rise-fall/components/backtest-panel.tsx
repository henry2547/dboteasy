import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import type { BacktestResult } from '../backtest';
import { BREAK_EVEN_WIN_RATE, BACKTEST_PAYOUT_RATE } from '../backtest';

interface BacktestPanelProps {
    results: BacktestResult[] | null;
    notice: string | null;
    onRun: () => void;
}

const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

/**
 * Walk-forward ranking over the ticks the feed already holds. Every figure is an
 * ESTIMATE at one stated payout — it is never presented as a real return.
 */
const BacktestPanel = ({ results, notice, onRun }: BacktestPanelProps) => (
    <section className='rise-fall__section' data-testid='rise-fall-backtest'>
        <div className='rise-fall__section-head'>
            <h3>{localize('Backtest & ranking')}</h3>
            <span className='rise-fall__status'>{localize('ESTIMATED')}</span>
        </div>
        <p className='rise-fall__note'>
            {localize(
                `Walk-forward over the same genuine ticks: an entry decides on one tick and settles a fixed number of ticks later, never looking ahead. Payout is the stated ${(
                    BACKTEST_PAYOUT_RATE * 100
                ).toFixed(0)}% assumption, so a strategy needs more than ${(BREAK_EVEN_WIN_RATE * 100).toFixed(
                    1
                )}% wins just to break even.`
            )}
        </p>
        <button type='button' className='rise-fall__button is-primary' data-testid='rise-fall-backtest-run' onClick={onRun}>
            {localize('Run the walk-forward ranking')}
        </button>
        {notice && (
            <p className='rise-fall__note' data-testid='rise-fall-backtest-notice'>
                {notice}
            </p>
        )}
        {results && (
            <div className='rise-fall__table-wrap'>
                <table className='rise-fall__table' data-testid='rise-fall-backtest-table'>
                    <thead>
                        <tr>
                            <th scope='col'>#</th>
                            <th scope='col'>{localize('Strategy')}</th>
                            <th scope='col'>{localize('Trades')}</th>
                            <th scope='col'>{localize('Wins')}</th>
                            <th scope='col'>{localize('Win rate')}</th>
                            <th scope='col'>{localize('Edge')}</th>
                            <th scope='col'>{localize('Net')}</th>
                            <th scope='col'>{localize('Drawdown')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((row, index) => (
                            <tr
                                key={row.strategyId}
                                className={classNames({ 'is-qualified': row.qualified })}
                                data-testid={`rise-fall-backtest-${row.strategyId}`}
                            >
                                <td>{index + 1}</td>
                                <td>
                                    {row.label}
                                    {!row.qualified && <em> · {localize('too few trades')}</em>}
                                </td>
                                <td>{row.trades}</td>
                                <td>
                                    {row.wins}/{row.losses}
                                </td>
                                <td>{percent(row.winRate)}</td>
                                <td>{row.edge === null ? '—' : `${(row.edge * 100).toFixed(1)}`}</td>
                                <td>{row.netProfit.toFixed(2)}</td>
                                <td>{row.maxDrawdown.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </section>
);

export default BacktestPanel;
