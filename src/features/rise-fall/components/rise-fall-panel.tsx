import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import { REGIME_LABELS } from '../regime';
import { STAKING_RULE } from '../risk-engine';
import { VIRTUAL_PAYOUT_RATE } from '../execution-service';
import { EXECUTION_MODES, MODE_LABELS } from '../types';
import type { ExecutionMode } from '../types';
import { useRiseFallEngine } from '../use-rise-fall-engine';
import JournalList from './journal-list';
import RiskEditor from './risk-editor';
import '../rise-fall-panel.scss';

const STATE_LABELS: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
    halted: 'Halted',
};

const MODE_NOTES: Record<ExecutionMode, string> = {
    virtual: 'Simulated fills on genuine live Deriv ticks. No purchase is sent to Deriv.',
    demo: 'Demo purchases are Phase B of the build brief and are not wired yet — entries are refused, nothing is bought.',
    real: 'Real-money trading is locked: the Phase E activation gates are not implemented, so entries are refused.',
};

export interface RiseFallPanelProps {
    /** Only the Bot Builder mounts this, and only while that tab is active. */
    enabled?: boolean;
}

/**
 * The Rise/Fall engine, inside the Blockly Bot Builder.
 *
 * It is an expansion of the builder, not a separate tab: a launcher pill opens a
 * panel over the canvas with the mode selector, market, live analysis, risk
 * limits, engine controls and the active mode's own journal.
 */
