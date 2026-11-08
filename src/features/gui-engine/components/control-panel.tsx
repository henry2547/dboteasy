import type { EngineStatus, SessionMetrics, StakePreview } from '../types';

interface ControlPanelProps {
    status: EngineStatus;
    haltReason: string | null;
    accountLabel: string;
    marketName: string;
    strategyLabel: string;
    connectionLabel: string;
    dataFresh: boolean;
    primaryStateLabel: string;
    recoveryStateLabel: string;
    session: SessionMetrics;
    stakes: StakePreview;
    takeProfit: number;
    stopLoss: number;
    balance: number | null;
    isPurchasing: boolean;
    canStart: boolean;
    startHint: string | null;
    onRequestStart: () => void;
    onStop: () => void;
    onPause: () => void;
    onResume: () => void;
    onResetSession: () => void;
}

const STATUS_LABEL: Record<EngineStatus, string> = {
    stopped: 'Stopped',
    starting: 'Starting',
    running: 'Running',
    paused: 'Paused',
    halted: 'Halted',
    error: 'Needs attention',
};

/**
 * Engine status, live figures and the Start / Pause / Resume / Stop controls.
 */
export default function ControlPanel({
    status,
    haltReason,
    accountLabel,
    marketName,
    strategyLabel,
    connectionLabel,
    dataFresh,
    primaryStateLabel,
    recoveryStateLabel,
    session,
    stakes,
    takeProfit,
    stopLoss,
    balance,
    isPurchasing,
    canStart,
    startHint,
    onRequestStart,
    onStop,
    onPause,
    onResume,
    onResetSession,
}: ControlPanelProps) {
    const running = status === 'running';
    const paused = status === 'paused';
    const active = running || paused || status === 'starting';

    return (
        <section className='ge-panel ge-panel--control' aria-label='Engine control'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Engine control</h3>
                <span className={`ge-status ge-status--${status}`}>
                    <span className='ge-status__dot' aria-hidden='true' />
                    {STATUS_LABEL[status]}
                </span>
            </header>

            {haltReason && <p className={`ge-alert ge-alert--${status === 'halted' ? 'warn' : 'error'}`}>{haltReason}</p>}

            <div className='ge-stats'>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Market</span>
                    <span className='ge-stat__value'>{marketName}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Account</span>
                    <span className='ge-stat__value'>{accountLabel}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Strategy</span>
                    <span className='ge-stat__value'>{strategyLabel}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Primary state</span>
                    <span className='ge-stat__value ge-stat__value--mono'>{primaryStateLabel}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Recovery state</span>
                    <span className='ge-stat__value ge-stat__value--mono'>{recoveryStateLabel}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Current stake</span>
                    <span className='ge-stat__value'>{stakes.currentStake.toFixed(2)}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Next stake</span>
                    <span className='ge-stat__value'>{stakes.nextStake.toFixed(2)}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Take profit / Stop loss</span>
                    <span className='ge-stat__value'>
                        {takeProfit.toFixed(2)} / -{stopLoss.toFixed(2)}
                    </span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Session P/L</span>
                    <span
                        className={`ge-stat__value ${session.profit > 0 ? 'ge-stat__value--good' : session.profit < 0 ? 'ge-stat__value--bad' : ''}`}
                    >
                        {session.profit > 0 ? '+' : ''}
                        {session.profit.toFixed(2)}
                    </span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Balance</span>
                    <span className='ge-stat__value'>{balance === null ? '—' : balance.toFixed(2)}</span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Market feed</span>
                    <span className={`ge-stat__value ${dataFresh ? 'ge-stat__value--good' : 'ge-stat__value--warn'}`}>
                        {connectionLabel}
                        {dataFresh ? ' · live' : ' · stale'}
                    </span>
                </div>
                <div className='ge-stat'>
                    <span className='ge-stat__label'>Execution</span>
                    <span className='ge-stat__value'>{isPurchasing ? 'Purchasing…' : 'Idle'}</span>
                </div>
            </div>

            <div className='ge-actions'>
                <button
                    type='button'
                    className='ge-button ge-button--primary'
                    onClick={onRequestStart}
                    disabled={!canStart || active}
                    title={startHint ?? undefined}
                >
                    Start engine
                </button>
                <button type='button' className='ge-button' onClick={onPause} disabled={!running}>
                    Pause new entries
                </button>
                <button type='button' className='ge-button' onClick={onResume} disabled={!paused}>
                    Resume engine
                </button>
                <button type='button' className='ge-button ge-button--danger' onClick={onStop} disabled={!active}>
                    Stop engine
                </button>
                <button
                    type='button'
                    className='ge-button ge-button--ghost'
                    onClick={onResetSession}
                    disabled={active}
                    title='Clears the session counters and recovery attempts; trade history is kept.'
                >
                    Reset session counters
                </button>
            </div>

            {startHint && !active && <p className='ge-note'>{startHint}</p>}
        </section>
    );
}
