import React from 'react';
import { localize } from '@deriv-com/translations';
import { MODE_LABELS } from '../types';
import { STAKING_RULE } from '../risk-engine';
import { useRiseFallEngine } from '../use-rise-fall-engine';
import AccountPanel from './account-panel';
import BacktestPanel from './backtest-panel';
import EngineControls from './engine-controls';
import MarketPanel from './market-panel';
import RiskEditor from './risk-editor';
import SessionPanel from './session-panel';
import StrategyPanel from './strategy-panel';
import StrategyRanking from './strategy-ranking';
import '../rise-fall-page.scss';

/**
 * The Rise/Fall tab — the engine's home, right after the Bot Builder.
 *
 * One engine instance serves the whole tab: the modes, the eight strategies, the
 * risk limits, the walk-forward ranking and the active mode's journal. Nothing
 * here places an order; every entry goes through the central executor.
 */
const RiseFallPage = () => {
    const engine = useRiseFallEngine(true);
    const { feed, snapshot, notice } = engine;
    const mode = snapshot.mode;
    const active = snapshot.modes[mode];

    return (
        <section className='rise-fall' data-testid='rise-fall-page'>
            <header className='rise-fall__hero'>
                <div>
                    <h1 className='rise-fall__hero-title'>{localize('Rise/Fall engine')}</h1>
                    <p className='rise-fall__hero-subtitle'>
                        {localize(
                            'Eight strategies on genuine Deriv ticks · Virtual, Demo and Real modes kept strictly apart · every entry passes one central executor.'
                        )}
                    </p>
                </div>
                <div className='rise-fall__hero-badges'>
                    <span className='rise-fall__badge'>{localize('Mode')}: {MODE_LABELS[mode]}</span>
                    <span className='rise-fall__badge'>
                        {feed.market?.displayName ?? localize('Loading market…')}
                    </span>
                    <span className='rise-fall__badge'>{active.state.toUpperCase()}</span>
                </div>
            </header>

            <div className='rise-fall__body'>
                <EngineControls
                    mode={mode}
                    active={active}
                    notice={notice}
                    lastOutcome={snapshot.lastOutcome}
                    onSetMode={engine.setMode}
                    onStart={engine.start}
                    onPause={engine.pause}
                    onStop={engine.stop}
                    onEmergency={engine.emergencyStop}
                    onReleaseEmergency={engine.releaseEmergencyStop}
                />
                <AccountPanel
                    mode={mode}
                    active={active}
                    live={engine.live}
                    decimalPlaces={feed.decimalPlaces}
                    onArmReal={engine.armReal}
                    onReconnect={engine.reconnectAccount}
                    onConfirm={engine.confirmEntry}
                    onCancel={engine.cancelPendingEntry}
                />
                <MarketPanel feed={feed} disabled={Boolean(active.openContract)} />
                <StrategyPanel
                    signal={engine.signal}
                    strategyId={engine.strategyId}
                    config={engine.config}
                    durationTicks={engine.durationTicks}
                    onSelect={engine.setStrategyId}
                    onConfig={engine.updateConfig}
                    onDuration={engine.setDurationTicks}
                />
                <StrategyRanking
                    signals={engine.signals}
                    strategyId={engine.strategyId}
                    onSelect={engine.setStrategyId}
                />
                <BacktestPanel results={engine.backtest} notice={engine.backtestNotice} onRun={engine.runBacktest} />
                <section className='rise-fall__section' data-testid='rise-fall-risk-section'>
                    <div className='rise-fall__section-head'>
                        <h3>{localize('Risk limits')}</h3>
                        <span className='rise-fall__status'>{MODE_LABELS[mode]}</span>
                    </div>
                    <RiskEditor risk={active.risk} onChange={engine.setRiskField} />
                    <p className='rise-fall__note'>{STAKING_RULE}</p>
                </section>
                <SessionPanel
                    mode={mode}
                    active={active}
                    journal={engine.journal}
                    decimalPlaces={feed.decimalPlaces}
                    onClearJournal={engine.clearJournal}
                />
            </div>
        </section>
    );
};

export default RiseFallPage;
