/**
 * Settings panel — all user trading settings with validation.
 * Explains the difference between stake, payout, profit target, and loss limit.
 */

import { useAiBotContext } from '../ai-bot-context';
import { ANALYSIS_WINDOW_OPTIONS } from '../constants';
import type { TradingSettings } from '../types';

export default function SettingsPanel() {
    const bot = useAiBotContext();
    const { settings, updateSettings, scannerConfig, updateScannerConfig } = bot;

    const set = <K extends keyof TradingSettings>(key: K, value: TradingSettings[K]) => {
        updateSettings({ ...settings, [key]: value });
    };

    const setScanner = <K extends keyof typeof scannerConfig>(key: K, value: (typeof scannerConfig)[K]) => {
        updateScannerConfig({ ...scannerConfig, [key]: value });
    };

    return (
        <section className='aibot-panel'>
            <h3 className='aibot-panel__title'>Trading Settings</h3>

            <div className='aibot-settings-group'>
                <h4 className='aibot-settings-group__title'>Stake & Limits</h4>
                <NumberField label='Stake per trade' value={settings.stake} onChange={v => set('stake', v)} min={0.35} step={0.5} />
                <NumberField label='Max stake' value={settings.maxStake} onChange={v => set('maxStake', v)} min={1} step={1} />
                <NumberField label='Session profit target' value={settings.sessionProfitTarget} onChange={v => set('sessionProfitTarget', v)} min={0} step={1} />
                <NumberField label='Session loss limit' value={settings.sessionLossLimit} onChange={v => set('sessionLossLimit', v)} min={0} step={1} />
                <NumberField label='Daily loss limit' value={settings.dailyLossLimit} onChange={v => set('dailyLossLimit', v)} min={0} step={1} />
                <p className='aibot-settings-note'>
                    <strong>Stake</strong> = amount risked per trade. <strong>Payout</strong> = potential return if the
                    contract wins (set by Deriv, not guaranteed). <strong>Profit target</strong> = net realized P/L at
                    which the session stops. <strong>Loss limit</strong> = net realized loss at which the session stops.
                </p>
            </div>

            <div className='aibot-settings-group'>
                <h4 className='aibot-settings-group__title'>Trade Limits</h4>
                <NumberField label='Max trades per session' value={settings.maxTrades} onChange={v => set('maxTrades', v)} min={1} step={1} />
                <NumberField label='Max consecutive losses' value={settings.maxConsecutiveLosses} onChange={v => set('maxConsecutiveLosses', v)} min={0} step={1} />
                <NumberField label='Max consecutive wins (0 = off)' value={settings.maxConsecutiveWins ?? 0} onChange={v => set('maxConsecutiveWins', v === 0 ? null : v)} min={0} step={1} />
                <NumberField label='Max concurrent contracts' value={settings.maxConcurrentContracts} onChange={v => set('maxConcurrentContracts', v)} min={1} step={1} />
            </div>

            <div className='aibot-settings-group'>
                <h4 className='aibot-settings-group__title'>Timing</h4>
                <NumberField label='Cooldown (ms)' value={settings.cooldownMs} onChange={v => set('cooldownMs', v)} min={0} step={1000} />
                <NumberField label='Min time between signals (ms)' value={settings.minTimeBetweenSignalsMs} onChange={v => set('minTimeBetweenSignalsMs', v)} min={0} step={500} />
                <NumberField label='Max entry delay (ms)' value={settings.maxEntryDelayMs} onChange={v => set('maxEntryDelayMs', v)} min={1000} step={1000} />
                <NumberField label='Max quote age (ms)' value={settings.maxQuoteAgeMs} onChange={v => set('maxQuoteAgeMs', v)} min={1000} step={1000} />
                <NumberField label='Session duration (ms, 0 = off)' value={settings.sessionDurationMs ?? 0} onChange={v => set('sessionDurationMs', v === 0 ? null : v)} min={0} step={60000} />
            </div>

            <div className='aibot-settings-group'>
                <h4 className='aibot-settings-group__title'>Contract</h4>
                <NumberField label='Duration' value={settings.duration} onChange={v => set('duration', v)} min={1} step={1} />
                <label className='aibot-field'>
                    <span className='aibot-field__label'>Duration unit</span>
                    <select
                        className='aibot-field__select'
                        value={settings.durationUnit}
                        onChange={e => set('durationUnit', e.target.value as TradingSettings['durationUnit'])}
                    >
                        <option value='t'>Ticks</option>
                        <option value='s'>seconds</option>
                        <option value='m'>minutes</option>
                    </select>
                </label>
            </div>

            <div className='aibot-settings-group'>
                <h4 className='aibot-settings-group__title'>Scanner & Analysis</h4>
                <label className='aibot-field'>
                    <span className='aibot-field__label'>Analysis window</span>
                    <select
                        className='aibot-field__select'
                        value={scannerConfig.analysisWindow}
                        onChange={e => setScanner('analysisWindow', Number(e.target.value))}
                    >
                        {ANALYSIS_WINDOW_OPTIONS.map(w => (
                            <option key={w} value={w}>{w} ticks</option>
                        ))}
                    </select>
                </label>
                <NumberField label='Min sample size' value={scannerConfig.minSampleSize} onChange={v => setScanner('minSampleSize', v)} min={10} step={10} />
                <NumberField label='Min deviation edge (%)' value={scannerConfig.minDeviationEdge} onChange={v => setScanner('minDeviationEdge', v)} min={0} step={0.5} />
                <NumberField label='Scan interval (ms)' value={scannerConfig.scanIntervalMs} onChange={v => setScanner('scanIntervalMs', v)} min={1000} step={1000} />
            </div>

            <div className='aibot-settings-group'>
                <h4 className='aibot-settings-group__title'>Restart & Stop</h4>
                <label className='aibot-field aibot-field--check'>
                    <input
                        type='checkbox'
                        checked={settings.autoRestartAfterContract}
                        onChange={e => set('autoRestartAfterContract', e.target.checked)}
                    />
                    <span>Auto-restart scanning after contract closes</span>
                </label>
                <label className='aibot-field aibot-field--check'>
                    <input
                        type='checkbox'
                        checked={settings.stopOnProfitTarget}
                        onChange={e => set('stopOnProfitTarget', e.target.checked)}
                    />
                    <span>Stop after session profit target</span>
                </label>
                <label className='aibot-field aibot-field--check'>
                    <input
                        type='checkbox'
                        checked={settings.stopOnLossLimit}
                        onChange={e => set('stopOnLossLimit', e.target.checked)}
                    />
                    <span>Stop after session loss limit</span>
                </label>
            </div>
        </section>
    );
}

function NumberField({
    label,
    value,
    onChange,
    min,
    step,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    step?: number;
}) {
    return (
        <label className='aibot-field'>
            <span className='aibot-field__label'>{label}</span>
            <input
                type='number'
                className='aibot-field__input'
                value={value}
                min={min}
                step={step}
                onChange={e => onChange(Number(e.target.value))}
            />
        </label>
    );
}
