import { useMemo, useState } from 'react';
import { ENGINE_WINDOW, PRIMARY_STRATEGIES, hasConfigErrors, strategiesFor, strategyLabel } from './config';
import ConfigPanel from './components/config-panel';
import ControlPanel from './components/control-panel';
import DigitFrequencyPanel from './components/digit-frequency-panel';
import PatternMonitor from './components/pattern-monitor';
import RecoveryMonitor from './components/recovery-monitor';
import ReportingPanel from './components/reporting-panel';
import RiskMonitor from './components/risk-monitor';
import { useGuiEngine } from './use-gui-engine';
import './gui-engine.scss';

/**
 * GUI Trading Engine — a second, graphical trading engine next to the Blockly
 * Bot Builder. It runs Over 1 / Under 8 from a rolling 1,000-tick digit window
 * with delayed confirmation, and an Even/Odd recovery leg after a confirmed
 * primary loss. Real contracts only: nothing is bought until Deriv confirms.
 */
export default function GuiEnginePage() {
    const engine = useGuiEngine();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const {
        config,
        configErrors,
        status,
        haltReason,
        session,
        winRate,
        trades,
        journal,
        primaryViews,
        recoveryView,
        liveStats,
        liveParity,
        decision,
        balance,
        isPurchasing,
        stakes,
        primaryPermission,
        hardLimit,
        isAuthorized,
        account,
        activeLoginid,
        feed,
        changeMarket,
        start,
        stop,
        pause,
        resume,
        resetSession,
    } = engine;

    const strategies = strategiesFor(config.strategy);
    const isDemo = account?.is_virtual === 1 || /^(VRT|VRTC)/.test(activeLoginid ?? '');
    const accountLabel = activeLoginid
        ? `${isDemo ? 'Demo' : 'Real'} · ${activeLoginid}`
        : isAuthorized
          ? 'Authorized'
          : 'Not signed in';

    const primaryStateLabel = strategies
        .map(id => `${PRIMARY_STRATEGIES[id].label}: ${primaryViews[id].state}`)
        .join(' · ');

    const startBlocker = useMemo(() => {
        if (hasConfigErrors(configErrors)) return 'Fix the highlighted configuration fields first.';
        if (!isAuthorized) return 'Sign in with your Deriv account to start live trading.';
        if (!feed.selectedMarket) return 'Choose a volatility market.';
        if (feed.selectedMarket.isSuspended) return 'The selected market is suspended.';
        if (!feed.selectedMarket.isOpen) return 'The selected market is currently closed.';
        if (feed.connection.status !== 'connected') return 'Waiting for the market-data connection.';
        if (feed.ticks.length < ENGINE_WINDOW)
            return `Loading the rolling window (${feed.ticks.length}/${ENGINE_WINDOW} ticks).`;
        if (hardLimit) return hardLimit;
        return null;
    }, [configErrors, feed.connection.status, feed.selectedMarket, feed.ticks.length, hardLimit, isAuthorized]);

    const connectionLabel =
        feed.connection.status === 'connected'
            ? 'Connected'
            : feed.connection.status === 'reconnecting'
              ? 'Reconnecting'
              : feed.connection.status === 'connecting'
                ? 'Connecting'
                : feed.connection.status;

    const precisionLabel =
        feed.precision.resolvedDecimalPlaces === null ? 'resolving' : `${feed.precision.resolvedDecimalPlaces} dp`;

    const configLocked = status !== 'stopped' && status !== 'error' && status !== 'halted';

    return (
        <div className='gui-engine'>
            <header className='ge-hero'>
                <div className='ge-hero__titles'>
                    <h2 className='ge-hero__title'>GUI Trading Engine</h2>
                    <p className='ge-hero__subtitle'>
                        Over 1 · Under 8 · Even/Odd recovery · rolling {ENGINE_WINDOW}-tick digit analysis with delayed
                        confirmation
                    </p>
                </div>
                <div className='ge-hero__chips'>
                    <span className={`ge-chip ge-chip--${feed.connection.status}`}>{connectionLabel}</span>
                    <span className={`ge-chip${isDemo ? ' ge-chip--demo' : ' ge-chip--real'}`}>
                        {isAuthorized ? (isDemo ? 'Demo account' : 'Real account') : 'Not signed in'}
                    </span>
                </div>
            </header>

            {!isAuthorized && (
                <p className='ge-alert ge-alert--info'>
                    Market data and strategy evaluation run while signed out, but Start needs your Deriv login — the
                    engine buys real contracts on the account signed in at the top of the app.
                </p>
            )}

            <ControlPanel
                status={status}
                haltReason={haltReason}
                accountLabel={accountLabel}
                marketName={feed.selectedMarket?.displayName ?? 'No market selected'}
                strategyLabel={strategyLabel(config.strategy)}
                connectionLabel={connectionLabel}
                dataFresh={feed.isDataFresh}
                primaryStateLabel={primaryStateLabel}
                recoveryStateLabel={recoveryView.state}
                session={session}
                stakes={stakes}
                takeProfit={config.takeProfit}
                stopLoss={config.stopLoss}
                balance={balance}
                isPurchasing={isPurchasing}
                canStart={!startBlocker}
                startHint={startBlocker}
                onRequestStart={() => setConfirmOpen(true)}
                onStop={() => stop()}
                onPause={pause}
                onResume={resume}
                onResetSession={resetSession}
            />

            {confirmOpen && (
                <div className='ge-confirm' role='dialog' aria-modal='true' aria-label='Confirm live trading'>
                    <div className='ge-confirm__card'>
                        <h3 className='ge-confirm__title'>Start live trading?</h3>
                        <p className='ge-confirm__body'>
                            The engine will send real contract proposals and purchases to Deriv on{' '}
                            <strong>{accountLabel}</strong> using <strong>{feed.selectedMarket?.displayName ?? '—'}</strong>{' '}
                            with the <strong>{strategyLabel(config.strategy)}</strong> strategy.
                        </p>
                        <dl className='ge-confirm__list'>
                            <div>
                                <dt>Initial stake</dt>
                                <dd>{config.initialStake.toFixed(2)}</dd>
                            </div>
                            <div>
                                <dt>Take profit</dt>
                                <dd>{config.takeProfit.toFixed(2)}</dd>
                            </div>
                            <div>
                                <dt>Stop loss</dt>
                                <dd>-{config.stopLoss.toFixed(2)}</dd>
                            </div>
                            <div>
                                <dt>Multiplier</dt>
                                <dd>×{config.multiplier}</dd>
                            </div>
                            <div>
                                <dt>Max consecutive losses</dt>
                                <dd>{config.maxConsecutiveLosses}</dd>
                            </div>
                            <div>
                                <dt>Max recovery trades</dt>
                                <dd>{config.maxRecoveryTrades}</dd>
                            </div>
                        </dl>
                        <p className='ge-confirm__warning'>
                            Digit-frequency filters describe the current window; they do not guarantee a profitable
                            trade.
                        </p>
                        <div className='ge-confirm__actions'>
                            <button
                                type='button'
                                className='ge-button ge-button--ghost'
                                onClick={() => setConfirmOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type='button'
                                className='ge-button ge-button--primary'
                                onClick={() => {
                                    setConfirmOpen(false);
                                    void start();
                                }}
                            >
                                Confirm &amp; start
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfigPanel
                config={config}
                errors={configErrors}
                disabled={configLocked}
                onChange={engine.setConfig}
                markets={feed.markets}
                selectedMarket={feed.selectedMarket}
                onSelectMarket={changeMarket}
                isLoadingMarkets={feed.markets.length === 0 && feed.connection.status !== 'connected'}
                stakeSummary={stakes}
            />

            <DigitFrequencyPanel
                stats={liveStats}
                parityEvenPercent={liveParity.evenPercent}
                strategy={config.strategy}
                permission={primaryPermission}
                lastTickAt={feed.lastTickAt}
                isDataFresh={feed.isDataFresh}
                isHistoryLoading={feed.isHistoryLoading}
                precisionLabel={precisionLabel}
            />

            <div className='ge-columns'>
                <PatternMonitor
                    previousDigit={feed.previousDigit}
                    latestDigit={feed.currentDigit}
                    primaryViews={primaryViews}
                    strategy={config.strategy}
                    permission={primaryPermission}
                    config={config}
                    decision={decision}
                    isPurchasing={isPurchasing}
                    status={status}
                />
                <RecoveryMonitor
                    recovery={recoveryView}
                    parity={liveParity}
                    config={config}
                    session={session}
                    stakes={stakes}
                    isPurchasing={isPurchasing}
                />
            </div>

            <RiskMonitor
                config={config}
                session={session}
                stakes={stakes}
                status={status}
                hardLimit={hardLimit}
                balance={balance}
            />

            <ReportingPanel
                trades={trades}
                journal={journal}
                session={session}
                status={status}
                winRate={winRate}
                currency={account?.currency ?? 'USD'}
            />

            <p className='ge-footer-note'>
                Feed: genuine Deriv public market data · precision {precisionLabel} · window {liveStats.total}/
                {ENGINE_WINDOW} ticks. Red-bar analysis elsewhere in the app never blocks, cancels or forces this
                engine's signals.
            </p>
        </div>
    );
}