const RiseFallPanel = ({ enabled = true }: RiseFallPanelProps) => {
    const [open, setOpen] = React.useState(false);
    const engine = useRiseFallEngine(open && enabled);
    const { signal, regime, feed, snapshot, journal, trendConfig, durationTicks, notice } = engine;

    const active = snapshot.modes[snapshot.mode];
    const mode = snapshot.mode;
    const price = (value: number | null) =>
        value === null ? '—' : value.toFixed(feed.decimalPlaces ?? 2);
    const stateLabel = STATE_LABELS[active.state] ?? active.state;
    const winRate = active.stats.wins + active.stats.losses > 0
        ? (active.stats.wins / (active.stats.wins + active.stats.losses)) * 100
        : null;

    if (!enabled) return null;

    if (!open) {
        return (
            <button
                type='button'
                className='rise-fall__launcher'
                data-testid='rise-fall-launcher'
                onClick={() => setOpen(true)}
            >
                <span className='rise-fall__launcher-title'>{localize('Rise/Fall engine')}</span>
                <span className='rise-fall__launcher-mode'>{MODE_LABELS[mode]}</span>
                <span className={classNames('rise-fall__dot', `rise-fall__dot--${active.state}`)} aria-hidden='true' />
            </button>
        );
    }

    return (
        <section className='rise-fall' data-testid='rise-fall-panel' aria-label={localize('Rise/Fall engine')}>
            <header className='rise-fall__header'>
                <div>
                    <h2 className='rise-fall__title'>{localize('Rise/Fall engine')}</h2>
                    <p className='rise-fall__subtitle'>
                        {localize('Inside the Bot Builder · Trend Continuation · real ticks, separated modes')}
                    </p>
                </div>
                <button
                    type='button'
                    className='rise-fall__close'
                    data-testid='rise-fall-close'
                    aria-label={localize('Close the Rise/Fall engine')}
                    onClick={() => setOpen(false)}
                >
                    ×
                </button>
            </header>

            <div className='rise-fall__body'>
                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Execution mode')}</h3>
                        <span className='rise-fall__status' data-testid='rise-fall-status'>
                            {stateLabel}
                        </span>
                    </div>
                    <div className='rise-fall__modes' role='group' aria-label={localize('Execution mode')}>
                        {EXECUTION_MODES.map(item => (
                            <button
                                key={item}
                                type='button'
                                data-testid={`rise-fall-mode-${item}`}
                                aria-pressed={mode === item}
                                className={classNames('rise-fall__mode', { 'is-active': mode === item })}
                                onClick={() => engine.setMode(item)}
                            >
                                {MODE_LABELS[item]}
                            </button>
                        ))}
                    </div>
                    <p className='rise-fall__note' data-testid='rise-fall-mode-note'>
                        {MODE_NOTES[mode]}
                    </p>
                    {active.haltReason && (
                        <p className='rise-fall__note rise-fall__note--danger'>{active.haltReason}</p>
                    )}
                    <dl className='rise-fall__facts'>
                        <div>
                            <dt>{localize('Account')}</dt>
                            <dd data-testid='rise-fall-account'>
                                {active.account.maskedLoginId ?? '—'} · {active.account.currency ?? '—'}
                            </dd>
                        </div>
                        <div>
                            <dt>{localize('Balance')}</dt>
                            <dd>{active.account.balance === null ? '—' : active.account.balance.toFixed(2)}</dd>
                        </div>
                        <div>
                            <dt>{localize('Verified')}</dt>
                            <dd>{active.account.verified ? localize('Yes') : localize('No')}</dd>
                        </div>
                    </dl>
                </section>

                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Market & feed')}</h3>
                        <span className='rise-fall__status'>{feed.connection.status}</span>
                    </div>
                    <select
                        className='rise-fall__select'
                        data-testid='rise-fall-market'
                        aria-label={localize('Market')}
                        value={feed.market?.apiSymbol ?? ''}
                        disabled={Boolean(active.openContract)}
                        onChange={event => feed.selectMarket(event.target.value)}
                    >
                        {feed.markets.length === 0 && <option value=''>{localize('Loading markets…')}</option>}
                        {feed.markets.map(item => (
                            <option key={item.apiSymbol} value={item.apiSymbol}>
                                {item.displayName}
                            </option>
                        ))}
                    </select>
                    <p
                        className={classNames('rise-fall__note', {
                            'rise-fall__note--danger': !feed.integrity.healthy,
                        })}
                        data-testid='rise-fall-integrity'
                    >
                        {feed.error
                            ? feed.error
                            : feed.integrity.healthy
                              ? `${feed.integrity.ticksAvailable} genuine ticks · ${localize('last tick')} ${
                                    feed.integrity.lastTickAgeMs === null
                                        ? '—'
                                        : `${(feed.integrity.lastTickAgeMs / 1000).toFixed(1)}s`
                                } ${localize('ago')}`
                              : feed.integrity.issue}
                    </p>
                </section>

                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Trend Continuation')}</h3>
                        <span
                            className={classNames('rise-fall__tag', {
                                'rise-fall__tag--won': signal.direction === 'rise',
                                'rise-fall__tag--lost': signal.direction === 'fall',
                            })}
                            data-testid='rise-fall-direction'
                        >
                            {signal.direction === 'none'
                                ? 'NO TRADE'
                                : signal.direction === 'rise'
                                  ? 'RISE'
                                  : 'FALL'}
                        </span>
                    </div>

                    <div className='rise-fall__scores'>
                        <div className='rise-fall__score'>
                            <span>
                                {localize('Rise')} · <b data-testid='rise-fall-rise-score'>{signal.riseScore}</b>
                            </span>
                            <div className='rise-fall__bar'>
                                <span className='rise-fall__bar-fill is-rise' style={{ width: `${signal.riseScore}%` }} />
                            </div>
                        </div>
                        <div className='rise-fall__score'>
                            <span>
                                {localize('Fall')} · <b data-testid='rise-fall-fall-score'>{signal.fallScore}</b>
                            </span>
                            <div className='rise-fall__bar'>
                                <span className='rise-fall__bar-fill is-fall' style={{ width: `${signal.fallScore}%` }} />
                            </div>
                        </div>
                    </div>

                    <p className='rise-fall__regime' data-testid='rise-fall-regime'>
                        {localize('Regime')}: <b>{REGIME_LABELS[signal.regime] ?? regime.label}</b>
                        {signal.direction !== 'none' && !signal.suitable && ` · ${localize('not suitable — no entry')}`}
                    </p>
                    <p className='rise-fall__explanation' data-testid='rise-fall-explanation'>
                        {signal.explanation}
                    </p>

                    <ul className='rise-fall__contributions'>
                        {signal.contributions.map(item => (
                            <li key={item.id}>
                                <span>{item.label}</span>
                                <b>
                                    {item.score.toFixed(0)}/{item.weight}
                                </b>
                                <em>{item.detail}</em>
                            </li>
                        ))}
                    </ul>

                    <div className='rise-fall__grid'>
                        {(['fastPeriod', 'mediumPeriod', 'slowPeriod', 'minScore', 'confirmationTicks'] as const).map(
                            field => (
                                <label className='rise-fall__field' key={field} htmlFor={`rise-fall-${field}`}>
                                    <span>
                                        {field === 'fastPeriod' && localize('Fast EMA')}
                                        {field === 'mediumPeriod' && localize('Medium EMA')}
                                        {field === 'slowPeriod' && localize('Slow EMA')}
                                        {field === 'minScore' && localize('Entry score')}
                                        {field === 'confirmationTicks' && localize('Confirmation ticks')}
                                    </span>
                                    <input
                                        id={`rise-fall-${field}`}
                                        data-testid={`rise-fall-config-${field}`}
                                        type='number'
                                        min={1}
                                        value={trendConfig[field]}
                                        onChange={event =>
                                            engine.updateTrendConfig({ [field]: Number(event.target.value) })
                                        }
                                    />
                                </label>
                            )
                        )}
                        <label className='rise-fall__field' htmlFor='rise-fall-duration'>
                            <span>{localize('Duration (ticks)')}</span>
                            <input
                                id='rise-fall-duration'
                                data-testid='rise-fall-duration'
                                type='number'
                                min={1}
                                max={300}
                                value={durationTicks}
                                onChange={event => engine.setDurationTicks(Number(event.target.value))}
                            />
                        </label>
                    </div>
                </section>

                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Risk limits')}</h3>
                        <span className='rise-fall__status'>{MODE_LABELS[mode]}</span>
                    </div>
                    <RiskEditor risk={active.risk} onChange={engine.setRiskField} />
                    <p className='rise-fall__note'>{STAKING_RULE}</p>
                </section>

                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Engine controls')}</h3>
                    </div>
                    <div className='rise-fall__controls'>
                        <button
                            type='button'
                            className='rise-fall__button is-primary'
                            data-testid='rise-fall-start'
                            onClick={engine.start}
                            disabled={active.emergency}
                        >
                            {localize('Start')}
                        </button>
                        <button
                            type='button'
                            className='rise-fall__button'
                            data-testid='rise-fall-pause'
                            onClick={engine.pause}
                        >
                            {localize('Pause')}
                        </button>
                        <button
                            type='button'
                            className='rise-fall__button'
                            data-testid='rise-fall-stop'
                            onClick={engine.stop}
                        >
                            {localize('Stop')}
                        </button>
                        <button
                            type='button'
                            className='rise-fall__button is-danger'
                            data-testid='rise-fall-emergency'
                            onClick={active.emergency ? engine.releaseEmergencyStop : engine.emergencyStop}
                        >
                            {active.emergency ? localize('Release emergency stop') : localize('Emergency stop')}
                        </button>
                    </div>
                    {notice && (
                        <p className='rise-fall__note' data-testid='rise-fall-notice'>
                            {notice}
                        </p>
                    )}
                    {snapshot.lastOutcome?.reason && (
                        <p className='rise-fall__note rise-fall__note--muted' data-testid='rise-fall-outcome'>
                            {localize('Last decision')}: {snapshot.lastOutcome.reason}
                        </p>
                    )}
                </section>

                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Open contract')}</h3>
                        <span className='rise-fall__status'>{MODE_LABELS[mode]}</span>
                    </div>
                    {active.openContract ? (
                        <dl className='rise-fall__facts' data-testid='rise-fall-contract'>
                            <div>
                                <dt>{localize('Direction')}</dt>
                                <dd>{active.openContract.direction === 'rise' ? 'RISE' : 'FALL'}</dd>
                            </div>
                            <div>
                                <dt>{localize('Entry')}</dt>
                                <dd>{price(active.openContract.entryQuote)}</dd>
                            </div>
                            <div>
                                <dt>{localize('Ticks left')}</dt>
                                <dd>{active.openContract.ticksRemaining}</dd>
                            </div>
                            <div>
                                <dt>{localize('Stake')}</dt>
                                <dd>
                                    {active.openContract.stake.toFixed(2)} {active.openContract.currency}
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <p className='rise-fall__empty' data-testid='rise-fall-no-contract'>
                            {localize('No open contract.')}
                        </p>
                    )}
                </section>

                <section className='rise-fall__section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Session')}</h3>
                        <span className='rise-fall__status'>{MODE_LABELS[mode]}</span>
                    </div>
                    <dl className='rise-fall__facts'>
                        <div>
                            <dt>{localize('Trades')}</dt>
                            <dd data-testid='rise-fall-trades'>{active.stats.trades}</dd>
                        </div>
                        <div>
                            <dt>{localize('Wins / losses')}</dt>
                            <dd>
                                {active.stats.wins} / {active.stats.losses}
                                {active.stats.ties > 0 && ` (${active.stats.ties} ${localize('ties')})`}
                            </dd>
                        </div>
                        <div>
                            <dt>{localize('Win rate')}</dt>
                            <dd>{winRate === null ? '—' : `${winRate.toFixed(0)}%`}</dd>
                        </div>
                        <div>
                            <dt>{localize('Net P/L')}</dt>
                            <dd data-testid='rise-fall-net'>
                                {active.stats.netProfit.toFixed(2)} {active.account.currency ?? ''}
                                {mode === 'virtual' && <em> · {localize('ESTIMATED')}</em>}
                            </dd>
                        </div>
                        <div>
                            <dt>{localize('Max drawdown')}</dt>
                            <dd>{active.stats.maxDrawdown.toFixed(2)}</dd>
                        </div>
                        <div>
                            <dt>{localize('Consecutive losses')}</dt>
                            <dd>{active.stats.consecutiveLosses}</dd>
                        </div>
                    </dl>
                    <JournalList entries={journal} decimalPlaces={feed.decimalPlaces} />
                    <button type='button' className='rise-fall__button' onClick={engine.clearJournal}>
                        {localize('Clear this mode’s journal')}
                    </button>
                </section>

                <p className='rise-fall__disclaimer'>
                    {localize(
                        'Rise/Fall contracts carry a house edge, so their expected value at typical stakes is negative. Risk limits cap losses — they do not create an edge. Virtual P/L is simulated against a stated payout assumption (' +
                            (VIRTUAL_PAYOUT_RATE * 100).toFixed(0) +
                            '% on a win) and is labelled ESTIMATED. Automated real-money trading is your own responsibility.'
                    )}
                </p>
            </div>
        </section>
    );
};

export default RiseFallPanel;
