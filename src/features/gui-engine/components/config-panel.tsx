import type { MarketSymbol } from '../../digits/types';
import type { ConfigErrors } from '../config';
import type { EngineConfig, StakePreview, StrategySelection } from '../types';

interface ConfigPanelProps {
    config: EngineConfig;
    errors: ConfigErrors;
    disabled: boolean;
    onChange: (patch: Partial<EngineConfig>) => void;
    markets: MarketSymbol[];
    selectedMarket: MarketSymbol | null;
    onSelectMarket: (market: MarketSymbol) => void;
    isLoadingMarkets: boolean;
    stakeSummary: StakePreview;
}

interface NumberFieldProps {
    id: string;
    label: string;
    value: number;
    step?: number;
    min?: number;
    hint?: string;
    error?: string;
    disabled: boolean;
    onChange: (value: number) => void;
}

function NumberField({ id, label, value, step = 1, min, hint, error, disabled, onChange }: NumberFieldProps) {
    return (
        <label className='ge-field' htmlFor={id}>
            <span className='ge-field__label'>{label}</span>
            <input
                id={id}
                className={`ge-input${error ? ' ge-input--error' : ''}`}
                type='number'
                inputMode='decimal'
                step={step}
                min={min}
                value={Number.isFinite(value) ? value : ''}
                disabled={disabled}
                onChange={event => onChange(Number(event.target.value))}
            />
            {error ? (
                <span className='ge-field__error'>{error}</span>
            ) : hint ? (
                <span className='ge-field__hint'>{hint}</span>
            ) : null}
        </label>
    );
}

function groupMarkets(markets: MarketSymbol[]) {
    const groups = new Map<string, MarketSymbol[]>();
    markets.forEach(market => {
        const list = groups.get(market.category) ?? [];
        list.push(market);
        groups.set(market.category, list);
    });
    return Array.from(groups.entries());
}

/**
 * Market, strategy and risk configuration. Every field is disabled while the
 * engine is running so a live session can never silently change its rules.
 */
