/**
 * DTrader tab — the main "Charts" slot now hosts Deriv Trader (DTrader), Deriv's
 * own manual trading terminal from the official site, embedded in the tab.
 *
 * The user's existing Deriv session is handed over through DTrader's cross-app
 * login URL parameters (`acct1` / `token1` / `cur1`), so a logged-in user lands
 * on the terminal already signed in on the account they are using in this app.
 *
 * Deriv's login page refuses to be framed (`X-Frame-Options: DENY`), so a
 * signed-out visitor is asked to log in first instead of being shown a frame
 * that could never complete a login. The access token is only ever placed in
 * the iframe URL — it is never logged.
 */

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL, standalone_routes } from '@/components/shared';
import { getActiveLoginId, getAuthInfo } from '@/external/deriv-core';
import { useStore } from '@/hooks/useStore';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import './dtrader-tab.scss';

interface DerivSession {
    loginid: string;
    token: string;
    currency: string;
    is_demo: boolean;
}

/**
 * Reads the Deriv session the app already holds: the OAuth access token
 * (`auth_info`), the active account id (`active_loginid`) and that account's
 * currency (from the accounts list fetched after login).
 */
const readSession = (): DerivSession | null => {
    const token = getAuthInfo()?.access_token;
    const loginid = getActiveLoginId() || localStorage.getItem('active_loginid') || '';

    if (!token || !loginid) return null;

    const account = DerivWSAccountsService.getStoredAccounts()?.find(item => item.account_id === loginid);

    return {
        loginid,
        token,
        currency: account?.currency ?? '',
        is_demo: loginid.startsWith('VRT'),
    };
};

const buildDtraderUrl = (session: DerivSession | null, language: string) => {
    const url = new URL(standalone_routes.trade);
    url.searchParams.set('lang', (language || 'EN').toUpperCase());

    if (session) {
        url.searchParams.set('acct1', session.loginid);
        url.searchParams.set('token1', session.token);
        if (session.currency) url.searchParams.set('cur1', session.currency);
    }

    return url.toString();
};

const DTraderTab = observer(() => {
    const { common } = useStore();
    const [session, setSession] = useState(readSession);
    const [frame_key, setFrameKey] = useState(0);

    // OAuth login is a full page redirect, so the stored session is already in
    // place when this tab mounts. The storage listener covers logging in or out
    // in another tab without a reload.
    useEffect(() => {
        const sync_session = () => setSession(readSession());

        window.addEventListener('storage', sync_session);
        return () => window.removeEventListener('storage', sync_session);
    }, []);

    const handleLogin = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        }
    };

    const dtrader_url = buildDtraderUrl(session, common.current_language);

    if (!session) {
        return (
            <div className='dtrader dtrader--signed-out'>
                <div className='dtrader__card'>
                    <h2 className='dtrader__card-title'>Deriv Trader</h2>
                    <p className='dtrader__card-text'>
                        Trade manually on Deriv&apos;s official terminal — live charts, contract types, barriers and
                        order placement — without leaving this app.
                    </p>
                    <p className='dtrader__card-note'>Log in with your Deriv account to open the terminal.</p>
                    <button type='button' className='dtrader__btn dtrader__btn--primary' onClick={handleLogin}>
                        Log in with Deriv
                    </button>
                    <a
                        className='dtrader__btn'
                        href={dtrader_url}
                        target='_blank'
                        rel='noopener noreferrer'
                        data-testid='dtrader-open-new-tab'
                    >
                        Open Deriv Trader in a new tab
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className='dtrader'>
            <div className='dtrader__bar'>
                <span className='dtrader__title'>Deriv Trader</span>
                <span
                    className={`dtrader__account dtrader__account--${session.is_demo ? 'demo' : 'real'}`}
                    data-testid='dtrader-account'
                >
                    {session.loginid}
                </span>
                <span className='dtrader__bar-actions'>
                    <button
                        type='button'
                        className='dtrader__btn dtrader__btn--sm'
                        onClick={() => setFrameKey(key => key + 1)}
                    >
                        Reload
                    </button>
                    <a
                        className='dtrader__btn dtrader__btn--sm'
                        href={dtrader_url}
                        target='_blank'
                        rel='noopener noreferrer'
                        data-testid='dtrader-open-new-tab'
                    >
                        Open in new tab
                    </a>
                </span>
            </div>
            <iframe key={frame_key} className='dtrader__frame' src={dtrader_url} title='Deriv Trader' />
        </div>
    );
});

export default DTraderTab;
