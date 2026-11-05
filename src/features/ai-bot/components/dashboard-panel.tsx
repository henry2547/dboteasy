/**
 * Dashboard panel — bot state, session P/L, trade count, consecutive outcomes,
 * open-contract status, and the Start/Stop/Pause controls.
 */

import { useAiBotContext } from '../ai-bot-context';

export default function DashboardPanel() {
    const bot = useAiBotContext();
    const { state, settings, startBot, stopBot, pauseBot, resumeBot } = bot;
    const { session, botState } = state;

    const isRunning = botState !== 'Stopped' && botState !== 'Error';
    const remainingLoss = settings.sessionLossLimit > 0
        ? Math.max(0, settings.sessionLossLimit + session.realizedProfit)
        : null;
    const profitTargetStatus = settings.sessionProfitTarget > 0
        ? `${session.realizedProfit.toFixed(2)} / ${settings.sessionProfitTarget}`
        : '—';

    return (
        <section className='aibot-dashboard'>
            <div className='aibot-dashboard__controls'>
                {!isRunning ? (
                    <button
                        type='button'
                        className='aibot-btn aibot-btn--primary aibot-btn--lg'
                        onClick={startBot}
                        disabled={state.auth.status !== 'authorized'}
                    >
                        ▶ Start Bot
                    </button>
                ) : (
                    <>
                        <button type='button' className='aibot-btn aibot-btn--danger aibot-btn--lg' onClick={stopBot}>
                            ■ Stop Bot
                        </button>
                        {botState === 'Paused' ? (
                            <button type='button' className='aibot-btn aibot-btn--lg' onClick={resumeBot}>
                                Resume
                            </button>
                        ) : (
                            <button type='button' className='aibot-btn aibot-btn--lg' onClick={pauseBot}>
                                Pause
                            </button>
                        )}
                    </>
                )}
            </div>

            <div className='aibot-dashboard__stats'>
                <StatCard label='Bot State' value={botState} tone={botState} />
                <StatCard label='Session P/L' value={session.realizedProfit.toFixed(2)} tone={session.realizedProfit >= 0 ? 'positive' : 'negative'} />
                <StatCard
                    label='Loss Allowance Left'
                    value={remainingLoss !== null ? remainingLoss.toFixed(2) : '—'}
                    tone='neutral'
                />
                <StatCard label='Profit Target' value={profitTargetStatus} tone='neutral' />
                <StatCard label='Trades' value={`${session.tradeCount} / ${settings.maxTrades}`} tone='neutral' />
                <StatCard label='Wins / Losses' value={`${session.winCount} / ${session.lossCount}`} tone='neutral' />
                <StatCard
                    label='Consec. Losses'
                    value={String(session.consecutiveLosses)}
                    tone={session.consecutiveLosses >= settings.maxConsecutiveLosses - 1 ? 'negative' : 'neutral'}
                />
                <StatCard label='Consec. Wins' value={String(session.consecutiveWins)} tone='positive' />
                <StatCard label='Open Contracts' value={String(session.openCount)} tone='neutral' />
                <StatCard
                    label='Mode'
                    value={settings.accountMode === 'demo' ? 'DEMO' : 'REAL'}
                    tone={settings.accountMode === 'real' ? 'negative' : 'neutral'}
                />
            </div>

            {session.stopReason && (
                <p className={`aibot-banner aibot-banner--${session.stopReason === 'manual' ? 'info' : 'warning'}`}>
                    Session stopped: {session.stopReason.replace(/_/g, ' ')}
                </p>
            )}
        </section>
    );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
        <div className={`aibot-stat aibot-stat--${tone}`}>
            <span className='aibot-stat__label'>{label}</span>
            <span className='aibot-stat__value'>{value}</span>
        </div>
    );
}
