/** Trading settings panel with validation. */

import { observer } from 'mobx-react-lite';
import type { ScannerStore } from '../scanner-store';

const SettingsPanel = observer(({ store }: { store: ScannerStore }) => {
    const c = store.config;

    const num = (value: number) => (Number.isFinite(value) ? String(value) : '');
    const setNum = (key: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value === '' ? 0 : Number(e.target.value);
        store.setConfig({ [key]: v } as any);
    };

    return (
        <article className='scanner-card'>
            <h3 className='scanner-card__title'>Trading settings</h3>

            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Account mode</label>
                <select
                    className='scanner-settings__select'
                    value={c.accountMode}
                    onChange={e => store.setAccountMode(e.target.value as 'demo' | 'real')}
                >
                    <option value='demo'>Demo</option>
                    <option value='real'>Real</option>
                </select>
                {c.accountMode === 'real' && (
                    <>
                        <p className='scanner-settings__hint' style={{ color: '#c0392b' }}>
                            Real mode places live orders with real money. Explicit confirmation is required.
                        </p>
                        <button
                            type='button'
                            className={`scanner-btn ${store.realArmed ? 'scanner-btn--stop' : 'scanner-btn--danger'}`}
                            onClick={() => store.armReal()}
                            disabled={store.realArmed}
                        >
                            {store.realArmed ? 'Real execution armed' : 'Arm real execution'}
                        </button>
                    </>
                )}
            </div>

            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Stake per trade</label>
                <input className='scanner-settings__input' type='number' min='0' step='0.01' value={num(c.stake)} onChange={setNum('stake')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Maximum stake</label>
                <input className='scanner-settings__input' type='number' min='0' step='0.01' value={num(c.maxStake)} onChange={setNum('maxStake')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Session profit target</label>
                <input className='scanner-settings__input' type='number' step='0.01' value={num(c.sessionProfitTarget)} onChange={setNum('sessionProfitTarget')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Session loss limit</label>
                <input className='scanner-settings__input' type='number' step='0.01' value={num(c.sessionLossLimit)} onChange={setNum('sessionLossLimit')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Daily loss limit</label>
                <input className='scanner-settings__input' type='number' step='0.01' value={num(c.dailyLossLimit)} onChange={setNum('dailyLossLimit')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Max trades per session</label>
                <input className='scanner-settings__input' type='number' min='1' value={num(c.maxTrades)} onChange={setNum('maxTrades')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Max consecutive losses</label>
                <input className='scanner-settings__input' type='number' min='1' value={num(c.maxConsecutiveLosses)} onChange={setNum('maxConsecutiveLosses')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Max concurrent contracts</label>
                <input className='scanner-settings__input' type='number' min='1' value={num(c.maxConcurrentContracts)} onChange={setNum('maxConcurrentContracts')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Cooldown between trades (ms)</label>
                <input className='scanner-settings__input' type='number' min='0' step='100' value={num(c.cooldownMs)} onChange={setNum('cooldownMs')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Contract duration (ticks)</label>
                <input className='scanner-settings__input' type='number' min='1' value={num(c.durationTicks)} onChange={setNum('durationTicks')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Analysis window (ticks)</label>
                <input className='scanner-settings__input' type='number' min='20' value={num(c.analysisWindow)} onChange={setNum('analysisWindow')} />
            </div>
            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Minimum evidence (pattern confirmations)</label>
                <input className='scanner-settings__input' type='number' min='1' value={num(c.minEvidence)} onChange={setNum('minEvidence')} />
            </div>

            <div className='scanner-settings__row'>
                <label className='scanner-settings__label'>Restart after contract closes</label>
                <input type='checkbox' checked={c.autoRestartAfterContract} onChange={e => store.setConfig({ autoRestartAfterContract: e.target.checked })} />
            </div>

            <p className='scanner-settings__hint'>
                Stake is the amount risked per contract; payout is what Deriv offers back; the profit target is a
                net-P/L goal that stops new entries when reached — not a guaranteed return. The loss limit is not a
                guaranteed maximum loss while contracts remain open.
            </p>

            {store.configProblems.length > 0 && (
                <ul className='scanner-settings__problems'>
                    {store.configProblems.map((p, i) => (
                        <li key={i}>{p}</li>
                    ))}
                </ul>
            )}
        </article>
    );
});

export default SettingsPanel;
