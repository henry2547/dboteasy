/**
 * The one Rise/Fall bot generator.
 *
 * It produces a single bot configuration — a direction, a strategy, a flat stake
 * and a tick duration — and keeps it in one storage slot, so "Generate bot"
 * always leaves the tab with exactly one bot. The bot is a preset for the
 * existing engine: applying it sets the strategy, the stake and the duration and
 * restricts entries to its own direction. It never bypasses the central
 * executor, the risk engine or the account verification.
 */

import { MAX_DURATION_TICKS, MIN_DURATION_TICKS } from './execution-service';
import { strategyLabel } from './strategies';
import type { StrategyId, TradeDirection } from './types';

export const GENERATED_BOT_STORAGE_KEY = 'rise-fall:generated-bot';

/** Smallest stake the generator accepts, in the account's own currency. */
export const MIN_BOT_STAKE = 0.01;
/** Highest stake the generator accepts — a bot is generated, not a budget. */
export const MAX_BOT_STAKE = 100;

export interface GeneratedBot {
    /** Stable id for React keys and the storage record. */
    id: string;
    /** Display name, e.g. "Rise · Breakout". */
    name: string;
    direction: TradeDirection;
    strategyId: StrategyId;
    /** Flat stake per trade — the generator never builds an escalating stake. */
    stake: number;
    durationTicks: number;
    createdAt: number;
}

export interface BotGeneratorInput {
    direction: TradeDirection;
    strategyId: StrategyId;
    stake: number;
    durationTicks: number;
}

export const DEFAULT_BOT_INPUT: BotGeneratorInput = {
    direction: 'rise',
    strategyId: 'trend_continuation',
    stake: 0.35,
    durationTicks: 5,
};

export function botName(direction: TradeDirection, strategyId: StrategyId): string {
    return `${direction === 'rise' ? 'Rise' : 'Fall'} · ${strategyLabel(strategyId)}`;
}

/** Round to the currency's usual two decimals — no invented sub-cent stakes. */
function normaliseStake(value: number): number {
    const rounded = Math.round(value * 100) / 100;
    return Math.min(MAX_BOT_STAKE, Math.max(MIN_BOT_STAKE, rounded));
}

function normaliseDuration(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_BOT_INPUT.durationTicks;
    return Math.min(MAX_DURATION_TICKS, Math.max(MIN_DURATION_TICKS, Math.round(value)));
}

/** Builds the single bot from the settings the user chose. */
export function generateBot(input: BotGeneratorInput): GeneratedBot {
    const direction: TradeDirection = input.direction === 'fall' ? 'fall' : 'rise';
    const stake = Number.isFinite(input.stake) ? normaliseStake(input.stake) : DEFAULT_BOT_INPUT.stake;
    const durationTicks = normaliseDuration(input.durationTicks);

    return {
        id: `rf-bot-${Date.now()}`,
        name: botName(direction, input.strategyId),
        direction,
        strategyId: input.strategyId,
        stake,
        durationTicks,
        createdAt: Date.now(),
    };
}

function isGeneratedBot(value: unknown): value is GeneratedBot {
    const candidate = value as GeneratedBot | null;
    return (
        !!candidate &&
        typeof candidate.id === 'string' &&
        (candidate.direction === 'rise' || candidate.direction === 'fall') &&
        typeof candidate.strategyId === 'string' &&
        typeof candidate.stake === 'number' &&
        typeof candidate.durationTicks === 'number'
    );
}

/** The bot last generated on this browser, or null. Never throws. */
export function loadGeneratedBot(): GeneratedBot | null {
    try {
        const raw = window.localStorage.getItem(GENERATED_BOT_STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isGeneratedBot(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function saveGeneratedBot(bot: GeneratedBot): void {
    try {
        window.localStorage.setItem(GENERATED_BOT_STORAGE_KEY, JSON.stringify(bot));
    } catch {
        // Storage can be unavailable (private mode); the bot still lives in React state.
    }
}

export function clearGeneratedBot(): void {
    try {
        window.localStorage.removeItem(GENERATED_BOT_STORAGE_KEY);
    } catch {
        // Nothing to clear.
    }
}
