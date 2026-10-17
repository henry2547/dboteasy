/** Header: bot state, account mode, connection, start/stop controls. */

import { observer } from 'mobx-react-lite';
import type { ScannerStore } from '../scanner-store';

function timeAgo(ms: number): string {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
}

const ScannerHeader = observer(({ store }: { store: ScannerStore }) => {
    const { state, connection, authorized, activeLoginid, config } = store;
    const isDemo = config.accountMode === 'demo';
    const canStart = state === 'Stopped' || state === 'Error';
    const canStop = state !== 'Stopped';

    return (
        <header className='scanner-header'>
            <div className='scanner-header__titles'>
                <h2 className='scanner-header__title'>AI Market Scanner</h2>
                <p className='scanner-header__subtitle'>
                    Live market scanning · deterministic strategy engine · risk-managed execution
                </p>
            </div>

            <div className='scanner-header__actions'>
                <span className={`scanner-pill ${isDemo ? 'scanner-pill--demo' : 'scanner-pill--real'}`}>
                    {isDemo ? 'Demo' : 'Real'}
                </span>
                <span className={`scanner-pill ${authorized ? 'scanner-pill--ok' : 'scanner-pill--bad'}`}>
                    {authorized ? `Connected${activeLoginid ? ` · ${activeLoginid}` : ''}` : 'Not connected'}
                </span>
                <span className={`scanner-pill ${connection === 'connected' ? 'scanner-pill--ok' : 'scanner-pill--bad'}`}>
                    Feed: {connection}
                </span>
                <span className={`scanner-state scanner-state--${state}`}>{state}</span>

                {canStart && (
                    <button
                        type='button'
                        className='scanner-btn scanner-btn--start'
                        onClick={() => store.start()}
                        disabled={store.configProblems.length > 0}
                    >
                        Start bot
                    </button>
                )}
                {canStop && (
                    <button type='button' className='scanner-btn scanner-btn--stop' onClick={() => store.stop()}>
                        Stop bot
                    </button>
                )}
                {state === 'Paused' ? (
                    <button type='button' className='scanner-btn' onClick={() => store.resume()}>
                        Resume
                    </button>
                ) : (
                    state !== 'Stopped' && (
                        <button type='button' className='scanner-btn' onClick={() => store.pause()}>
                            Pause
                        </button>
                    )
                )}
            </div>

            {store.errorMessage && (
                <p className='scanner-card__muted' style={{ color: '#c0392b', flexBasis: '100%' }}>
                    {store.errorMessage}{' '}
                    <button type='button' className='scanner-btn scanner-btn--danger' onClick={() => store.dismissError()}>
                        Dismiss
                    </button>
                </p>
            )}
        </header>
    );
});

export default ScannerHeader;
