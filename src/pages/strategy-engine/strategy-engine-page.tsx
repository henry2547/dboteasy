import { useMemo } from 'react';
import MarketSelector from '../digits/components/market-selector';
import { useDigitsLabContext } from '../digits/digits-lab-context';
import { formatPercent } from '../digits/format';
import { computeDigitFrequencies } from './strategy-engine-core';
import {
    STRATEGY_NAMES,
    contractTypeForStrategy,
    strategyDescription,
    strategyLabel,
    type StrategyName,
} from './strategy-engine-core';
import { useStrategyEngine } from './use-strategy-engine';
import './strategy-engine-page.scss';

const STRATEGY_WINDOWS = [20, 50, 100];

/**
 * Strategy Engine tab — a real-time, stream-driven evaluation dashboard for
 * Deriv digit markets. It watches the shared public feed, runs eight strategy
 * modules over a rolling analysis window, and flashes the instant an entry
 * threshold is breached. Educational analysis only: it never sends a trade.
 */
export default function StrategyEnginePage() {
    const lab = useDigitsLabContext();
    const [analysisWindow, setAnalysisWindow] = useLocalState(100);
    const engine = useStrategyEngine(lab.ticks, analysisWindow);

    const { signals, runtime, flash, outcomes, flatStake, latestDigit, windowDigits } = engine;

    const frequencies = useMemo(() => computeDigitFrequencies(windowDigits), [windowDigits]);
    const recentDigits = useMemo(() => lab.ticks.slice(-18).map(t => t.lastDigit), [lab.ticks]);

    const connected = lab.connection.status === 'connected';
    const hasData = windowDigits.length >= 20;

    return (
        <div className='strategy-engine'>
            <header className='se-hero'>
                <div className='se-hero__titles'>
                    <h2 className='se-hero__title'>Strategy Engine</h2>
                    <p className='se-hero__subtitle'>
                        Reactive digit-market evaluation · live entry-threshold monitoring · educational analysis
                    </p>
                </div>
                <div className='se-hero__actions'>
                    <span className={`se-status se-status--${lab.connection.status}`}>
                        {connected ? 'Connected' : lab.connection.status}
                    </span>
                    <button type='button' className='se-button' onClick={lab.refreshMarkets} disabled={!connected}>
                        Refresh markets
                    </button>
                </div>
            </header>

            <section className='se-controls'>
                <MarketSelector
                    markets={lab.markets}
                    selectedMarket={lab.selectedMarket}
                    onSelect={lab.selectMarket}
                    disabled={!connected}
                />
                <div className='se-window' role='group' aria-label='Analysis window'>
                    <span className='se-window__label'>Window</span>
                    {STRATEGY_WINDOWS.map(size => (
                        <button
                            type='button'
                            key={size}
                            className={`se-window__btn${analysisWindow === size ? ' se-window__btn--active' : ''}`}
                            onClick={() => setAnalysisWindow(size)}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </section>

            {/* Flash banner — appears the instant a strategy fires an entry. */}
            <div className={`se-flash-banner${flash ? ' se-flash-banner--active' : ''}`} aria-live='polite'>
                {flash ? (
                    <span className='se-flash-banner__content'>
                        <span className='se-flash-banner__dot' />
                        Entry signal — <strong>{strategyLabel(flash.strategyName)}</strong> on{' '}
                        {lab.selectedMarket?.displayName ?? flash.signal.symbol} · digit {flash.signal.targetTriggerDigit}
                    </span>
                ) : (
                    <span className='se-flash-banner__idle'>
                        Monitoring {lab.selectedMarket?.displayName ?? '—'} · flat stake {flatStake} (anti-martingale)
                    </span>
                )}
            </div>

            <section className='se-overview'>
                <div className='se-overview__stat'>
                    <span className='se-overview__label'>Latest digit</span>
                    <span className='se-overview__value se-overview__value--big'>{latestDigit ?? '—'}</span>
                </div>
                <div className='se-overview__stat'>
                    <span className='se-overview__label'>Sample</span>
                    <span className='se-overview__value'>{windowDigits.length}</span>
                </div>
                <div className='se-overview__stat'>
                    <span className='se-overview__label'>Window</span>
                    <span className='se-overview__value'>{analysisWindow}</span>
                </div>
                <div className='se-overview__stat'>
                    <span className='se-overview__label'>Active strategies</span>
                    <span className='se-overview__value'>
                        {STRATEGY_NAMES.filter(n => runtime[n].active).length}/{STRATEGY_NAMES.length}
                    </span>
                </div>
                <div className='se-overview__trail' aria-label='Recent digits'>
                    {recentDigits.map((d, i) => (
                        <span key={`${d}-${i}`} className={`se-trail-digit se-trail-digit--${d}`}>
                            {d}
                        </span>
                    ))}
                </div>
            </section>

            {!hasData && (
                <div className='se-empty'>
                    {lab.isLoadingHistory
                        ? 'Loading tick history…'
                        : lab.errorMessage
                          ? lab.errorMessage
                          : 'Waiting for at least 20 ticks to begin evaluation.'}
                </div>
            )}

            {hasData && (
                <section className='se-grid'>
                    {STRATEGY_NAMES.map(name => (
                        <StrategyCard
                            key={name}
                            name={name}
                            signal={signals[name]}
                            runtime={runtime[name]}
                            frequencies={frequencies}
                            isFlashing={flash?.strategyName === name}
                            onReset={() => engine.resetStrategy(name)}
                            onToggle={() => engine.toggleStrategy(name)}
                        />
                    ))}
                </section>
            )}

            {hasData && (
                <section className='se-outcomes'>
                    <h3 className='se-outcomes__title'>Recent simulated outcomes</h3>
                    {outcomes.length === 0 ? (
                        <p className='se-outcomes__empty'>No entries fired yet — waiting for a threshold breach.</p>
                    ) : (
                        <ul className='se-outcomes__list'>
                            {outcomes.map((o, i) => (
                                <li key={i} className={`se-outcome se-outcome--${o.result}`}>
                                    <span className='se-outcome__name'>{strategyLabel(o.strategyName)}</span>
                                    <span className='se-outcome__result'>{o.result === 'win' ? 'WIN' : 'LOSS'}</span>
                                    <span className='se-outcome__digits'>
                                        entry {o.entryDigit} → settle {o.settleDigit}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}

/* ---- small local-storage-backed state helper for the window selector ---- */

import { useEffect, useState } from 'react';
const WINDOW_KEY = 'strategy_engine_window';

function useLocalState(defaultValue: number): [number, (v: number) => void] {
    const [value, setValue] = useState<number>(() => {
        try {
            const stored = window.localStorage.getItem(WINDOW_KEY);
            return stored ? Number(stored) || defaultValue : defaultValue;
        } catch {
            return defaultValue;
        }
    });
    useEffect(() => {
        try {
            window.localStorage.setItem(WINDOW_KEY, String(value));
        } catch {
            /* ignore */
        }
    }, [value]);
    return [value, setValue];
}

/* ------------------------------------------------------------------ */
/* Strategy card — one per module, flashes on entry                    */
/* ------------------------------------------------------------------ */

interface StrategyCardProps {
    name: StrategyName;
    signal: ReturnType<typeof useStrategyEngine>['signals'][StrategyName];
    runtime: ReturnType<typeof useStrategyEngine>['runtime'][StrategyName];
    frequencies: { counts: number[]; percentages: number[] };
    isFlashing: boolean;
    onReset: () => void;
    onToggle: () => void;
}

function StrategyCard({ name, signal, runtime, frequencies, isFlashing, onReset, onToggle }: StrategyCardProps) {
    const label = strategyLabel(name);
    const description = strategyDescription(name);
    const contractType = contractTypeForStrategy(name);
    const total = runtime.wins + runtime.losses;
    const winRate = total > 0 ? (runtime.wins / total) * 100 : null;
    const tripped = !runtime.active;
    const cooling = runtime.cooldownUntil !== null;
    const ready = signal?.shouldTriggerSignal && runtime.active && !runtime.pending;

    const cardClass = [
        'se-card',
        `se-card--${name.toLowerCase().replace('_', '-')}`,
        isFlashing ? 'se-card--flash' : '',
        ready ? 'se-card--ready' : '',
        tripped ? 'se-card--tripped' : '',
        runtime.pending ? 'se-card--pending' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={cardClass}>
        <div className='se-card__head'>
            <div className='se-card__title-wrap'>
                <h3 className='se-card__title'>{label}</h3>
                <span className='se-card__contract'>{contractType}</span>
            </div>
            <span
                className={`se-card__state${
                    tripped ? ' se-card__state--tripped' : ready ? ' se-card__state--ready' : runtime.pending ? ' se-card__state--pending' : ''
                }`}
            >
                {tripped ? (cooling ? 'Cooling' : 'Off') : runtime.pending ? 'Pending' : ready ? 'Entry' : 'Idle'}
            </span>
        </div>

        <p className='se-card__desc'>{description}</p>

        <div className='se-card__target'>
            <span className='se-card__target-label'>Target digit</span>
            <span className='se-card__target-value'>
                {signal && signal.targetTriggerDigit >= 0 ? signal.targetTriggerDigit : '—'}
            </span>
        </div>

        {/* Mini per-digit frequency bar — visualises the distribution the filter reads. */}
        <div className='se-card__freq' aria-label='Digit frequency over window'>
            {frequencies.percentages.map((pct, d) => (
                <span
                    key={d}
                    className={`se-freq-bar${signal?.targetTriggerDigit === d ? ' se-freq-bar--target' : ''}`}
                    style={{ height: `${Math.max(4, Math.min(100, pct * 5))}%` }}
                    title={`${d}: ${formatPercent(pct)}`}
                >
                    <span className='se-freq-bar__digit'>{d}</span>
                </span>
            ))}
        </div>

        <div className='se-card__stats'>
            <span className='se-stat'>
                <span className='se-stat__label'>Signals</span>
                <span className='se-stat__value'>{runtime.totalSignals}</span>
            </span>
            <span className='se-stat'>
                <span className='se-stat__label'>W / L</span>
                <span className='se-stat__value'>
                    {runtime.wins}/{runtime.losses}
                </span>
            </span>
            <span className='se-stat'>
                <span className='se-stat__label'>Win rate</span>
                <span className='se-stat__value'>{formatPercent(winRate)}</span>
            </span>
            <span className='se-stat'>
                <span className='se-stat__label'>Loss streak</span>
                <span className='se-stat__value'>{runtime.consecutiveLosses}/3</span>
            </span>
        </div>

        <div className='se-card__actions'>
            <button type='button' className='se-card__btn' onClick={onToggle} disabled={cooling && !tripped}>
                {runtime.active ? 'Pause' : 'Resume'}
            </button>
            <button type='button' className='se-card__btn se-card__btn--ghost' onClick={onReset}>
                Reset
            </button>
        </div>

        {tripped && (
            <p className='se-card__breaker'>
                Circuit breaker tripped — 3 consecutive losses.{' '}
                {cooling ? 'Auto-resumes after a 5-minute cool-down.' : 'Manually reset to re-arm.'}
            </p>
        )}
        </div>
    );
}
