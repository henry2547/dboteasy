import { formatCount, formatPercent } from '../format';
import { mostCommonDigit } from '../statistics';
import type { BarrierStat } from '../types';

interface BarrierPanelProps {
    barriers: BarrierStat[];
}

/**
 * What happens around each barrier: how often ticks land below, on and above it,
 * how often they touch the numbers either side of it, and which digit follows.
 */
export default function BarrierPanel({ barriers }: BarrierPanelProps) {
    return (
        <section className='digits-panel'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Barrier behaviour</h3>
                <span className='digits-panel__note'>Below · at · above, and what follows a touch</span>
            </header>

            <div className='digits-barriers'>
                {barriers.map(barrier => {
                    const followBelow = mostCommonDigit(barrier.nextAfterBelow);
                    const followAbove = mostCommonDigit(barrier.nextAfterAbove);

                    return (
                        <article key={barrier.barrier} className='digits-barrier'>
                            <div className='digits-barrier__head'>
                                <h4 className='digits-barrier__label'>{barrier.label}</h4>
                                <span className='digits-barrier__rates'>
                                    Over {formatPercent(barrier.overWinRate)} · Under{' '}
                                    {formatPercent(barrier.underWinRate)}
                                </span>
                            </div>

                            <div className='digits-barrier__bar' aria-hidden='true'>
                                <span
                                    className='digits-barrier__segment digits-barrier__segment--below'
                                    style={{ width: `${barrier.belowPercentage}%` }}
                                />
                                <span
                                    className='digits-barrier__segment digits-barrier__segment--at'
                                    style={{ width: `${barrier.atPercentage}%` }}
                                />
                                <span
                                    className='digits-barrier__segment digits-barrier__segment--above'
                                    style={{ width: `${barrier.abovePercentage}%` }}
                                />
                            </div>

                            <ul className='digits-barrier__legend'>
                                <li>
                                    <em className='digits-dot digits-dot--below' /> Below {barrier.barrier}:{' '}
                                    {formatCount(barrier.belowCount)} ({formatPercent(barrier.belowPercentage)})
                                </li>
                                <li>
                                    <em className='digits-dot digits-dot--at' /> At {barrier.barrier}:{' '}
                                    {formatCount(barrier.atCount)} ({formatPercent(barrier.atPercentage)})
                                </li>
                                <li>
                                    <em className='digits-dot digits-dot--above' /> Above {barrier.barrier}:{' '}
                                    {formatCount(barrier.aboveCount)} ({formatPercent(barrier.abovePercentage)})
                                </li>
                            </ul>

                            <dl className='digits-barrier__touches'>
                                <div>
                                    <dt>Touched {barrier.barrier - 1}</dt>
                                    <dd>{formatCount(barrier.immediateBelowCount)}</dd>
                                </div>
                                <div>
                                    <dt>Touched {barrier.barrier + 1}</dt>
                                    <dd>{formatCount(barrier.immediateAboveCount)}</dd>
                                </div>
                                <div>
                                    <dt>After {barrier.barrier - 1}</dt>
                                    <dd>{followBelow ? `digit ${followBelow.digit}` : '—'}</dd>
                                </div>
                                <div>
                                    <dt>After {barrier.barrier + 1}</dt>
                                    <dd>{followAbove ? `digit ${followAbove.digit}` : '—'}</dd>
                                </div>
                            </dl>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
