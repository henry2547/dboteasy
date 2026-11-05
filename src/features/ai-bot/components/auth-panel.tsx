/**
 * Auth panel — account selection, account-mode indicator, the explicit
 * real-mode confirmation gate, and connection diagnostics.
 *
 * There is no login button here on purpose: the AI Bot rides the app's own
 * Deriv login (the header's Log in / Sign up buttons), so a logged-in header
 * session is all the scanners and execution need.
 */

import { useState } from 'react';
import { useAiBotContext } from '../ai-bot-context';
import DiagnosticsPanel from './diagnostics-panel';

function maskLoginid(loginid: string | null): string {
    if (!loginid) return '';
    if (loginid.length <= 4) return loginid;
    return `${loginid.slice(0, 2)}…${loginid.slice(-3)}`;
}

export default function AuthPanel() {
    const bot = useAiBotContext();
    const { state, settings, updateSettings, connectAuth, disconnectAuth, selectAccount } = bot;
    const [showRealConfirm, setShowRealConfirm] = useState(false);

    const isAuthorized = state.auth.status === 'authorized';
    const isBusy =
        state.auth.status === 'connecting' ||
        state.auth.status === 'reconnecting' ||
        state.auth.status === 'authorizing';
    const accounts = state.auth.accounts;
    const activeAccount = accounts.find(a => a.isActive) ?? accounts[0] ?? null;

    const handleConnect = () => {
        if (isBusy) return;
        connectAuth();
    };

    // A session is "running" from the moment it starts (Scanning, Setup Detected,
    // Risk Check, Executing, Contract Open, Paused…) until it stops. The trading
    // account cannot be switched while a session is in progress.
    const isRunning = state.botState !== 'Stopped' && state.botState !== 'Error';

    const handleSwitchMode = (mode: 'demo' | 'real') => {
        if (isRunning) return;
        if (mode === 'real' && settings.accountMode === 'demo') {
            setShowRealConfirm(true);
            return;
        }
        updateSettings({ ...settings, accountMode: mode });
    };

    const confirmReal = () => {
        if (isRunning) return;
        updateSettings({ ...settings, accountMode: 'real' });
        setShowRealConfirm(false);
    };

    const handleAccountChange = (loginid: string) => {
        if (!isAuthorized || isRunning) return;
        selectAccount(loginid);
    };

    // Verify the selected account mode matches the authorized account.
    const modeMismatch =
        isAuthorized &&
        activeAccount != null &&
        settings.accountMode !== activeAccount.accountType;

    return (
        <section className='aibot-auth'>
            <div className='aibot-auth__info'>
                <div className='aibot-auth__row'>
                    <span className='aibot-auth__label'>Account</span>
                    <span className={`aibot-auth__value aibot-auth__value--${settings.accountMode}`}>
                        {settings.accountMode === 'demo' ? 'DEMO' : 'REAL'}
                    </span>
                </div>
                {state.auth.loginid && (
                    <div className='aibot-auth__row'>
                        <span className='aibot-auth__label'>Login ID</span>
                        <span className='aibot-auth__value'>{maskLoginid(state.auth.loginid)}</span>
                    </div>
                )}
                {state.auth.balance !== null && (
                    <div className='aibot-auth__row'>
                        <span className='aibot-auth__label'>Balance</span>
                        <span className='aibot-auth__value'>
                            {state.auth.balance.toFixed(2)} {state.auth.currency ?? ''}
                        </span>
                    </div>
                )}
                <div className='aibot-auth__row'>
                    <span className='aibot-auth__label'>Auth status</span>
                    <span className={`aibot-auth__value aibot-auth__value--${state.auth.status}`}>
                        {state.auth.status === 'authorization_required'
                            ? 'login required'
                            : state.auth.status === 'authorized'
                              ? 'AUTHORIZED'
                              : state.auth.status}
                    </span>
                </div>
            </div>

            {isAuthorized && accounts.length > 1 && (
                <div className='aibot-auth__account-select'>
                    <label className='aibot-auth__label' htmlFor='aibot-account-select'>
                        Authorized account
                    </label>
                    <select
                        id='aibot-account-select'
                        className='aibot-auth__select'
                        value={activeAccount?.loginid ?? ''}
                        onChange={e => handleAccountChange(e.target.value)}
                        disabled={isRunning}
                    >
                        {accounts.map(a => (
                            <option key={a.loginid} value={a.loginid}>
                                {a.loginid} — {a.accountType === 'demo' ? 'Demo' : 'Real'} ({a.currency})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {!isAuthorized && (
                <p className='aibot-banner aibot-banner--info'>
                    The AI scanners use your Deriv account. Log in with the <strong>Log in</strong> button at the
                    top-right of the header — this tab connects automatically.
                </p>
            )}

            <div className='aibot-auth__actions'>
                {!isAuthorized ? (
                    state.auth.diagnostics.tradePermitted && (
                        <button type='button' className='aibot-btn' onClick={handleConnect} disabled={isBusy}>
                            {isBusy ? 'Connecting…' : 'Reconnect'}
                        </button>
                    )
                ) : (
                    <>
                        <div className='aibot-auth__mode-group'>
                            <span className='aibot-auth__label'>Trading account</span>
                            <div className='aibot-auth__mode-toggle' role='group' aria-label='Trading account'>
                                <button
                                    type='button'
                                    className={`aibot-btn aibot-btn--sm ${settings.accountMode === 'demo' ? 'aibot-btn--active' : ''}`}
                                    onClick={() => handleSwitchMode('demo')}
                                    disabled={isRunning}
                                    aria-pressed={settings.accountMode === 'demo'}
                                >
                                    Demo
                                </button>
                                <button
                                    type='button'
                                    className={`aibot-btn aibot-btn--sm ${settings.accountMode === 'real' ? 'aibot-btn--active aibot-btn--danger' : ''}`}
                                    onClick={() => handleSwitchMode('real')}
                                    disabled={isRunning}
                                    aria-pressed={settings.accountMode === 'real'}
                                >
                                    Real
                                </button>
                            </div>
                            {isRunning && (
                                <span className='aibot-auth__mode-locked'>
                                    Locked while the bot is running — stop it to switch accounts.
                                </span>
                            )}
                        </div>
                        <button
                            type='button'
                            className='aibot-btn aibot-btn--danger'
                            onClick={disconnectAuth}
                            disabled={isRunning}
                        >
                            Disconnect
                        </button>
                    </>
                )}
            </div>

            {state.auth.errorMessage && (
                <p className='aibot-banner aibot-banner--error'>{state.auth.errorMessage}</p>
            )}
            {modeMismatch && (
                <p className='aibot-banner aibot-banner--info'>
                    The authorized account is {activeAccount?.accountType} but {settings.accountMode} mode is
                    selected. Starting the bot or Quick Trade will auto-switch to your {settings.accountMode} account.
                </p>
            )}

            <DiagnosticsPanel />

            {showRealConfirm && (
                <div className='aibot-modal-overlay'>
                    <div className='aibot-modal'>
                        <h3 className='aibot-modal__title'>Enable Real-Money Trading</h3>
                        <p className='aibot-modal__body'>
                            You are about to enable <strong>real-money</strong> execution. Trades will use your real
                            Deriv account and real funds. Please confirm:
                        </p>
                        <ul className='aibot-modal__list'>
                            <li>Stake: <strong>{settings.stake}</strong></li>
                            <li>Max stake: <strong>{settings.maxStake}</strong></li>
                            <li>Session loss limit: <strong>{settings.sessionLossLimit}</strong></li>
                            <li>Daily loss limit: <strong>{settings.dailyLossLimit}</strong></li>
                            <li>Max trades: <strong>{settings.maxTrades}</strong></li>
                        </ul>
                        <p className='aibot-modal__warn'>
                            This is not a guaranteed profit. You can lose money. A prominent Stop Bot control is always
                            available.
                        </p>
                        <div className='aibot-modal__actions'>
                            <button type='button' className='aibot-btn' onClick={() => setShowRealConfirm(false)}>
                                Cancel
                            </button>
                            <button type='button' className='aibot-btn aibot-btn--danger' onClick={confirmReal}>
                                I understand — enable Real
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
