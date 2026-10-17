/** Session P/L, targets, trade count, consecutive outcomes, loss allowance. */

import { observer } from 'mobx-react-lite';
import type { ScannerConfig, SessionStats } from '../scanner-types';
import type { ScannerStore } from '../scanner-store';

const SessionPanel = observer(
    ({ session, config, store }: { session: SessionStats; config: ScannerConfig; store: ScannerStore }) => {
        const pnl = session.realizedPnl;
        const pnlClass = pnl > 0 ? 'scanner-session__value--pos' : pnl < 0 ? 'scanner-session__value--neg' : '';
        const progress = store.profitTargetProgress ?? 0;
        const remaining = store.remainingLossAllowance ?? 0;

        return (
            <article className='scanner-card'>
                <h3 className='scanner-card__title'>Session</h3>

                <div className='scanner-session__stats'>
                    <div className='scanner-session__stat'>
                        <div className='scanner-session__label'>Realised P/L</div>
                        <div className={`scanner-session__value ${pnlClass}`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                        </div>
                    </div>
                    <div className='scanner-session__stat'>
                        <div className='scanner-session__label'>Trades</div>
                        <div className='scanner-session__value'>{session.trades} / {config.maxTrades}</div>
                    </div>
                    <div className='scanner-session__stat'>
                        <div className='scanner-session__label'>Wins / Losses</div>
                        <div className='scanner-session__value'>{session.wins} / {session.losses}</div>
                    </div>
                    <div className='scanner-session__stat'>
                        <div className='scanner-session__label'>Consecutive</div>
                        <div className='scanner-session__value'>
                            {session.consecutiveWins}W · {session.consecutiveLosses}L
                        </div>
                    </div>
                    <div className='scanner-session__stat'>
                        <div className='scanner-session__label'>Open contracts</div>
                        <div className='scanner-session__value'>{session.openContracts}</div>
                    </div>
                    <div className='scanner-session__stat'>
                        <div className='scanner-session__label'>Loss allowance</div>
                        <div className='scanner-session__value'>{remaining.toFixed(2)}</div>
                    </div>
                </div>

                <div style={{ marginTop: '0.8rem' }}>
                    <div className='scanner-session__label'>
                        Profit target: {pnl.toFixed(2)} / {config.sessionProfitTarget}
                    </div>
                    <div className='scanner-progress'>
                        <div className='scanner-progress__fill' style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                    </div>
                </div>

                {session.stopReason && (
                    <p style={{ marginTop: '0.8rem', color: '#c0392b', fontWeight: 600 }}>
                        Stopped: {session.stopReason}
                    </p>
                )}

                <p className='scanner-settings__hint' style={{ marginTop: '0.8rem' }}>
                    Profit target and loss limit are measured as net realised P/L from settled contracts.
                    They are not guaranteed — open contracts and execution latency can affect the final result.
                </p>
            </article>
        );
    }
);

export default SessionPanel;
