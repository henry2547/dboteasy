import { formatDecimal, formatPercent } from '../format';
import { PING_BUDGET_SHARE } from '../engines';
import type { LatencyGuardReading } from '../engines';

interface LatencyGuardPanelProps {
    guard: LatencyGuardReading;
}

/**
 * Engine C — the latency circuit breaker. When the guard trips, the low-latency
 * warning replaces the "safe" line. The Digits lab is read-only and owns no
 * execution button, so the flag is surfaced here rather than wired to an order.
 */
export default function LatencyGuardPanel({ guard }: LatencyGuardPanelProps) {
    const { isExecutionSafe, pingShare } = guard;
    const sharePercent = pingShare === null ? null : pingShare * 100;
    // Three readings, not two: an unmeasured guard is neither certified nor a
    // warning — it is still taking its first measurement.
    const tone = pingShare === null ? 'measuring' : isExecutionSafe ? 'safe' : 'unsafe';

    return (
        <section className={`digits-panel digits-latency digits-latency--${tone}`}>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Execution safety guard</h3>
                <span className='digits-panel__note'>Ping vs tick interval · {formatPercent(PING_BUDGET_SHARE * 100, 0)} budget</span>
            </header>

            <div className='digits-latency__grid'>
                <div className='digits-latency__cell'>
                    <span className='digits-latency__label'>Round-trip</span>
                    <span className='digits-latency__value'>
                        {guard.currentPingMs === null ? '—' : `${formatDecimal(guard.currentPingMs, 0)} ms`}
                    </span>
                </div>
                <div className='digits-latency__cell'>
                    <span className='digits-latency__label'>Avg tick interval</span>
                    <span className='digits-latency__value'>
                        {guard.averageTickLifespanMs === null ? '—' : `${formatDecimal(guard.averageTickLifespanMs, 0)} ms`}
                    </span>
                </div>
                <div className='digits-latency__cell'>
                    <span className='digits-latency__label'>Share of a tick</span>
                    <span className='digits-latency__value'>{sharePercent === null ? '—' : `${formatDecimal(sharePercent, 0)}%`}</span>
                </div>
            </div>

            <p className={`digits-latency__verdict digits-latency__verdict--${tone}`}>
                {tone === 'measuring' ? 'Guard measuring' : isExecutionSafe ? 'Execution path clear' : 'Low-latency warning'}
            </p>
            <p className='digits-latency__reason'>{guard.reason}</p>
        </section>
    );
}
