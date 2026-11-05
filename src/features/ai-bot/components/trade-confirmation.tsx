/**
 * Real-money confirmation dialog.
 *
 * The bot holds every real-money entry back until it is approved here, so the
 * order details and the live Deriv quote can be checked before any money is
 * committed. Cancelling places no order at all.
 */

import { useEffect, useState } from 'react';
import { useAiBotContext } from '../ai-bot-context';

/** A quote older than this is replaced by a fresh one at purchase time. */
const MAX_QUOTE_AGE_S = 5;

const DURATION_UNITS: Record<string, string> = { t: 'tick', s: 'second', m: 'minute', h: 'hour', d: 'day' };

function maskLoginid(loginid: string | null): string {
    if (!loginid) return '—';
    if (loginid.length <= 4) return loginid;
    return `${loginid.slice(0, 2)}…${loginid.slice(-3)}`;
}

function formatDuration(duration: number, unit: string): string {
    const name = DURATION_UNITS[unit] ?? unit;
    return `${duration} ${name}${duration === 1 ? '' : 's'}`;
}

export default function TradeConfirmation() {
    const { state, confirmTrade, cancelTrade } = useAiBotContext();
    const pending = state.pendingTrade;
    const [now, setNow] = useState(() => Date.now());

    // Tick while the dialog is open so the quote's age stays visible.
    useEffect(() => {
        if (!pending) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [pending]);

    if (!pending) return null;

    const { order, quote } = pending;
    const quoteAgeS = quote && quote.spotTime > 0 ? Math.max(0, Math.round(now / 1000 - quote.spotTime)) : null;
    const quoteFresh = quoteAgeS !== null && quoteAgeS <= MAX_QUOTE_AGE_S;

    return (
        <div className='aibot-modal-overlay' role='dialog' aria-modal='true' aria-labelledby='aibot-confirm-title'>
            <div className='aibot-modal aibot-modal--order'>
                <h3 className='aibot-modal__title' id='aibot-confirm-title'>
                    Confirm Real-Money Trade
                </h3>
                <p className='aibot-modal__lead'>
                    Nothing is bought until you confirm. Check the order details below.
                </p>

                <div className='aibot-order'>
                    <Field label='Market' value={order.displayName ?? order.symbol} hint={order.symbol} />
                    <Field label='Contract' value={order.contractType} hint={order.strategyLabel} />
                    <Field label='Prediction' value={order.prediction} />
                    <Field label='Stake' value={`${order.stake} ${order.currency}`} />
                    <Field label='Duration' value={formatDuration(order.duration, order.durationUnit)} />
                    <Field label='Max stake' value={`${order.maxStake} ${order.currency}`} />
                    <Field
                        label='Account'
                        value={`${order.accountMode === 'real' ? 'REAL' : 'DEMO'} · ${maskLoginid(order.loginid)}`}
                        tone={order.accountMode === 'real' ? 'danger' : undefined}
                    />
                    {order.balance !== null && (
                        <Field label='Balance' value={`${order.balance.toFixed(2)} ${order.currency}`} />
                    )}
                </div>

                <div className='aibot-order aibot-order--quote'>
                    {quote ? (
                        <>
                            <Field label='Price' value={`${quote.askPrice.toFixed(2)} ${order.currency}`} />
                            <Field
                                label='Payout if won'
                                value={`${quote.payout.toFixed(2)} ${order.currency}`}
                                tone='positive'
                            />
                            <div className='aibot-order__row aibot-order__row--wide'>
                                <span className='aibot-order__label'>Deriv contract</span>
                                <span className='aibot-order__value'>{quote.longcode || order.contractType}</span>
                            </div>
                            <p className={`aibot-quote-note aibot-quote-note--${quoteFresh ? 'live' : 'stale'}`}>
                                {quoteFresh
                                    ? `Live quote · updated ${quoteAgeS}s ago`
                                    : `Quote is ${quoteAgeS}s old — a fresh quote is fetched when you confirm.`}
                            </p>
                        </>
                    ) : (
                        <p className='aibot-quote-note aibot-quote-note--stale'>
                            {pending.quoteError ?? 'Fetching a live quote…'}
                        </p>
                    )}
                </div>

                <p className='aibot-modal__warn'>
                    This order uses real funds. You can lose the stake. The bot will not place it unless you confirm.
                </p>

                <div className='aibot-modal__actions'>
                    <button type='button' className='aibot-btn' onClick={cancelTrade}>
                        Cancel
                    </button>
                    <button type='button' className='aibot-btn aibot-btn--danger' onClick={confirmTrade}>
                        Confirm &amp; Buy
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    hint,
    tone,
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: 'danger' | 'positive';
}) {
    return (
        <div className='aibot-order__row'>
            <span className='aibot-order__label'>{label}</span>
            <span className={`aibot-order__value${tone ? ` aibot-order__value--${tone}` : ''}`}>
                {value}
                {hint ? <span className='aibot-order__hint'> · {hint}</span> : null}
            </span>
        </div>
    );
}
