/**
 * Strategy Analysis — the "learning" program results.
 *
 * Shows barrier strategies (Over 1, Over 2, Under 8, Under 7)
 * and Even/Odd strategies with win rates, streaks, and trends.
 * The program "learns" by tracking patterns across the tick window.
 */

import React from 'react';
import { useDigitsLab } from '../store';
import type { StrategyResult } from '../types';

const StrategyCard: React.FC<{ result: StrategyResult }> = ({ result }) => {
    const trendIcon = result.trend === 'improving' ? '📈' : result.trend === 'declining' ? '📉' : '➡';
    const trendClass = result.trend === 'improving' ? 'dl-strategy-trend--up' : result.trend === 'declining' ? 'dl-strategy-trend--down' : 'dl-strategy-trend--stable';

    return (
        <div className="dl-strategy-card">
            <div className="dl-strategy-card__header">
                <h4>{result.name}</h4>
                <span className={`dl-strategy-trend ${trendClass}`}>
                    {trendIcon} {result.trend}
                </span>
            </div>
            <p className="dl-strategy-card__desc">{result.description}</p>
            <div className="dl-strategy-card__stats">
                <div className="dl-strategy-stat">
                    <span className="dl-strategy-stat__label">Win Rate</span>
                    <span className="dl-strategy-stat__value">{result.winRate.toFixed(1)}%</span>
                </div>
                <div className="dl-strategy-stat">
                    <span className="dl-strategy-stat__label">Wins</span>
                    <span className="dl-strategy-stat__value dl-strategy-stat__value--win">{result.wins}</span>
                </div>
                <div className="dl-strategy-stat">
                    <span className="dl-strategy-stat__label">Losses</span>
                    <span className="dl-strategy-stat__value dl-strategy-stat__value--loss">{result.losses}</span>
                </div>
                <div className="dl-strategy-stat">
                    <span className="dl-strategy-stat__label">Entries</span>
                    <span className="dl-strategy-stat__value">{result.totalEntries}</span>
                </div>
            </div>
            <div className="dl-strategy-card__streaks">
                <span title="Current streak (positive = winning)">
                    Streak: <strong>{result.currentStreak > 0 ? `W${result.currentStreak}` : result.currentStreak < 0 ? `L${Math.abs(result.currentStreak)}` : '—'}</strong>
                </span>
                <span title="Longest winning streak">
                    Best Win: <strong>{result.longestWinStreak}</strong>
                </span>
                <span title="Longest losing streak">
                    Worst Loss: <strong>{result.longestLossStreak}</strong>
                </span>
            </div>
            {/* Recent results sparkline */}
            <div className="dl-strategy-card__recent">
                {result.recentResults.map((r, i) => (
                    <span
                        key={i}
                        className={`dl-strategy-dot dl-strategy-dot--${r}`}
                        title={r === 'win' ? 'Win' : 'Loss'}
                    />
                ))}
            </div>
            {/* Win rate bar */}
            <div className="dl-strategy-card__bar">
                <div className="dl-strategy-card__bar-fill" style={{ width: `${result.winRate}%` }} />
            </div>
        </div>
    );
};

const StrategyAnalysis: React.FC = () => {
    const { barrierStrategies, evenOddStrategies, statistics } = useDigitsLab();

    if (statistics.sampleSize === 0) {
        return (
            <section className="dl-section dl-strategies">
                <h2>Strategy Learning Results</h2>
                <p className="dl-section__empty">Waiting for tick data to evaluate strategies…</p>
            </section>
        );
    }

    return (
        <section className="dl-section dl-strategies">
            <h2>Strategy Learning Results</h2>
            <p className="dl-section__desc">
                The program learns from {statistics.sampleSize} ticks and evaluates each strategy's
                historical performance. Results update live as new ticks arrive.
            </p>

            <h3 className="dl-strategies__subtitle">Barrier Entries</h3>
            <div className="dl-strategy-grid">
                {barrierStrategies.map((s) => (
                    <StrategyCard key={s.id} result={s} />
                ))}
            </div>

            <h3 className="dl-strategies__subtitle">Even / Odd Markets</h3>
            <div className="dl-strategy-grid">
                {evenOddStrategies.map((s) => (
                    <StrategyCard key={s.id} result={s} />
                ))}
            </div>
        </section>
    );
};

export default StrategyAnalysis;
