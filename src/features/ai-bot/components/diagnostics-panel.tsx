/**
 * Connection diagnostics panel — a read-only view of the auth + market-data
 * connection state. Shows no tokens, secrets, or sensitive payloads.
 */

import { useAiBotContext } from '../ai-bot-context';

function maskLoginid(loginid: string | null): string {
    if (!loginid) return '—';
    if (loginid.length <= 4) return loginid;
    return `${loginid.slice(0, 2)}…${loginid.slice(-3)}`;
}

function formatTime(epoch: number | null): string {
    if (!epoch) return 'never';
    return new Date(epoch).toLocaleTimeString();
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'err' }) {
    return (
        <div className='aibot-diag__row'>
            <span className='aibot-diag__label'>{label}</span>
            <span className={`aibot-diag__value${tone ? ` aibot-diag__value--${tone}` : ''}`}>{value}</span>
        </div>
    );
}

export default function DiagnosticsPanel() {
    const { state } = useAiBotContext();
    const { auth } = state;
    const d = auth.diagnostics;

    const wsTone = d.wsState === 'connected' ? 'ok' : d.wsState === 'reconnecting' || d.wsState === 'connecting' ? 'warn' : 'err';
    const authTone = d.accountAuthorized ? 'ok' : d.authPhase === 'failed' ? 'err' : 'warn';
    const marketTone = d.marketDataState === 'connected' ? 'ok' : d.marketDataState === 'error' ? 'err' : 'warn';

    return (
        <section className='aibot-diag'>
            <h3 className='aibot-diag__title'>Connection Diagnostics</h3>
            <div className='aibot-diag__grid'>
                <Row label='WebSocket' value={d.wsState} tone={wsTone} />
                <Row label='Authorization' value={d.authPhase} tone={authTone} />
                <Row label='Account authorized' value={d.accountAuthorized ? 'yes' : 'no'} tone={d.accountAuthorized ? 'ok' : 'err'} />
                <Row label='Trade permission' value={d.tradePermitted ? 'granted' : 'missing'} tone={d.tradePermitted ? 'ok' : 'warn'} />
                <Row label='Market data' value={d.marketDataState} tone={marketTone} />
                <Row label='Active account' value={maskLoginid(auth.loginid)} />
                <Row label='Account mode' value={auth.isVirtual ? 'demo' : 'real'} />
                <Row label='Last authorized' value={formatTime(d.lastAuthAt)} />
                <Row label='Reconnect attempts' value={String(d.reconnectAttempt)} />
                <Row label='Retrying' value={d.retrying ? 'yes' : 'no'} tone={d.retrying ? 'warn' : 'ok'} />
            </div>
            {d.lastError && (
                <p className='aibot-diag__error'>Last error: {d.lastError}</p>
            )}
        </section>
    );
}
