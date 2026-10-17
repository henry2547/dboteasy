/**
 * Auth panel — OAuth login/logout, account selection, account-mode indicator,
 * the explicit real-mode confirmation gate, and connection diagnostics.
 */

import { useState } from 'react';
import { generateOAuthURL } from '@/components/shared';
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
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const isAuthorized = state.auth.status === 'authorized';
    const isBusy =
        state.auth.status === 'connecting' ||
        state.auth.status === 'reconnecting' ||
        state.auth.status === 'authorizing';
    const accounts = state.auth.accounts;
    const activeAccount = accounts.find(a => a.isActive) ?? accounts[0] ?? null;

    const handleLogin = async () => {
        if (isLoggingIn) return;
        setIsLoggingIn(true);
        try {
            const oauthUrl = await generateOAuthURL();
            if (oauthUrl) {
                window.location.replace(oauthUrl);
            } else {
                setIsLoggingIn(false);
            }
        } catch {
            setIsLoggingIn(false);
        }
    };

    const handleConnect = () => {
        if (isBusy) return;
        connectAuth();
    };

    const handleSwitchMode = (mode: 'demo' | 'real') => {
        if (mode === 'real' && settings.accountMode === 'demo') {
            setShowRealConfirm(true);
            return;
        }
        updateSettings({ ...settings, accountMode: mode });
    };

    const confirmReal = () => {
        updateSettings({ ...settings, accountMode: 'real' });
        setShowRealConfirm(false);
    };

    const handleAccountChange = (loginid: string) => {
        if (!isAuthorized) return;
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
                    >
                        {accounts.map(a => (
                            <option key={a.loginid} value={a.loginid}>
                                {a.loginid} — {a.accountType === 'demo' ? 'Demo' : 'Real'} ({a.currency})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className='aibot-auth__actions'>
                {!isAuthorized ? (
                    <>
                        <button
                            type='button'
                            className='aibot-btn aibot-btn--primary'
                            onClick={handleLogin}
                            disabled={isLoggingIn}
                        >
                            {isLoggingIn ? 'Redirecting…' : 'Log in with Deriv'}
                        </button>
                        <button
                            type='button'
                            className='aibot-btn'
                            onClick={handleConnect}
                            disabled={isBusy}
                        >
                            {isBusy ? 'Connecting…' : 'Connect'}
                        </button>
                    </>
                ) : (
                    <>
                        <div className='aibot-auth__mode-toggle'>
                            <button
                                type='button'
                                className={`aibot-btn aibot-btn--sm ${settings.accountMode === 'demo' ? 'aibot-btn--active' : ''}`}
                                onClick={() => handleSwitchMode('demo')}
                            >
                                Demo
                            </button>
                            <button
                                type='button'
                                className={`aibot-btn aibot-btn--sm ${settings.accountMode === 'real' ? 'aibot-btn--active aibot-btn--danger' : ''}`}
                                onClick={() => handleSwitchMode('real')}
                            >
                                Real
                            </button>
                        </div>
                        <button type='button' className='aibot-btn aibot-btn--danger' onClick={disconnectAuth}>
                            Disconnect
                        </button>
                    </>
                )}
            </div>

            {state.auth.errorMessage && (
                <p className='aibot-banner aibot-banner--error'>{state.auth.errorMessage}</p>
            )}
            {modeMismatch && (
                <p className='aibot-banner aibot-banner--error'>
                    The selected {settings.accountMode} mode does not match the authorized account
                    ({activeAccount?.loginid} is {activeAccount?.accountType}). Switch account or mode.
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
