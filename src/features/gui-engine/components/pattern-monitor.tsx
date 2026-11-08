import { PRIMARY_STRATEGIES, strategiesFor } from '../config';
import type {
    EngineConfig,
    EngineStatus,
    FrequencyPermission,
    PrimaryRuntime,
    PrimaryStrategyId,
    StrategySelection,
} from '../types';
import type { EngineDecision } from '../use-gui-engine';

interface PatternMonitorProps {
    previousDigit: number | null;
    latestDigit: number | null;
    primaryViews: Record<PrimaryStrategyId, PrimaryRuntime>;
    strategy: StrategySelection;
    permission: Partial<Record<PrimaryStrategyId, FrequencyPermission>>;
    config: EngineConfig;
    decision: EngineDecision | null;
    isPurchasing: boolean;
    status: EngineStatus;
}

function formatTime(value: number | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString(undefined, { hour12: false });
}

function StrategySetup({
    id,
    runtime,
    config,
    permission,
    decision,
    isPurchasing,
}: {
    id: PrimaryStrategyId;
    runtime: PrimaryRuntime;
    config: EngineConfig;
    permission?: FrequencyPermission;
    decision: EngineDecision | null;
    isPurchasing: boolean;
}) {
    const definition = PRIMARY_STRATEGIES[id];
    const setup = runtime.pending;
    const remaining = setup ? Math.max(0, config.maxTicksToConfirm - setup.ticksWaited) : config.maxTicksToConfirm;

    return (
        <div className='ge-setup'>
            <div className='ge-setup__head'>
                <h4 className='ge-setup__title'>{definition.label}</h4>
                <span className='ge-tag'>{runtime.state}</span>
            </div>

            <dl className='ge-kv'>
                <div className='ge-kv__row'>
                    <dt>Frequency filter</dt>
                    <dd>
                        <span className={`ge-pill ge-pill--${permission?.passed ? 'pass' : 'fail'}`}>
                            {permission?.passed ? 'Pass' : 'Blocked'}
                        </span>
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Pending pair</dt>
                    <dd className='ge-mono'>{setup ? setup.pair : (runtime.lastPair?.pair ?? '—')}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Pair detected</dt>
                    <dd>{setup ? formatTime(setup.detectedAt) : runtime.lastPair ? formatTime(runtime.lastPair.at) : '—'}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Pair sequence</dt>
                    <dd className='ge-mono'>{setup ? setup.detectedSequence.join(' , ') : '—'}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Intervening digits</dt>
                    <dd className='ge-mono'>{setup && setup.interveningDigits.length > 0 ? setup.interveningDigits.join(', ') : 'none'}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Ticks waited</dt>
                    <dd>
                        {setup ? setup.ticksWaited : 0} / {config.maxTicksToConfirm}
                    </dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Remaining window</dt>
                    <dd>{setup ? `${remaining} tick${remaining === 1 ? '' : 's'}` : '—'}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Next valid confirmation</dt>
                    <dd className='ge-mono'>{definition.targetDigits.join(' or ')}</dd>
                </div>
                <div className='ge-kv__row'>
                    <dt>Setup status</dt>
                    <dd>{setup ? 'Waiting for confirmation' : runtime.state === 'SETUP_EXPIRED' ? 'Expired' : runtime.state === 'SETUP_BLOCKED' ? 'Blocked' : 'No pending setup'}</dd>
                </div>
            </dl>

            {setup && (
                <p className='ge-setup__active'>
                    Pair detected: <strong>{setup.pair}</strong> · intervening digits:{' '}
                    <strong>{setup.interveningDigits.length ? setup.interveningDigits.join(', ') : 'none'}</strong> ·
                    status: <strong>Waiting for confirmation</strong> · next valid confirmation:{' '}
                    <strong>{definition.targetDigits.join(' or ')}</strong>
                </p>
            )}

            {setup?.blockReason && <p className='ge-alert ge-alert--warn'>{setup.blockReason}</p>}

            {!setup && runtime.lastEvent?.type === 'blocked' && (
                <p className='ge-alert ge-alert--warn'>
                    Last setup {runtime.lastEvent.setup.pair} blocked: {runtime.lastEvent.reason}
                </p>
            )}

            <p className={`ge-eligibility ge-eligibility--${decision?.allowed ? 'pass' : decision ? 'fail' : 'idle'}`}>
                Purchase eligibility:{' '}
                {isPurchasing
                    ? 'purchase in progress'
                    : decision
                      ? decision.allowed
                          ? 'allowed at the last check'
                          : decision.reason
                      : 'idle'}
            </p>
        </div>
    );
}

/** Pattern detection, the pending setup and the purchase decision. */
export default function PatternMonitor({
    previousDigit,
    latestDigit,
    primaryViews,
    strategy,
    permission,
    config,
    decision,
    isPurchasing,
    status,
}: PatternMonitorProps) {
    const strategies = strategiesFor(strategy);

    return (
        <section className='ge-panel' aria-label='Pattern and confirmation monitor'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Pattern &amp; confirmation</h3>
                <span className='ge-panel__meta'>
                    {status === 'running' ? 'Evaluating live ticks' : 'Evaluation idle'}
                </span>
            </header>

            <div className='ge-digits-strip'>
                <div className='ge-digits-strip__item'>
                    <span className='ge-digits-strip__label'>Previous digit</span>
                    <span className='ge-digits-strip__value'>{previousDigit ?? '—'}</span>
                </div>
                <div className='ge-digits-strip__item'>
                    <span className='ge-digits-strip__label'>Latest digit</span>
                    <span className='ge-digits-strip__value'>{latestDigit ?? '—'}</span>
                </div>
                <div className='ge-digits-strip__item'>
                    <span className='ge-digits-strip__label'>Two-digit pattern</span>
                    <span className='ge-digits-strip__value ge-mono'>
                        {previousDigit !== null && latestDigit !== null ? `${previousDigit}${latestDigit}` : '—'}
                    </span>
                </div>
            </div>

            <div className='ge-setups'>
                {strategies.map(id => (
                    <StrategySetup
                        key={id}
                        id={id}
                        runtime={primaryViews[id]}
                        config={config}
                        permission={permission[id]}
                        decision={decision}
                        isPurchasing={isPurchasing}
                    />
                ))}
            </div>

            {decision && (
                <p className='ge-meta ge-meta--single'>
                    Last check · {decision.label} · {new Date(decision.at).toLocaleTimeString(undefined, { hour12: false })}
                </p>
            )}
        </section>
    );
}