export default function ConfigPanel({
    config,
    errors,
    disabled,
    onChange,
    markets,
    selectedMarket,
    onSelectMarket,
    isLoadingMarkets,
    stakeSummary,
}: ConfigPanelProps) {
    const grouped = groupMarkets(markets);

    return (
        <section className='ge-panel' aria-label='Engine configuration'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Configuration</h3>
                {disabled && <span className='ge-panel__lock'>Locked while the engine is active</span>}
            </header>

            <div className='ge-form'>
                <label className='ge-field' htmlFor='ge-market'>
                    <span className='ge-field__label'>Market</span>
                    <select
                        id='ge-market'
                        className='ge-input'
                        value={selectedMarket?.apiSymbol ?? ''}
                        disabled={disabled}
                        onChange={event => {
                            const market = markets.find(item => item.apiSymbol === event.target.value);
                            if (market) onSelectMarket(market);
                        }}
                    >
                        {!selectedMarket && (
                            <option value=''>{isLoadingMarkets ? 'Loading markets from Deriv…' : 'Choose a market'}</option>
                        )}
                        {grouped.map(([category, list]) => (
                            <optgroup key={category} label={category}>
                                {list.map(market => (
                                    <option key={market.apiSymbol} value={market.apiSymbol}>
                                        {market.displayName}
                                        {market.isOpen && !market.isSuspended ? '' : ' (unavailable)'}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <span className='ge-field__hint'>
                        Only the volatility families the digit contracts run on. Availability comes from your Deriv
                        feed — a market may be closed on some accounts.
                    </span>
                </label>

                <label className='ge-field' htmlFor='ge-strategy'>
                    <span className='ge-field__label'>Primary strategy</span>
                    <select
                        id='ge-strategy'
                        className='ge-input'
                        value={config.strategy}
                        disabled={disabled}
                        onChange={event => onChange({ strategy: event.target.value as StrategySelection })}
                    >
                        <option value='over1'>Over 1 (DIGITOVER barrier 1)</option>
                        <option value='under8'>Under 8 (DIGITUNDER barrier 8)</option>
                        <option value='both'>Both strategies</option>
                    </select>
                    <span className='ge-field__hint'>
                        Both strategies keep independent pending setups; open-contract limits prevent conflicting
                        purchases.
                    </span>
                </label>

                <NumberField
                    id='ge-initial-stake'
                    label='Initial stake'
                    value={config.initialStake}
                    step={0.01}
                    min={0.01}
                    error={errors.initialStake}
                    disabled={disabled}
                    onChange={value => onChange({ initialStake: value })}
                />
                <NumberField
                    id='ge-take-profit'
                    label='Take profit'
                    value={config.takeProfit}
                    step={0.5}
                    min={0.01}
                    error={errors.takeProfit}
                    disabled={disabled}
                    onChange={value => onChange({ takeProfit: value })}
                />
                <NumberField
                    id='ge-stop-loss'
                    label='Stop loss'
                    value={config.stopLoss}
                    step={0.5}
                    min={0.01}
                    hint='Entered as a positive amount; trading stops at minus this value.'
                    error={errors.stopLoss}
                    disabled={disabled}
                    onChange={value => onChange({ stopLoss: value })}
                />
                <NumberField
                    id='ge-multiplier'
                    label='Multiplier'
                    value={config.multiplier}
                    step={0.1}
                    min={1}
                    hint='1 = flat staking. A multiplier never guarantees recovery.'
                    error={errors.multiplier}
                    disabled={disabled}
                    onChange={value => onChange({ multiplier: value })}
                />
                <label className='ge-field' htmlFor='ge-multiplier-scope'>
                    <span className='ge-field__label'>Multiplier applies to</span>
                    <select
                        id='ge-multiplier-scope'
                        className='ge-input'
                        value={config.multiplierScope}
                        disabled={disabled}
                        onChange={event =>
                            onChange({ multiplierScope: event.target.value as EngineConfig['multiplierScope'] })
                        }
                    >
                        <option value='both'>Both primary and recovery trades</option>
                        <option value='primary'>Primary trades only</option>
                        <option value='recovery'>Recovery trades only</option>
                    </select>
                </label>
                <NumberField
                    id='ge-max-losses'
                    label='Maximum consecutive losses'
                    value={config.maxConsecutiveLosses}
                    min={1}
                    error={errors.maxConsecutiveLosses}
                    disabled={disabled}
                    onChange={value => onChange({ maxConsecutiveLosses: value })}
                />
                <NumberField
                    id='ge-max-recovery'
                    label='Maximum recovery trades'
                    value={config.maxRecoveryTrades}
                    min={0}
                    hint='0 disables the Even/Odd recovery engine.'
                    error={errors.maxRecoveryTrades}
                    disabled={disabled}
                    onChange={value => onChange({ maxRecoveryTrades: value })}
                />
                <NumberField
                    id='ge-max-open'
                    label='Maximum open contracts'
                    value={config.maxOpenContracts}
                    min={1}
                    error={errors.maxOpenContracts}
                    disabled={disabled}
                    onChange={value => onChange({ maxOpenContracts: value })}
                />
                <NumberField
                    id='ge-max-stake'
                    label='Maximum stake'
                    value={config.maxStake}
                    step={0.5}
                    min={0.01}
                    error={errors.maxStake}
                    disabled={disabled}
                    onChange={value => onChange({ maxStake: value })}
                />
                <NumberField
                    id='ge-confirm-window'
                    label='Maximum ticks to wait for confirmation'
                    value={config.maxTicksToConfirm}
                    min={1}
                    hint='Intervening digits never cancel a setup; after this many ticks it expires.'
                    error={errors.maxTicksToConfirm}
                    disabled={disabled}
                    onChange={value => onChange({ maxTicksToConfirm: value })}
                />
            </div>

            <div className='ge-subsection'>
                <h4 className='ge-subsection__title'>Even/Odd recovery filter</h4>
                <label className='ge-switch' htmlFor='ge-recovery-filter'>
                    <input
                        id='ge-recovery-filter'
                        type='checkbox'
                        checked={config.recoveryFilterEnabled}
                        disabled={disabled}
                        onChange={event => onChange({ recoveryFilterEnabled: event.target.checked })}
                    />
                    <span className='ge-switch__track' aria-hidden='true' />
                    <span className='ge-switch__label'>
                        {config.recoveryFilterEnabled
                            ? 'Parity frequency filter enabled'
                            : 'Parity frequency filter disabled — percentages still shown'}
                    </span>
                </label>
                <div className='ge-form ge-form--compact'>
                    <NumberField
                        id='ge-max-even'
                        label='Maximum even share'
                        value={config.maxEvenPercent}
                        step={0.1}
                        min={0.1}
                        hint='An ODD contract needs the even share at or below this.'
                        error={errors.maxEvenPercent}
                        disabled={disabled}
                        onChange={value => onChange({ maxEvenPercent: value })}
                    />
                    <NumberField
                        id='ge-max-odd'
                        label='Maximum odd share'
                        value={config.maxOddPercent}
                        step={0.1}
                        min={0.1}
                        hint='An EVEN contract needs the odd share at or below this.'
                        error={errors.maxOddPercent}
                        disabled={disabled}
                        onChange={value => onChange({ maxOddPercent: value })}
                    />
                </div>
                <p className='ge-note'>
                    These are your eligibility ceilings, not a profitability claim. Disabled means every parity
                    pattern is eligible.
                </p>
            </div>

            <div className='ge-stake-strip' aria-label='Staking summary'>
                <div className='ge-stake-strip__item'>
                    <span className='ge-stake-strip__label'>Initial stake</span>
                    <span className='ge-stake-strip__value'>{stakeSummary.initialStake.toFixed(2)}</span>
                </div>
                <div className='ge-stake-strip__item'>
                    <span className='ge-stake-strip__label'>Current stake</span>
                    <span className='ge-stake-strip__value'>{stakeSummary.currentStake.toFixed(2)}</span>
                </div>
                <div className='ge-stake-strip__item'>
                    <span className='ge-stake-strip__label'>Next calculated stake</span>
                    <span className='ge-stake-strip__value'>{stakeSummary.nextStake.toFixed(2)}</span>
                </div>
                <div className='ge-stake-strip__item'>
                    <span className='ge-stake-strip__label'>Current multiplier</span>
                    <span className='ge-stake-strip__value'>×{stakeSummary.multiplier}</span>
                </div>
                <div className='ge-stake-strip__item'>
                    <span className='ge-stake-strip__label'>Remaining risk allowance</span>
                    <span className='ge-stake-strip__value'>{stakeSummary.remainingRiskAllowance.toFixed(2)}</span>
                </div>
            </div>
        </section>
    );
}
