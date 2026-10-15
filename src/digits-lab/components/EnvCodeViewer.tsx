/**
 * Env Code Viewer — login gate to view environment configuration.
 *
 * A simple PIN-based login that, when unlocked, displays the app's
 * environment variables (app_id, app_name, env, etc.).
 * This is NOT Deriv OAuth — it's a local gate to view config.
 */

import React, { useState } from 'react';

// Simple local PIN — not a security measure, just a gate to view config.
const VIEWER_PIN = '34nLjEhE';

const envConfig: { key: string; value: string; description: string }[] = [
    {
        key: 'NEXT_PUBLIC_DERIV_APP_ID',
        value: process.env.NEXT_PUBLIC_DERIV_APP_ID || '(not set)',
        description: 'Deriv application ID for WebSocket connections and OAuth',
    },
    {
        key: 'NEXT_PUBLIC_DERIV_APP_NAME',
        value: process.env.NEXT_PUBLIC_DERIV_APP_NAME || '(not set)',
        description: 'Application name used for branding',
    },
    {
        key: 'NEXT_PUBLIC_DERIV_ENV',
        value: process.env.NEXT_PUBLIC_DERIV_ENV || '(not set)',
        description: 'Environment signal (production/development)',
    },
    {
        key: 'NEXT_PUBLIC_DERIV_REFERRAL_LINK',
        value: process.env.NEXT_PUBLIC_DERIV_REFERRAL_LINK || '(not set)',
        description: 'Partner referral link for affiliate attribution',
    },
    {
        key: 'NEXT_PUBLIC_APP_BUILD',
        value: process.env.NEXT_PUBLIC_APP_BUILD || '(not set)',
        description: 'Marks the static preview build',
    },
];

const EnvCodeViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [pin, setPin] = useState('');
    const [unlocked, setUnlocked] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === VIEWER_PIN) {
            setUnlocked(true);
            setError('');
        } else {
            setError('Incorrect PIN. Hint: first 8 chars of your App ID.');
        }
    };

    const handleCopy = (key: string, value: string) => {
        navigator.clipboard.writeText(`${key}=${value}`).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    return (
        <div className="dl-env-overlay" onClick={onClose}>
            <div className="dl-env-modal" onClick={(e) => e.stopPropagation()}>
                <div className="dl-env-modal__header">
                    <h2>Environment Configuration</h2>
                    <button className="dl-env-modal__close" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>

                {!unlocked ? (
                    <div className="dl-env-login">
                        <p>Enter PIN to view environment configuration codes.</p>
                        <form onSubmit={handleUnlock}>
                            <input
                                type="password"
                                placeholder="Enter PIN…"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                autoFocus
                                className="dl-env-login__input"
                            />
                            <button type="submit" className="dl-btn dl-btn--primary">
                                Unlock
                            </button>
                        </form>
                        {error && <p className="dl-env-login__error">{error}</p>}
                        <p className="dl-env-login__hint">
                            PIN hint: the first 8 characters of your Deriv App ID.
                        </p>
                    </div>
                ) : (
                    <div className="dl-env-list">
                        {envConfig.map((env) => (
                            <div key={env.key} className="dl-env-item">
                                <div className="dl-env-item__key">{env.key}</div>
                                <div className="dl-env-item__value">
                                    <code>{env.value}</code>
                                    <button
                                        className="dl-env-item__copy"
                                        onClick={() => handleCopy(env.key, env.value)}
                                        aria-label={`Copy ${env.key}`}
                                    >
                                        {copied === env.key ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div className="dl-env-item__desc">{env.description}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnvCodeViewer;
