import { formatPercent } from '../format';
import type { BacktestResult } from '../types';

interface BacktestPanelProps {
    results: BacktestResult[];
}

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 28;

/** Walk-forward results: entries decided from past ticks, outcomes read from the next tick. */
export default function BacktestPanel({ results }: BacktestPanelProps) {
    return (
        <section className='digits-panel'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Walk-forward backtest</h3>
                <span className='digits-panel__note'>No lookahead · outcome on the next tick</span>
            </header>

            <div className='digits-backtest'>
                {results.map(result => (
                    <article key={result.id} className='digits-backtest__row'>
                        <div className='digits-backtest__label'>
                            <strong>{result.label}</strong>
                            <span>{result.trades} entries</span>
                        </div>

                        <Sparkline points={result.equityCurve} />

                        <dl className='digits-backtest__metrics'>
                            <div>
                                <dt>Win rate</dt>
                                <dd>{formatPercent(result.winRate)}</dd>
                            </div>
                            <div>
                                <dt>W / L</dt>
                                <dd>
                                    {result.wins} / {result.losses}
                                </dd>
                            </div>
                            <div>
                                <dt>Best streak</dt>
                                <dd>{result.bestWinStreak}W</dd>
                            </div>
                            <div>
                                <dt>Worst run</dt>
                                <dd>{result.longestLossStreak}L</dd>
                            </div>
                        </dl>
                    </article>
                ))}
            </div>
        </section>
    );
}

function Sparkline({ points }: { points: number[] }) {
    if (points.length < 2) {
        return <span className='digits-backtest__spark digits-backtest__spark--empty'>Not enough data</span>;
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;

    const path = points
        .map((value, index) => {
            const x = (index / (points.length - 1)) * SPARK_WIDTH;
            const y = SPARK_HEIGHT - ((value - min) / span) * SPARK_HEIGHT;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg className='digits-backtest__spark' viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} aria-hidden='true'>
            <path d={path} className='digits-backtest__spark-line' />
        </svg>
    );
}
