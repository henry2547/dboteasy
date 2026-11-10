/**
 * Walk-forward backtester and ranking for the eight strategies.
 *
 * One pass over the genuine ticks the feed already holds. At index `i` a
 * strategy may only read ticks up to and including `i`; the outcome is read from
 * tick `i + durationTicks`, so the runner never builds a slice that reaches past
 * the decision (zero lookahead by construction, not by discipline).
 *
 * The payout is the same stated assumption the virtual ledger uses (95% of
 * stake). That makes every figure here an ESTIMATE of one fixed assumption, not
 * a real return, and it is labelled as such everywhere it is shown.
 */

import { classifyRegime } from './regime';
import { evaluateAllStrategies, STRATEGY_DEFINITIONS, strategyLabel } from './strategies';
import { DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from './strategies/shared';
import type { StrategyId, Tick, TradeDirection } from './types';

/** The payout assumption shared with the virtual ledger. */
export const BACKTEST_PAYOUT_RATE = 0.95;

/** Flat stake of one unit per trade — the engine has no stake escalation. */
export const BACKTEST_STAKE = 1;

/** Duration used when the caller does not pass one. */
export const BACKTEST_DURATION_TICKS = 5;

/** Fewer settled trades than this and the result is reported as not qualified. */
export const MIN_BACKTEST_TRADES = 5;

export const BREAK_EVEN_WIN_RATE = 1 / (1 + BACKTEST_PAYOUT_RATE);

export interface BacktestOptions {
    config?: StrategyConfig;
    durationTicks?: number;
    payoutRate?: number;
    /** Ticks the runner waits after a settlement before a new entry. */
    cooldownTicks?: number;
    strategyIds?: StrategyId[];
}

export interface BacktestResult {
    strategyId: StrategyId;
    label: string;
    symbol: string;
    /** Ticks the walk-forward actually examined. */
    decisions: number;
    trades: number;
    wins: number;
    losses: number;
    ties: number;
    /** Null when nothing settled. */
    winRate: number | null;
    netProfit: number;
    maxDrawdown: number;
    longestLosingStreak: number;
    breakEvenWinRate: number;
    /** winRate − breakEvenWinRate; null when nothing settled. */
    edge: number | null;
    /** Ranking metric: edge weighted by how many trades produced it. */
    score: number;
    qualified: boolean;
    firstEntryEpoch: number | null;
    lastEntryEpoch: number | null;
    note: string;
}

interface StrategyRun {
    open: { exitIndex: number; entryQuote: number; direction: TradeDirection; epoch: number } | null;
    /** No new entry before this index — the caller's cool-down. */
    blockedUntilIndex: number;
    trades: number;
    wins: number;
    losses: number;
    ties: number;
    netProfit: number;
    equity: number;
    peak: number;
    maxDrawdown: number;
    losingStreak: number;
    longestLosingStreak: number;
    firstEntryEpoch: number | null;
    lastEntryEpoch: number | null;
}

function createRun(): StrategyRun {
    return {
        open: null,
        blockedUntilIndex: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        netProfit: 0,
        equity: 0,
        peak: 0,
        maxDrawdown: 0,
        losingStreak: 0,
        longestLosingStreak: 0,
        firstEntryEpoch: null,
        lastEntryEpoch: null,
    };
}

function settle(run: StrategyRun, entryQuote: number, direction: TradeDirection, exitQuote: number, payoutRate: number) {
    const won = direction === 'rise' ? exitQuote > entryQuote : exitQuote < entryQuote;
    const profit = won ? BACKTEST_STAKE * payoutRate : -BACKTEST_STAKE;

    run.trades += 1;
    if (won) {
        run.wins += 1;
        run.losingStreak = 0;
    } else {
        run.losses += 1;
        if (exitQuote === entryQuote) run.ties += 1;
        run.losingStreak += 1;
        run.longestLosingStreak = Math.max(run.longestLosingStreak, run.losingStreak);
    }

    run.netProfit += profit;
    run.equity += profit;
    run.peak = Math.max(run.peak, run.equity);
    run.maxDrawdown = Math.max(run.maxDrawdown, run.peak - run.equity);
}

function toResult(run: StrategyRun, id: StrategyId, symbol: string, decisions: number, payoutRate: number): BacktestResult {
    const winRate = run.trades > 0 ? run.wins / run.trades : null;
    const edge = winRate === null ? null : winRate - BREAK_EVEN_WIN_RATE;
    const score = edge === null ? 0 : edge * Math.sqrt(run.trades);

    return {
        strategyId: id,
        label: strategyLabel(id),
        symbol,
        decisions,
        trades: run.trades,
        wins: run.wins,
        losses: run.losses,
        ties: run.ties,
        winRate,
        netProfit: Number(run.netProfit.toFixed(2)),
        maxDrawdown: Number(run.maxDrawdown.toFixed(2)),
        longestLosingStreak: run.longestLosingStreak,
        breakEvenWinRate: BREAK_EVEN_WIN_RATE,
        edge,
        score: Number((qualified(run) ? score : 0).toFixed(4)),
        qualified: qualified(run),
        firstEntryEpoch: run.firstEntryEpoch,
        lastEntryEpoch: run.lastEntryEpoch,
        note:
            `${decisions} walk-forward decisions on genuine ticks; the winner had to clear a ` +
            `${(BREAK_EVEN_WIN_RATE * 100).toFixed(1)}% break-even rate at the stated ${(payoutRate * 100).toFixed(0)}% payout. ` +
            'In-sample and ESTIMATED — not a real return.',
    };
}

function qualified(run: StrategyRun): boolean {
    return run.trades >= MIN_BACKTEST_TRADES;
}

/**
 * Replays `ticks` once and reports every strategy. Entries decide on tick `i`
 * and settle on tick `i + durationTicks`; a strategy holds at most one position.
 */
export function backtestStrategies(ticks: Tick[], symbol: string, options: BacktestOptions = {}): BacktestResult[] {
    const config = options.config ?? DEFAULT_STRATEGY_CONFIG;
    const durationTicks = Math.max(1, Math.round(options.durationTicks ?? BACKTEST_DURATION_TICKS));
    const payoutRate = options.payoutRate ?? BACKTEST_PAYOUT_RATE;
    const cooldownTicks = Math.max(0, Math.round(options.cooldownTicks ?? 0));
    const wanted = options.strategyIds ?? STRATEGY_DEFINITIONS.map(item => item.id);

    const warmup = Math.max(config.minTicks, config.slowPeriod * 2) + 2;
    const runs = new Map<StrategyId, StrategyRun>();
    wanted.forEach(id => runs.set(id, createRun()));

    let decisions = 0;
    const lastDecision = ticks.length - durationTicks - 1;

    for (let index = warmup; index <= lastDecision; index += 1) {
        // Settle anything due on this index before deciding again.
        runs.forEach(run => {
            if (run.open && index >= run.open.exitIndex) {
                settle(run, run.open.entryQuote, run.open.direction, ticks[index].quote, payoutRate);
                run.open = null;
                run.blockedUntilIndex = index + cooldownTicks;
            }
        });

        const slice = ticks.slice(0, index + 1);
        const signals = evaluateAllStrategies(slice, symbol, config, classifyRegime(slice));
        decisions += 1;

        signals.forEach(signal => {
            const run = runs.get(signal.strategyId);
            if (!run || run.open) return;
            if (index < run.blockedUntilIndex) return;
            if (signal.direction === 'none' || !signal.suitable) return;
            run.open = {
                exitIndex: index + durationTicks,
                entryQuote: ticks[index].quote,
                direction: signal.direction,
                epoch: ticks[index].epoch,
            };
            if (run.firstEntryEpoch === null) run.firstEntryEpoch = ticks[index].epoch;
            run.lastEntryEpoch = ticks[index].epoch;
        });
    }

    return (options.strategyIds ?? STRATEGY_DEFINITIONS.map(item => item.id)).map(id =>
        toResult(runs.get(id) as StrategyRun, id, symbol, decisions, payoutRate)
    );
}

/** Backtests one strategy over the same walk-forward pass. */
export function backtestStrategy(
    id: StrategyId,
    ticks: Tick[],
    symbol: string,
    options: BacktestOptions = {}
): BacktestResult {
    return backtestStrategies(ticks, symbol, { ...options, strategyIds: [id] })[0];
}

/** Ranked best first: qualified results by score, then the unqualified ones. */
export function rankStrategies(ticks: Tick[], symbol: string, options: BacktestOptions = {}): BacktestResult[] {
    return backtestStrategies(ticks, symbol, options).slice().sort((a, b) => {
        if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        return b.trades - a.trades;
    });
}

/** The best qualifying strategy, or null when nothing qualified. */
export function bestStrategy(ticks: Tick[], symbol: string, options: BacktestOptions = {}): BacktestResult | null {
    return rankStrategies(ticks, symbol, options).find(result => result.qualified) ?? null;
}
