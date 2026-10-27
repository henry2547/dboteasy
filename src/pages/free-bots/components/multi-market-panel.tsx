/**
 * Multi-Market Digit Entry Hunter — strategy selector and loader.
 *
 * The panel configures one bot and hands it to the Free Bots loader, which is
 * the same path the classic templates use: the XML is inspected, re-targeted at
 * the selected market, loaded into the Bot Builder and read back from the live
 * workspace. Loading never starts the bot and never places a trade.
 */

import { useMemo, useState } from 'react';
import type { MarketSymbol } from '@/pages/digits/types';
import type { MarketSupport } from '../market-support';
import {
    MULTI_MARKET_DEFAULTS,
    MULTI_MARKET_PRESETS,
    MULTI_MARKET_STRATEGIES,
    entryConditionText,
    multiMarketBotName,
    multiMarketTemplate,
    validateMultiMarketConfig,
    type MultiMarketConfig,
    type MultiMarketStrategy,
} from '../multi-market';
import type { FreeBotTemplate } from '../templates';
import './multi-market-panel.scss';

interface MultiMarketPanelProps {
    market: MarketSymbol | null;
    support: MarketSupport;
    loading: boolean;
    isRunning: boolean;
    errorMessage: string | null;
    onLoad: (template: FreeBotTemplate) => void;
}

const STRATEGY_ORDER: MultiMarketStrategy[] = ['over', 'under', 'matches', 'differs', 'even', 'odd'];

/**
 * The tabs unmount their page when another tab is opened, so the configuration
 * lives at module level: coming back from the Bot Builder keeps the bot the user
 * was setting up instead of silently falling back to the defaults.
 */
let lastConfig: MultiMarketConfig = MULTI_MARKET_DEFAULTS;
let lastPreset: string | null = 'over_1';

