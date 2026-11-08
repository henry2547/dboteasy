/**
 * GUI Trading Engine — strategy constants, defaults and input validation.
 *
 * The rule numbers live here so the UI, the controllers and the tests all read
 * the same source. Nothing here is a profitability claim: the thresholds are
 * frequency filters the user can see and (where the brief allows) change.
 */

import type { EngineConfig, PrimaryStrategyId, StrategySelection, TradeSource } from './types';

/** The rolling window the brief specifies: the latest 1,000 genuine ticks. */
export const ENGINE_WINDOW = 1000;

/** Individual digit ceiling for the Over 1 / Under 8 permission filters. */
export const PRIMARY_DIGIT_CEILING = 10.2;

/** Consecutive ticks a parity pattern needs before it can trigger recovery. */
export const PARITY_PATTERN_LENGTH = 2;

export const PRIMARY_STRATEGIES: Record<
    PrimaryStrategyId,
    {
        id: PrimaryStrategyId;
        label: string;
        contractType: 'DIGITOVER' | 'DIGITUNDER';
        barrier: number;
        /** Digits whose individual frequency gates the entry. */
        filterDigits: [number, number];
        /** Digits that confirm a pending setup (and the pair digits themselves). */
        targetDigits: number[];
        validPairs: string[];
        source: TradeSource;
    }
> = {
    over1: {
        id: 'over1',
        label: 'Over 1',
        contractType: 'DIGITOVER',
        barrier: 1,
        filterDigits: [0, 1],
        targetDigits: [0, 1],
        validPairs: ['00', '01', '10', '11'],
        source: 'gui_over1',
    },
    under8: {
        id: 'under8',
        label: 'Under 8',
        contractType: 'DIGITUNDER',
        barrier: 8,
        filterDigits: [8, 9],
        targetDigits: [8, 9],
        validPairs: ['88', '89', '98', '99'],
        source: 'gui_under8',
    },
};

export const RECOVERY_SOURCE: TradeSource = 'gui_recovery';

export const DEFAULT_CONFIG: EngineConfig = {
    strategy: 'over1',
    initialStake: 1,
    takeProfit: 10,
    stopLoss: 20,
    multiplier: 2,
    multiplierScope: 'both',
    maxConsecutiveLosses: 6,
    maxRecoveryTrades: 3,
    maxOpenContracts: 1,
    maxStake: 20,
    recoveryFilterEnabled: true,
    // Editable starting points, not a guarantee. Both percentages are always
    // shown live, with or without the filter.
    maxEvenPercent: 52,
    maxOddPercent: 52,
};

/** The ten volatility markets the brief lists, used only to label/verify the feed. */
export const VOLATILITY_MARKET_NAMES: Record<string, string> = {
    R_10: 'Volatility 10 Index',
    R_25: 'Volatility 25 Index',
    R_50: 'Volatility 50 Index',
    R_75: 'Volatility 75 Index',
    R_100: 'Volatility 100 Index',
    '1HZ10V': 'Volatility 10 (1s) Index',
    '1HZ25V': 'Volatility 25 (1s) Index',
    '1HZ50V': 'Volatility 50 (1s) Index',
    '1HZ75V': 'Volatility 75 (1s) Index',
    '1HZ100V': 'Volatility 100 (1s) Index',
};

export function strategiesFor(selection: StrategySelection): PrimaryStrategyId[] {
    return selection === 'both' ? ['over1', 'under8'] : [selection];
}

export function strategyLabel(selection: StrategySelection): string {
    if (selection === 'both') return 'Both strategies';
    return PRIMARY_STRATEGIES[selection].label;
}

export function tradeSourceLabel(source: TradeSource): string {
    if (source === 'gui_over1') return 'GUI Trading Engine – Over 1';
    if (source === 'gui_under8') return 'GUI Trading Engine – Under 8';
    return 'GUI Trading Engine – Even/Odd Recovery';
}

export type ConfigErrors = Partial<Record<keyof EngineConfig, string>>;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates every editable input. A failing field blocks Start, so an invalid
 * stake can never reach a proposal request.
 */
export function validateConfig(config: EngineConfig): ConfigErrors {
    const errors: ConfigErrors = {};

    if (!isFiniteNumber(config.initialStake) || config.initialStake <= 0) {
        errors.initialStake = 'Initial stake must be greater than 0.';
    }
    if (!isFiniteNumber(config.takeProfit) || config.takeProfit <= 0) {
        errors.takeProfit = 'Take profit must be greater than 0.';
    }
    if (!isFiniteNumber(config.stopLoss) || config.stopLoss <= 0) {
        errors.stopLoss = 'Stop loss must be greater than 0.';
    }
    if (!isFiniteNumber(config.multiplier) || config.multiplier < 1) {
        errors.multiplier = 'Multiplier must be at least 1 (1 = flat staking).';
    }
    if (!isFiniteNumber(config.maxStake) || config.maxStake <= 0) {
        errors.maxStake = 'Maximum stake must be greater than 0.';
    } else if (isFiniteNumber(config.initialStake) && config.maxStake < config.initialStake) {
        errors.maxStake = 'Maximum stake cannot be below the initial stake.';
    }
    if (!isFiniteNumber(config.maxConsecutiveLosses) || config.maxConsecutiveLosses < 1) {
        errors.maxConsecutiveLosses = 'Allow at least one consecutive loss limit (1 or more).';
    }
    if (!isFiniteNumber(config.maxRecoveryTrades) || config.maxRecoveryTrades < 0) {
        errors.maxRecoveryTrades = 'Maximum recovery trades cannot be negative.';
    }
    if (!isFiniteNumber(config.maxOpenContracts) || config.maxOpenContracts < 1) {
        errors.maxOpenContracts = 'At least one open contract must be allowed.';
    }
    if (!isFiniteNumber(config.maxEvenPercent) || config.maxEvenPercent <= 0 || config.maxEvenPercent > 100) {
        errors.maxEvenPercent = 'Even threshold must be between 0 and 100.';
    }
    if (!isFiniteNumber(config.maxOddPercent) || config.maxOddPercent <= 0 || config.maxOddPercent > 100) {
        errors.maxOddPercent = 'Odd threshold must be between 0 and 100.';
    }

    return errors;
}

export function hasConfigErrors(errors: ConfigErrors): boolean {
    return Object.keys(errors).length > 0;
}

/** Applies the multiplier only to the legs the user selected. */
export function multiplierApplies(scope: EngineConfig['multiplierScope'], kind: 'primary' | 'recovery'): boolean {
    return scope === 'both' || scope === kind;
}
