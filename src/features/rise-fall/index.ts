export { default } from './components/rise-fall-page';
export {
    useRiseFallEngine,
    MIN_BACKTEST_TICKS,
    DEFAULT_DURATION_TICKS,
    type RiseFallEngine,
    type LiveConnectionState,
} from './use-rise-fall-engine';
export {
    RiseFallExecutionService,
    VIRTUAL_PAYOUT_RATE,
    VIRTUAL_START_BALANCE,
    LIVE_ACCOUNT_REQUIRED,
    SIGNAL_MAX_AGE_MS,
    maskLoginId,
} from './execution-service';
export { classifyRegime, REGIME_LABELS } from './regime';
export {
    STRATEGY_DEFINITIONS,
    STRATEGY_IDS,
    DEFAULT_STRATEGY_CONFIG,
    evaluateAllStrategies,
    evaluateStrategy,
    strategyLabel,
    type StrategyConfig,
} from './strategies';
export {
    BACKTEST_PAYOUT_RATE,
    BREAK_EVEN_WIN_RATE,
    MIN_BACKTEST_TRADES,
    backtestStrategy,
    backtestStrategies,
    bestStrategy,
    rankStrategies,
    type BacktestResult,
} from './backtest';
export { DEFAULT_RISK, evaluateRisk, STAKING_RULE } from './risk-engine';
export type { RiskConfig } from './risk-engine';
export * from './types';
