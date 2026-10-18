import { formatPercent, formatSigned } from '../format';
import type { WalkForwardReport } from '../engines';

interface WalkForwardPanelProps {
    report: WalkForwardReport;
}

const SPARK_WIDTH = 110;
const SPARK_HEIGHT = 26;

/** Engine E — the zero-lookahead walk-forward results, with the audit line on top. */
export default function WalkForwardPanel({ report }: WalkForwardPanelProps) {
    return (
        <section className='digits-panel digits-walkforward'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Zero-lookahead walk-forward</h3>
                <span className='digits-panel__note'>State reads index i · outcome reads i + 1</span>
            </header>

            <p className='digits-walkforward__audit'>
                {report.evaluatedIndices} steps evaluated · {report.lookaheadViolations} lookahead violations
            </p>

            <div className='digits-walkforward__rows'>
                {report.setups.map(setup => (
                    <article key={setup.id} className='digits-walkforward__row'>
                        <div className='digits-walkforward__label'>
                            <strong>{setup.label}</strong>
                            <span>{setup.entries} entries</span>
                        </div>

                        <Sparkline points={setup.equityCurve} />

                        <dl className='digits-walkforward__metrics'>
                            <div>
                                <dt>Win rate</dt>
                                <dd>{formatPercent(setup.winRate)}</dd>
                            </div>
                            <div>
                                <dt>Expectancy</dt>
                                <dd>{formatSigned(setup.expectancy)}</dd>
                            </div>
                            <div>
                                <dt>W / L</dt>
                                <dd>
                                    {setup.wins} / {setup.losses}
                                </dd>
                            </div>
                            <div>
                                <dt>Worst run</dt>
                                <dd>{setup.longestLossRun}L</dd>
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
        return <span className='digits-walkforward__spark digits-walkforward__spark--empty'>Too few entries</span>;
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;

    const path = points
        .map((value, index) => {
            const x = (index / (points.length - 1)) * SPARK_WIDTH;
            const y = SPARK_HEIGHT - ((value - min) / range) * SPARK_HEIGHT;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg className='digits-walkforward__spark' viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} aria-hidden='true'>
            <path d={path} className='digits-walkforward__spark-line' />
        </svg>
    );
}
