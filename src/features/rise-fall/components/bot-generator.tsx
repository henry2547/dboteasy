import React, { useState } from 'react';
import { localize } from '@deriv-com/translations';
import {
    DEFAULT_BOT_INPUT,
    MAX_BOT_STAKE,
    MIN_BOT_STAKE,
    type BotGeneratorInput,
    type GeneratedBot,
} from '../bot-generator';
import { MAX_DURATION_TICKS, MIN_DURATION_TICKS } from '../execution-service';
import { STRATEGY_DEFINITIONS } from '../strategies';
import type { StrategyId, TradeDirection } from '../types';

interface BotGeneratorProps {
    /** The one generated bot, or null before the first generation. */
    bot: GeneratedBot | null;
    /** True while this bot's settings are the ones the engine is running. */
    applied: boolean;
    onGenerate: (input: BotGeneratorInput) => void;
    onUse: () => void;
    onRemove: () => void;
}

const DIRECTIONS: Array<{ id: TradeDirection; label: string }> = [
    { id: 'rise', label: 'Rise' },
    { id: 'fall', label: 'Fall' },
];

/**
 * Generates ONE Rise or Fall bot and hands it to the engine.
 *
 * Direction, strategy, stake and duration are the whole bot; generating replaces
 * the previous one. Using it sets those settings on the engine and limits this
 * mode's entries to the bot's own side — the risk engine, the duplicate guard
 * and the account verification still decide every entry.
 */
const BotGenerator = ({ bot, applied, onGenerate, onUse, onRemove }: BotGeneratorProps) => {
    const [direction, setDirection] = useState<TradeDirection>(DEFAULT_BOT_INPUT.direction);
    const [strategyId, setStrategyId] = useState<StrategyId>(DEFAULT_BOT_INPUT.strategyId);
    const [stake, setStake] = useState(DEFAULT_BOT_INPUT.stake);
    const [durationTicks, setDurationTicks] = useState(DEFAULT_BOT_INPUT.durationTicks);

    return (
        <section className='rise-fall__section' data-testid='rise-fall-bot-generator'>
            <div className='rise-fall__section-head'>
                <h3>{localize('Bot generator')}</h3>
                <span className='rise-fall__status'>{localize('One bot')}</span>
            </div>
            <p className='rise-fall__note'>
                {localize(
                    'Pick a side and the bot settings, then generate one bot. It trades through this engine with a flat stake — generating again replaces it.'
                )}
            </p>

            <div className='rise-fall__modes rise-fall__modes--pair' role='group' aria-label={localize('Bot side')}>
                {DIRECTIONS.map(item => (
                    <button
                        key={item.id}
                        type='button'
                        className={`rise-fall__mode${direction === item.id ? ' is-active' : ''}`}
                        data-testid={`rise-fall-generator-${item.id}`}
                        aria-pressed={direction === item.id}
                        onClick={() => setDirection(item.id)}
                    >
                        {localize(item.label)}
                    </button>
                ))}
            </div>

            <div className='rise-fall__grid'>
                <label className='rise-fall__field' htmlFor='rise-fall-generator-strategy'>
                    <span>{localize('Strategy')}</span>
                    <select
                        id='rise-fall-generator-strategy'
                        data-testid='rise-fall-generator-strategy'
                        className='rise-fall__select'
                        value={strategyId}
                        onChange={event => setStrategyId(event.target.value as StrategyId)}
                    >
                        {STRATEGY_DEFINITIONS.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='rise-fall__field' htmlFor='rise-fall-generator-stake'>
                    <span>{localize('Stake per trade')}</span>
                    <input
                        id='rise-fall-generator-stake'
                        data-testid='rise-fall-generator-stake'
                        type='number'
                        inputMode='decimal'
                        step={0.05}
                        min={MIN_BOT_STAKE}
                        max={MAX_BOT_STAKE}
                        value={stake}
                        onChange={event => setStake(Number(event.target.value))}
                    />
                </label>
                <label className='rise-fall__field' htmlFor='rise-fall-generator-duration'>
                    <span>{localize('Duration (ticks)')}</span>
                    <input
                        id='rise-fall-generator-duration'
                        data-testid='rise-fall-generator-duration'
                        type='number'
                        inputMode='numeric'
                        step={1}
                        min={MIN_DURATION_TICKS}
                        max={MAX_DURATION_TICKS}
                        value={durationTicks}
                        onChange={event => setDurationTicks(Number(event.target.value))}
                    />
                </label>
            </div>

            <div className='rise-fall__controls'>
                <button
                    type='button'
                    className='rise-fall__button is-primary'
                    data-testid='rise-fall-generate-bot'
                    onClick={() => onGenerate({ direction, strategyId, stake, durationTicks })}
                >
                    {bot ? localize('Generate again') : localize('Generate bot')}
                </button>
            </div>

            {bot && (
                <div className='rise-fall__facts' data-testid='rise-fall-generated-bot'>
                    <div>
                        <span>{localize('Bot')}</span>
                        <b data-testid='rise-fall-generated-bot-name'>{bot.name}</b>
                    </div>
                    <div>
                        <span>{localize('Direction')}</span>
                        <b>{bot.direction === 'rise' ? 'RISE' : 'FALL'}</b>
                    </div>
                    <div>
                        <span>{localize('Stake')}</span>
                        <b>{bot.stake}</b>
                    </div>
                    <div>
                        <span>{localize('Duration')}</span>
                        <b>{`${bot.durationTicks} ${localize('ticks')}`}</b>
                    </div>
                </div>
            )}
            {bot && (
                <div className='rise-fall__controls'>
                    <button
                        type='button'
                        className='rise-fall__button'
                        data-testid='rise-fall-use-bot'
                        onClick={onUse}
                    >
                        {localize('Use this bot')}
                    </button>
                    <button
                        type='button'
                        className='rise-fall__button is-danger'
                        data-testid='rise-fall-remove-bot'
                        onClick={onRemove}
                    >
                        {localize('Remove')}
                    </button>
                </div>
            )}
            {bot && (
                <p className='rise-fall__note' data-testid='rise-fall-generated-bot-state'>
                    {applied
                        ? localize('Running on this mode — entries are limited to this bot’s side.')
                        : localize('Generated. Press Use this bot to put its settings on this mode.')}
                </p>
            )}
        </section>
    );
};

export default BotGenerator;
