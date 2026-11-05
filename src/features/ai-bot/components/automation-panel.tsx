/**
 * Automation panel — quick-trade controls and automation status. Gives the
 * user a one-shot "Quick Trade" button (scan once, take the best qualifying
 * entry, stop after it settles) alongside the running-bot indicators, so
 * trades can be taken manually or fully automatically from one place.
 */

import { useAiBotContext } from '../ai-bot-context';

export default function AutomationPanel() {
    const bot = useAiBotContext();
    const { state, settings, startBot, stopBot, quickTrade } = bot;
    const { botState, auth, isScanning } = state;

    const isAuthorized = auth.status === 'authorized';
    const isRunning = botState !== 'Stopped' && botState !== 'Error';
    const isBusy =
        botState === 'Executing' ||
        botState === 'Contract Open' ||
        botState === 'Awaiting Confirmation' ||
        botState === 'Risk Check' ||
        botState === 'Setup Detected';
    const canQuickTrade = isAuthorized && !isRunning && !isScanning;

    return (
        <section className='aibot-panel'>
            <div className='aibot-panel__header'>
                <h3 className='aibot-panel__title'>Automation</h3>
                <span className={`aibot-badge ${isRunning ? 'aibot-badge--success' : 'aibot-badge--muted'}`}>
                    {isRunning ? 'Active' : 'Idle'}
                </span>
            </div>

            <div className='aibot-automation'>
                <div className='aibot-automation__group'>
                    <h4 className='aibot-automation__label'>Auto-run bot</h4>
                    <p className='aibot-automation__hint'>
                        Continuously scans and takes every qualifying trade until a stop condition is met.
                    </p>
                    {!isRunning ? (
                        <button
                            type='button'
                            className='aibot-btn aibot-btn--primary'
                            onClick={startBot}
                            disabled={!isAuthorized}
                        >
                            ▶ Start auto-trading
                        </button>
                    ) : (
                        <button
                            type='button'
                            className='aibot-btn aibot-btn--danger'
                            onClick={stopBot}
                        >
                            ■ Stop bot
                        </button>
                    )}
                </div>

                <div className='aibot-automation__divider' />

                <div className='aibot-automation__group'>
                    <h4 className='aibot-automation__label'>Quick trade</h4>
                    <p className='aibot-automation__hint'>
                        Scan once and take a single trade on the best qualifying market, then stop.
                        {settings.accountMode === 'real' && ' Real mode asks you to confirm before buying.'}
                    </p>
                    <button
                        type='button'
                        className='aibot-btn'
                        onClick={quickTrade}
                        disabled={!canQuickTrade}
                    >
                        {isScanning ? 'Scanning…' : '⚡ Quick Trade'}
                    </button>
                </div>

                <div className='aibot-automation__divider' />

                <div className='aibot-automation__group'>
                    <h4 className='aibot-automation__label'>Current mode</h4>
                    <div className='aibot-automation__mode-row'>
                        <span className={`aibot-badge ${settings.accountMode === 'real' ? 'aibot-badge--danger' : 'aibot-badge--info'}`}>
                            {settings.accountMode === 'demo' ? 'DEMO' : 'REAL'}
                        </span>
                        <span className='aibot-automation__state'>{botState}</span>
                        {isBusy && <span className='aibot-badge aibot-badge--warning'>busy</span>}
                    </div>
                    {!isAuthorized && (
                        <p className='aibot-automation__hint'>
                            Log in with the <strong>Log in</strong> button in the header to enable trading.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
