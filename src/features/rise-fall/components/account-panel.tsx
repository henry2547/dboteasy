import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import type { LiveConnectionState } from '../use-rise-fall-engine';
import type { ExecutionMode, ModeSnapshot, VirtualContract } from '../types';

interface AccountPanelProps {
    mode: ExecutionMode;
    active: ModeSnapshot;
    live: LiveConnectionState;
    decimalPlaces: number | null;
    onArmReal: (armed: boolean) => void;
    onReconnect: () => void;
    onConfirm: () => void;
    onCancel: () => void;
}

const price = (value: number | null, places: number | null) => (value === null ? '—' : value.toFixed(places ?? 2));

const PendingConfirmation = ({
    contract,
    decimalPlaces,
    onConfirm,
    onCancel,
}: {
    contract: VirtualContract;
    decimalPlaces: number | null;
    onConfirm: () => void;
    onCancel: () => void;
}) => (
    <div className='rise-fall__confirm' data-testid='rise-fall-confirm'>
        <h4>{localize('Confirm this real-money entry')}</h4>
        <dl className='rise-fall__facts'>
            <div>
                <dt>{localize('Market')}</dt>
                <dd>{contract.symbol}</dd>
            </div>
            <div>
                <dt>{localize('Contract')}</dt>
                <dd>
                    {contract.direction === 'rise' ? 'RISE' : 'FALL'} · {contract.contractType} ·{' '}
                    {contract.durationTicks} {localize('ticks')}
                </dd>
            </div>
            <div>
                <dt>{localize('Stake')}</dt>
                <dd>
                    {contract.stake.toFixed(2)} {contract.currency}
                </dd>
            </div>
            <div>
                <dt>{localize('Entry')}</dt>
                <dd>{price(contract.entryQuote, decimalPlaces)}</dd>
            </div>
        </dl>
        <p className='rise-fall__note rise-fall__note--danger'>
            {localize(
                'This buys a real contract with your own money as soon as you confirm. Deriv’s quoted payout is applied — nothing here is simulated.'
            )}
        </p>
        <div className='rise-fall__controls'>
            <button type='button' className='rise-fall__button is-danger' data-testid='rise-fall-confirm-buy' onClick={onConfirm}>
                {localize('Buy this contract')}
            </button>
            <button type='button' className='rise-fall__button' data-testid='rise-fall-confirm-cancel' onClick={onCancel}>
                {localize('Cancel — buy nothing')}
            </button>
        </div>
    </div>
);

/** The active mode's own account, its verification state and the live connection's own words. */
const AccountPanel = ({
    mode,
    active,
    live,
    decimalPlaces,
    onArmReal,
    onReconnect,
    onConfirm,
    onCancel,
}: AccountPanelProps) => {
    const { account } = active;
    const status = live.status;

    return (
        <section className='rise-fall__section' data-testid='rise-fall-account-panel'>
            <div className='rise-fall__section-head'>
                <h3>{localize('Account')}</h3>
                <span
                    className={classNames('rise-fall__status', { 'is-danger': !account.verified })}
                    data-testid='rise-fall-verified'
                >
                    {account.verified ? localize('VERIFIED') : localize('NOT VERIFIED')}
                </span>
            </div>
            <dl className='rise-fall__facts'>
                <div>
                    <dt>{localize('Login')}</dt>
                    <dd data-testid='rise-fall-account'>{account.maskedLoginId ?? '—'}</dd>
                </div>
                <div>
                    <dt>{localize('Type')}</dt>
                    <dd>{account.accountType ? account.accountType.toUpperCase() : '—'}</dd>
                </div>
                <div>
                    <dt>{localize('Currency')}</dt>
                    <dd>{account.currency ?? '—'}</dd>
                </div>
                <div>
                    <dt>{localize('Balance')}</dt>
                    <dd data-testid='rise-fall-balance'>
                        {account.balance === null ? '—' : account.balance.toFixed(2)}
                    </dd>
                </div>
            </dl>

            {account.reason && (
                <p className='rise-fall__note' data-testid='rise-fall-account-reason'>
                    {account.reason}
                </p>
            )}

            {live.active && (
                <div className='rise-fall__live' data-testid='rise-fall-live'>
                    <p className='rise-fall__note'>
                        {localize('Authenticated connection')}:{' '}
                        <b>{status?.authPhase ?? 'connecting'}</b>
                        {status?.loginid ? ` · ${status.loginid.slice(0, 2)}•••${status.loginid.slice(-2)}` : ''}
                        {status?.error ? ` · ${status.error}` : ''}
                        {live.error ? ` · ${live.error}` : ''}
                    </p>
                    <button type='button' className='rise-fall__button' data-testid='rise-fall-reconnect' onClick={onReconnect}>
                        {localize('Reconnect and verify')}
                    </button>
                </div>
            )}

            {mode === 'real' && (
                <div className='rise-fall__live' data-testid='rise-fall-real-arm'>
                    <p className='rise-fall__note rise-fall__note--danger'>
                        {localize(
                            'Real-money trading is off until you arm it. Arming lasts for this session only and is cleared when the account changes.'
                        )}
                    </p>
                    <button
                        type='button'
                        className={classNames('rise-fall__button', { 'is-danger': !active.realArmed })}
                        data-testid='rise-fall-arm-real'
                        aria-pressed={active.realArmed}
                        onClick={() => onArmReal(!active.realArmed)}
                        disabled={!account.verified || account.accountType !== 'real'}
                    >
                        {active.realArmed ? localize('Disarm real-money entries') : localize('Arm real-money entries')}
                    </button>
                </div>
            )}

            {active.pendingContract && (
                <PendingConfirmation
                    contract={active.pendingContract}
                    decimalPlaces={decimalPlaces}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />
            )}
        </section>
    );
};

export default AccountPanel;
