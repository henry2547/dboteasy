import type { EngineConfig, ParityStats, RecoveryRuntime, SessionMetrics, StakePreview } from '../types';

interface RecoveryMonitorProps {
    recovery: RecoveryRuntime;
    parity: ParityStats;
    config: EngineConfig;
    session: SessionMetrics;
    stakes: StakePreview;
    isPurchasing: boolean;
}

/**
 * Even/Odd recovery state, the parity readings and the configured ceilings.
 */
export default function RecoveryMonitor({
    recovery,
    parity,
    config,
    session,
    stakes,
    isPurchasing,
}: RecoveryMonitorProps) {
    const patternLabel =
        recovery.pattern === 'even_even' ? 'Two consecutive EVEN digits' : recovery.pattern === 'odd_odd' ? 'Two consecutive ODD digits' : 'No parity pattern';
    const directionLabel = recovery.direction ?? (recovery.pattern === 'even_even' ? 'ODD' : recovery.pattern === 'odd_odd' ? 'EVEN' : '—');
    const remainingAttempts = Math.max(0, config.maxRecoveryTrades - session.recoveryAttempts);

    return (
        <section className='ge-panel' aria-label='Even and odd recovery monitor'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Even/Odd recovery</h3>
                <span className={`ge-status ge-status--${recovery.active ? 'running' : 'stopped'}`}>
                    <span className='ge-status__dot' aria-hidden='true' />
                    {recovery.active ? 'Recovery active' : 'Inactive'}
                </span>
            </header>

            <dl className='ge-kv'>
                <div className='ge-kv__row'>
                    <dt>Recovery state</dt>
                    <dd className='ge-mono'>{recovery.state}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Losing primary contract</dt>
                    <dd className='ge-mono'>{recovery.contractId ?? '—'}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Last two digits</dt>
                    <dd className='ge-mono'>
                        {recovery.lastTwo[0] === null && recovery.lastTwo[1] === null
                            ? '—'
                            : `${recovery.lastTwo[0] ?? '–'}${recovery.lastTwo[1] ?? '–'}`}
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Detected pattern</dt>
                    <dd>{patternLabel}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Selected direction</dt>
                    <dd>{directionLabel}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Even share</dt>
                    <dd>
                        <strong>{parity.evenPercent.toFixed(2)}%</strong>{' '}
                        <span className='ge-muted'>
                            ({parity.even}/{parity.total} · {parity.evenDelta >= 0 ? '+' : ''}
                            {parity.evenDelta.toFixed(2)} vs 50%)
                        </span>
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Odd share</dt>
                    <dd>
                        <strong>{parity.oddPercent.toFixed(2)}%</strong>{' '}
                        <span className='ge-muted'>
                            ({parity.odd}/{parity.total} · {parity.oddDelta >= 0 ? '+' : ''}
                            {parity.oddDelta.toFixed(2)} vs 50%)
                        </span>
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Configured thresholds</dt>
                    <dd>
                        even ≤ {config.maxEvenPercent}% · odd ≤ {config.maxOddPercent}%{' '}
                        {config.recoveryFilterEnabled ? '' : '(filter disabled)'}
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Frequency eligibility</dt>
                    <dd>
                        {!config.recoveryFilterEnabled ? (
                            <span className='ge-pill ge-pill--idle'>Filter disabled — always eligible</span>
                        ) : !recovery.active && !recovery.pattern ? (
                            <span className='ge-pill ge-pill--idle'>Awaiting a parity pattern</span>
                        ) : recovery.lastReason ? (
                            <span className='ge-pill ge-pill--fail'>Blocked</span>
                        ) : (
                            <span className='ge-pill ge-pill--pass'>Eligible</span>
                        )}
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Attempts used</dt>
                    <dd>
                        {session.recoveryAttempts} / {config.maxRecoveryTrades}
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Remaining attempts</dt>
                    <dd>{remainingAttempts}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Recovery stake</dt>
                    <dd>{stakes.recoveryStake.toFixed(2)}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Execution</dt>
                    <dd>{isPurchasing ? 'Purchase in progress' : 'Idle'}</dd>
                </div>
            </dl>

            {recovery.lastReason && <p className='ge-alert ge-alert--warn'>{recovery.lastReason}</p>}
            <p className='ge-note'>
                Recovery opens only after a confirmed primary loss from its Deriv settlement. Two even digits select
                ODD; two odd digits select EVEN; a mixed pair never enters. Primary entries pause while recovery is
                active, and it is never an unlimited loop — the attempt limit stops it.
            </p>
        </section>
    );
}
