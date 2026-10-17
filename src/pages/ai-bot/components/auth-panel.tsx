/**
 * Auth panel — OAuth login/logout, account mode indicator, and the explicit
 * real-mode confirmation gate.
 */

import { useState } from 'react';
import { generateOAuthURL } from '@/components/shared';
import { useAiBotContext } from '../ai-bot-context';

export default function AuthPanel() {
    const bot = useAiBotContext();
    const { state, settings, updateSettings, connectAuth, disconnectAuth } = bot;
    const [showRealConfirm, setShowRealConfirm] = useState(false);

    const handleLogin = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        }
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

    const isAuthorized = state.auth.status === 'authorized';

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
                        <span className='aibot-auth__value'>{state.auth.loginid}</span>
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
                        {state.auth.status}
                    </span>
                </div>
            </div>

            <div className='aibot-auth__actions'>
                {!isAuthorized ? (
                    <>
                        <button type='button' className='aibot-btn aibot-btn--primary' onClick={handleLogin}>
                            Log in with Deriv
                        </button>
                        <button type='button' className='aibot-btn' onClick={connectAuth}>
                            Connect
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
