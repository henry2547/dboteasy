/**
 * Default scanner configuration and validation.
 *
 * The config is the single source of truth for the strategy engine, the risk
 * manager and the execution service. A version hash is derived from it so a
 * signal generated under one config is rejected once the config changes.
 */

import type { PatternDef, RiskCheck, ScannerConfig, StrategyId, StrategyToggle } from './scanner-types';

export const DEFAULT_PATTERNS: PatternDef[] = [
    {
        id: 'over1-00',
        sequence: [0, 0],
        barrier: 1,
        direction: 'over',
        label: '00 → 0  (Over 1)',
    },
    {
        id: 'over1-11',
        sequence: [1, 1],
        barrier: 1,
        direction: 'over',
        label: '11 → 0  (Over 1)',
    },
    {
        id: 'under8-88',
        sequence: [8, 8],
        barrier: 8,
        direction: 'under',
        label: '88 → 9  (Under 8)',
    },
    {
        id: 'under8-99',
        sequence: [9, 9],
        barrier: 8,
        direction: 'under',
        label: '99 → 9  (Under 8)',
    },
];

export const STRATEGY_LABELS: Record<StrategyId, string> = {
    matches: 'Matches',
    differs: 'Differs',
    over1: 'Over 1',
    under8: 'Under 8',
    even: 'Even',
    odd: 'Odd',
    custom: 'Custom (block builder)',
};

export function defaultStrategies(): StrategyToggle[] {
    return (['matches', 'differs', 'over1', 'under8', 'even', 'odd', 'custom'] as StrategyId[]).map(id => ({
        id,
        enabled: id === 'even' || id === 'odd',
        digit: id === 'matches' || id === 'differs' ? null : null,
    }));
}

export function defaultScannerConfig(): ScannerConfig {
    return {
        analysisWindow: 200,
        minSampleSize: 100,
        minEvidence: 3,
        scanVolatility: true,
        scanVolatility1s: true,
        strategies: defaultStrategies(),
        patterns: DEFAULT_PATTERNS,
        stake: 1,
        maxStake: 50,
        sessionProfitTarget: 10,
        sessionLossLimit: 10,
        dailyLossLimit: 20,
        maxTrades: 20,
        maxConsecutiveLosses: 4,
        maxConsecutiveWins: null,
        maxConcurrentContracts: 1,
        cooldownMs: 5000,
        minTimeBetweenSignalsMs: 3000,
        maxEntryDelayMs: 8000,
        maxQuoteAgeMs: 5000,
        sessionDurationMs: null,
        autoRestartAfterContract: true,
        stopOnProfitTarget: true,
        stopOnLossLimit: true,
        accountMode: 'demo',
        durationTicks: 1,
    };
}

/**
 * Validates the config before the bot is allowed to start. Returns a list of
 * human-readable problems; an empty list means the config is sound.
 */
export function validateConfig(config: ScannerConfig): string[] {
    const problems: string[] = [];

    if (!Number.isFinite(config.stake) || config.stake <= 0) problems.push('Stake must be a positive number.');
    if (config.stake > config.maxStake) problems.push('Stake exceeds the maximum stake.');
    if (config.sessionProfitTarget <= 0) problems.push('Session profit target must be positive.');
    if (config.sessionLossLimit <= 0) problems.push('Session loss limit must be positive.');
    if (config.dailyLossLimit < config.sessionLossLimit) problems.push('Daily loss limit is below the session limit.');
    if (config.maxTrades <= 0) problems.push('Maximum trades must be positive.');
    if (config.maxConsecutiveLosses <= 0) problems.push('Maximum consecutive losses must be positive.');
    if (config.maxConcurrentContracts <= 0) problems.push('Maximum concurrent contracts must be positive.');
    if (config.analysisWindow < 20) problems.push('Analysis window must be at least 20 ticks.');
    if (config.minSampleSize > config.analysisWindow) problems.push('Minimum sample size exceeds the analysis window.');
    if (config.minEvidence < 1) problems.push('Minimum evidence must be at least 1.');
    if (config.durationTicks < 1) problems.push('Contract duration must be at least 1 tick.');
    if (!config.strategies.some(strategy => strategy.enabled)) problems.push('At least one strategy must be enabled.');

    return problems;
}

/** A cheap, order-independent hash of the config fields that affect a signal. */
export function configVersion(config: ScannerConfig): string {
    const relevant = {
        w: config.analysisWindow,
        s: config.strategies.filter(t => t.enabled).map(t => `${t.id}:${t.digit ?? 'auto'}`),
        d: config.durationTicks,
        p: config.patterns.map(p => `${p.sequence.join('')}-${p.barrier}-${p.direction}`),
    };
    return JSON.stringify(relevant);
}
