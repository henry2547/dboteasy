import { useCallback, useEffect, useMemo, useState } from 'react';
import { virtualHookRuntime } from '@/external/bot-skeleton/services/virtual-hooks';
import './virtual-hook-monitor.scss';

type Snapshot = ReturnType<typeof virtualHookRuntime.getSnapshot>;

const POLL_MS = 1000;

const eventLabel: Record<string, string> = {
    tick: 'New tick',
    digit_pattern: 'Digit pattern',
    analysis_condition: 'Analysis condition',
    contract_purchased: 'Contract purchased',
    contract_settled: 'Contract settled',
    manual: 'Manual trigger',
};

const timeOf = (at: number | null) =>
    at === null || at === undefined ? '—' : new Date(at).toLocaleTimeString([], { hour12: false });

/**
 * Live Virtual Hook monitor.
 *
 * Every value comes from the runtime's own snapshot: no hardcoded counts, no simulated
 * activity. It polls once a second while open, so a fast tick stream never re-renders the
 * Blockly canvas on every tick.
 */
const VirtualHookMonitor = ({ is_running }: { is_running?: boolean }) => {
    const [open, setOpen] = useState(false);
    const [snapshot, setSnapshot] = useState<Snapshot>(() => virtualHookRuntime.getSnapshot());
    const [selected, setSelected] = useState<string | null>(null);

    const refresh = useCallback(() => setSnapshot(virtualHookRuntime.getSnapshot()), []);

    useEffect(() => {
        refresh();
        if (!open) return undefined;
        const timer = window.setInterval(refresh, POLL_MS);
        return () => window.clearInterval(timer);
    }, [open, refresh, is_running]);

    const hooks = snapshot.hooks;
    const activeCount = hooks.filter(hook => hook.enabled).length;
    const errorCount = snapshot.errors.length;
    const selectedExecution = useMemo(
        () => snapshot.executions.find(execution => execution.hook === selected) ?? null,
        [snapshot.executions, selected]
    );

    return (
        <section className={`vh-monitor ${open ? 'vh-monitor--open' : ''}`} aria-label='Virtual Hook monitor'>
            <button
                type='button'
                className='vh-monitor__header'
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
            >
                <span className='vh-monitor__title'>Virtual hooks</span>
                <span className={`vh-monitor__feed ${snapshot.feed.healthy ? 'is-live' : 'is-idle'}`}>
                    {snapshot.active ? (snapshot.feed.healthy ? 'feed live' : 'feed waiting') : 'stopped'}
                </span>
                <span className='vh-monitor__badges'>
                    <span>{activeCount} on</span>
                    {errorCount > 0 && <span className='is-error'>{errorCount} error</span>}
                </span>
                <span className='vh-monitor__chevron' aria-hidden='true'>
                    {open ? '▾' : '▸'}
                </span>
            </button>

            {open && (
                <div className='vh-monitor__body'>
                    <div className={`vh-monitor__status ${snapshot.feed.healthy ? 'is-live' : 'is-idle'}`}>
                        <span>{snapshot.feed.reason}</span>
                        <span className='vh-monitor__status-meta'>
                            {snapshot.feed.symbol || 'No market'} · digit {snapshot.feed.lastDigit ?? '—'} ·{' '}
                            {snapshot.feed.validTicks} valid tick(s)
                        </span>
                    </div>

                    {!snapshot.active && (
                        <p className='vh-monitor__hint'>
                            Hooks register when you press Run and stop when you press Stop. Press Run to register this
                            canvas; the monitor then shows the hooks, events and traces that actually happened.
                        </p>
                    )}

                    {snapshot.active && hooks.length === 0 && (
                        <p className='vh-monitor__hint'>
                            No hook is registered on this canvas. Add a Register Virtual Hook block and a When Virtual
                            Hook fires block.
                        </p>
                    )}

                    {hooks.length > 0 && (
                        <ul className='vh-monitor__hooks'>
                            {hooks.map(hook => {
                                const isSelected = selected === hook.definition.name;
                                return (
                                    <li
                                        key={hook.definition.name}
                                        className={`vh-monitor__hook ${isSelected ? 'is-selected' : ''}`}
                                    >
                                        <div className='vh-monitor__hook-row'>
                                            <button
                                                type='button'
                                                className='vh-monitor__hook-name'
                                                onClick={() =>
                                                    setSelected(value =>
                                                        value === hook.definition.name ? null : hook.definition.name
                                                    )
                                                }
                                            >
                                                {hook.definition.name}
                                            </button>
                                            <span className={`vh-monitor__state vh-monitor__state--${hook.state}`}>
                                                {hook.state}
                                            </span>
                                            <button
                                                type='button'
                                                className='vh-monitor__toggle'
                                                onClick={() => {
                                                    virtualHookRuntime.setEnabled(
                                                        hook.definition.name,
                                                        !hook.enabled
                                                    );
                                                    refresh();
                                                }}
                                                aria-pressed={hook.enabled}
                                            >
                                                {hook.enabled ? 'Disable' : 'Enable'}
                                            </button>
                                        </div>
                                        <div className='vh-monitor__hook-meta'>
                                            {eventLabel[hook.definition.event] ?? hook.definition.event} ·{' '}
                                            {hook.definition.market || snapshot.feed.symbol || 'any market'} ·{' '}
                                            {hook.listenerCount} listener(s) · fired {hook.triggerCount}×
                                            {hook.skippedCount > 0 ? ` · skipped ${hook.skippedCount}` : ''}
                                            {hook.queueDepth > 0 ? ` · queue ${hook.queueDepth}` : ''}
                                        </div>
                                        <div className='vh-monitor__hook-line'>
                                            <span>Last event</span>
                                            <span>{timeOf(hook.lastEventAt)}</span>
                                        </div>
                                        <div className='vh-monitor__hook-line'>
                                            <span>Last result</span>
                                            <span className={hook.lastError ? 'is-error' : ''}>
                                                {hook.lastError ?? hook.lastResult ?? '—'}
                                            </span>
                                        </div>
                                        {hook.lastReason && (
                                            <div className='vh-monitor__hook-line'>
                                                <span>Trigger reason</span>
                                                <span>{hook.lastReason}</span>
                                            </div>
                                        )}
                                        {hook.definition.condition && (
                                            <div className='vh-monitor__hook-line'>
                                                <span>Condition</span>
                                                <span>{hook.definition.condition.type.replace(/_/g, ' ')}</span>
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div className='vh-monitor__trace'>
                                                {selectedExecution ? (
                                                    <>
                                                        <div className='vh-monitor__trace-head'>
                                                            {selectedExecution.id} · {selectedExecution.state} ·{' '}
                                                            {selectedExecution.durationMs ?? 0} ms · depth{' '}
                                                            {selectedExecution.depth}
                                                        </div>
                                                        <ol>
                                                            {selectedExecution.steps.map((step, index) => (
                                                                <li
                                                                    key={`${step.at}-${index}`}
                                                                    className={`is-${step.status}`}
                                                                >
                                                                    <strong>{step.label}</strong>
                                                                    <span>{step.detail}</span>
                                                                </li>
                                                            ))}
                                                        </ol>
                                                    </>
                                                ) : (
                                                    <p className='vh-monitor__hint'>
                                                        This hook has not fired yet, so there is no trace.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className='vh-monitor__metrics'>
                        <span>{snapshot.metrics.ticksReceived} ticks</span>
                        <span>{snapshot.metrics.eventsDispatched} dispatched</span>
                        <span>{snapshot.metrics.executionsCompleted} completed</span>
                        <span>{snapshot.metrics.executionsBlocked} blocked</span>
                        <span>{snapshot.metrics.activeExecutions} running</span>
                    </div>

                    {snapshot.errors.length > 0 && (
                        <div className='vh-monitor__errors'>
                            <div className='vh-monitor__errors-head'>
                                <span>Recent errors</span>
                                <button
                                    type='button'
                                    onClick={() => {
                                        virtualHookRuntime.clearDiagnostics();
                                        refresh();
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                            <ul>
                                {snapshot.errors.slice(0, 6).map((error, index) => (
                                    <li key={`${error.at}-${index}`}>
                                        <span>{timeOf(error.at)}</span> {error.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default VirtualHookMonitor;