export default function MultiMarketPanel({
    market,
    support,
    loading,
    isRunning,
    errorMessage,
    onLoad,
}: MultiMarketPanelProps) {
    const [config, setConfig] = useState<MultiMarketConfig>(lastConfig);
    const [activePreset, setActivePreset] = useState<string | null>(lastPreset);

    const spec = MULTI_MARKET_STRATEGIES[config.strategy];
    const errors = validateMultiMarketConfig(config);
    const template = useMemo(() => (errors.length ? null : multiMarketTemplate(config)), [config, errors.length]);

    const apply = (next: MultiMarketConfig, preset: string | null) => {
        lastConfig = next;
        lastPreset = preset;
        setActivePreset(preset);
        setConfig(next);
    };

    const update = (changes: Partial<MultiMarketConfig>) => {
        apply({ ...config, ...changes }, null);
    };

    // The entry rule belongs to the preset: a different strategy or barrier needs a rule of its own,
    // so the preset's digits are cleared instead of silently staying on another contract.
    const updateStrategy = (changes: Partial<MultiMarketConfig>) =>
        update({
            ...changes,
            entryDigits: [],
            entryRun: null,
            minFrequencyDigits: [],
            maxFrequencyDigits: [],
            barNeutralDigits: [],
        });

    const selectPreset = (presetId: string) => {
        const preset = MULTI_MARKET_PRESETS.find(item => item.id === presetId);
        if (preset) apply(preset.config, presetId);
    };

    const blocked = loading || isRunning || !market || !support.supported || !template;
    const blockReason = loading
        ? 'Loading the bot…'
        : isRunning
          ? 'A bot is already running — stop it before loading another.'
          : !market
            ? 'Select a volatility market above to load this bot.'
            : !support.supported
              ? support.reason
              : errors[0];

    return (
        <section className='multi-market' aria-label='Multi-Market Digit Entry Hunter'>
            <header className='multi-market__header'>
                <h3 className='free-bots__section-title'>3. Multi-Market Digit Entry Hunter</h3>
                <p className='multi-market__intro'>
                    One bot that walks the eligible volatility markets with the Digits{' '}
                    <strong>Switch active market</strong> block, waits for each market&apos;s own ticks and trades the
                    first one whose digit condition is met. The market below is only the starting market — the bot
                    discovers the rest itself.
                </p>
            </header>

            <div className='multi-market__presets' role='group' aria-label='Bot presets'>
                {MULTI_MARKET_PRESETS.map(item => (
                    <button
                        key={item.id}
                        type='button'
                        className={`multi-market__preset${
                            activePreset === item.id ? ' multi-market__preset--active' : ''
                        }`}
                        onClick={() => selectPreset(item.id)}
                        aria-pressed={activePreset === item.id}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className='multi-market__grid'>
                <label className='multi-market__field'>
                    <span>Strategy</span>
                    <select
                        value={config.strategy}
                        onChange={event => {
                            const strategy = event.target.value as MultiMarketStrategy;
                            updateStrategy({ strategy, barrier: MULTI_MARKET_STRATEGIES[strategy].defaultDigit });
                        }}
                    >
                        {STRATEGY_ORDER.map(strategy => (
                            <option key={strategy} value={strategy}>
                                {MULTI_MARKET_STRATEGIES[strategy].label}
                            </option>
                        ))}
                    </select>
                </label>

                {spec.digitLabel && (
                    <label className='multi-market__field'>
                        <span>{spec.digitLabel}</span>
                        <input
                            type='number'
                            min={spec.minDigit}
                            max={spec.maxDigit}
                            step={1}
                            value={config.barrier ?? ''}
                            onChange={event => updateStrategy({ barrier: Number(event.target.value) })}
                        />
                    </label>
                )}

                <label className='multi-market__field'>
                    <span>Maximum scan cycles (0 = all markets once)</span>
                    <input
                        type='number'
                        min={0}
                        step={1}
                        value={config.maxScanCycles}
                        onChange={event => update({ maxScanCycles: Number(event.target.value) })}
                    />
                </label>

                <label className='multi-market__field'>
                    <span>Initial stake (USD)</span>
                    <input
                        type='number'
                        min={0.35}
                        step={0.01}
                        value={config.stake}
                        onChange={event => update({ stake: Number(event.target.value) })}
                    />
                </label>

                <label className='multi-market__field'>
                    <span>Take profit (USD)</span>
                    <input
                        type='number'
                        min={0.01}
                        step={0.01}
                        value={config.takeProfit}
                        onChange={event => update({ takeProfit: Number(event.target.value) })}
                    />
                </label>

                <label className='multi-market__field'>
                    <span>Stop loss (USD)</span>
                    <input
                        type='number'
                        min={0.01}
                        step={0.01}
                        value={config.stopLoss}
                        onChange={event => update({ stopLoss: Number(event.target.value) })}
                    />
                </label>

                <label className='multi-market__field'>
                    <span>Stake multiplier after a loss (1 = flat)</span>
                    <input
                        type='number'
                        min={1}
                        max={3}
                        step={0.1}
                        value={config.multiplier}
                        onChange={event => update({ multiplier: Number(event.target.value) })}
                    />
                </label>

                <label className='multi-market__field'>
                    <span>Stop after this many losses in a row</span>
                    <input
                        type='number'
                        min={1}
                        step={1}
                        value={config.maxConsecutiveLosses}
                        onChange={event => update({ maxConsecutiveLosses: Number(event.target.value) })}
                    />
                </label>
            </div>

            <div className='multi-market__summary'>
                <p className='multi-market__name'>{multiMarketBotName(config)}</p>
                <p className='multi-market__rule'>
                    Buys when <strong>{entryConditionText(config)}</strong> on the first eligible market whose own
                    ticks pass it; a market that fails is skipped and the scan switches to the next one.
                </p>
            </div>

            {errors.length > 0 && (
                <ul className='multi-market__errors'>
                    {errors.map(error => (
                        <li key={error}>{error}</li>
                    ))}
                </ul>
            )}

            {errorMessage && <p className='multi-market__error'>{errorMessage}</p>}

            <div className='multi-market__actions'>
                <button
                    type='button'
                    className='multi-market__load'
                    disabled={blocked}
                    onClick={() => template && onLoad(template)}
                >
                    {loading ? 'Loading…' : 'Load into Bot Builder'}
                </button>
                {blocked && blockReason && <span className='multi-market__hint'>{blockReason}</span>}
                {!blocked && (
                    <span className='multi-market__hint'>
                        Loading never starts the bot — press Start bot in the Bot Builder.
                    </span>
                )}
            </div>
        </section>
    );
}

