/**
 * Contract types, strategy definitions, and default settings for the AI bot.
 *
 * Deriv digit contract types (from src/components/shared/utils/contract/contract.tsx):
 *   DIGITOVER  — last digit > barrier  (Over N)
 *   DIGITUNDER — last digit < barrier  (Under N)
 *   DIGITEVEN  — last digit is even
 *   DIGITODD   — last digit is odd
 *   DIGITMATCH — last digit == barrier (prediction)
 *   DIGITDIFF  — last digit != barrier (prediction)
 */

import type { ScannerConfig, StrategyConfig, StrategyId, TradingSettings } from './types';

export const DERIV_CONTRACT_TYPES = {
    DIGITOVER: 'DIGITOVER',
    DIGITUNDER: 'DIGITUNDER',
    DIGITEVEN: 'DIGITEVEN',
    DIGITODD: 'DIGITODD',
    DIGITMATCH: 'DIGITMATCH',
    DIGITDIFF: 'DIGITDIFF',
} as const;

export const STRATEGY_DEFINITIONS: Record<StrategyId, Omit<StrategyConfig, 'enabled' | 'digit'>> = {
    matches: {
        id: 'matches',
        label: 'Matches',
        contractType: DERIV_CONTRACT_TYPES.DIGITMATCH,
        barrier: null,
        description: 'Last digit equals the selected digit. 1/10 theoretical probability.',
    },
    differs: {
        id: 'differs',
        label: 'Differs',
        contractType: DERIV_CONTRACT_TYPES.DIGITDIFF,
        barrier: null,
        description: 'Last digit differs from the selected digit. 9/10 theoretical probability.',
    },
    over1: {
        id: 'over1',
        label: 'Over 1',
        contractType: DERIV_CONTRACT_TYPES.DIGITOVER,
        barrier: '1',
        description: 'Last digit is greater than 1 (digits 2–9).',
    },
    under8: {
        id: 'under8',
        label: 'Under 8',
        contractType: DERIV_CONTRACT_TYPES.DIGITUNDER,
        barrier: '8',
        description: 'Last digit is less than 8 (digits 0–7).',
    },
    even: {
        id: 'even',
        label: 'Even',
        contractType: DERIV_CONTRACT_TYPES.DIGITEVEN,
        barrier: null,
        description: 'Last digit is even (0, 2, 4, 6, 8).',
    },
    odd: {
        id: 'odd',
        label: 'Odd',
        contractType: DERIV_CONTRACT_TYPES.DIGITODD,
        barrier: null,
        description: 'Last digit is odd (1, 3, 5, 7, 9).',
    },
    custom: {
        id: 'custom',
        label: 'Custom (Block Builder)',
        contractType: '',
        barrier: null,
        description: 'Strategies assembled in the drag-and-drop block builder.',
    },
};

export const DEFAULT_STRATEGIES: StrategyConfig[] = [
    { ...STRATEGY_DEFINITIONS.over1, enabled: true, digit: null },
    { ...STRATEGY_DEFINITIONS.under8, enabled: true, digit: null },
    { ...STRATEGY_DEFINITIONS.even, enabled: false, digit: null },
    { ...STRATEGY_DEFINITIONS.odd, enabled: false, digit: null },
    { ...STRATEGY_DEFINITIONS.matches, enabled: false, digit: 5 },
    { ...STRATEGY_DEFINITIONS.differs, enabled: false, digit: 5 },
    { ...STRATEGY_DEFINITIONS.custom, enabled: false, digit: null },
];

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
    analysisWindow: 100,
    minSampleSize: 50,
    minDeviationEdge: 2,
    patternOver1: ['00', '11'],
    patternUnder8: ['88', '99'],
    scanIntervalMs: 5000,
};

export const DEFAULT_SETTINGS: TradingSettings = {
    accountMode: 'demo',
    stake: 1,
    maxStake: 50,
    sessionProfitTarget: 10,
    sessionLossLimit: 10,
    dailyLossLimit: 20,
    maxTrades: 50,
    maxConsecutiveLosses: 5,
    maxConsecutiveWins: null,
    maxConcurrentContracts: 1,
    cooldownMs: 5000,
    minTimeBetweenSignalsMs: 3000,
    maxEntryDelayMs: 10000,
    maxQuoteAgeMs: 5000,
    sessionDurationMs: null,
    autoRestartAfterContract: true,
    stopOnProfitTarget: true,
    stopOnLossLimit: true,
    duration: 5,
    durationUnit: 't',
    analysisWindow: 100,
    minSampleSize: 50,
    minDeviationEdge: 2,
};

export const ANALYSIS_WINDOW_OPTIONS = [20, 50, 100, 200, 500];

/** Storage keys for persisting settings and session across refreshes. */
export const STORAGE_KEYS = {
    settings: 'aibot_settings',
    strategies: 'aibot_strategies',
    scannerConfig: 'aibot_scanner_config',
    session: 'aibot_session',
} as const;
