/**
 * Walk-forward historical checker.
 *
 * For each tick after an initial lookback, the entry decision is made from the
 * *past* window only and the outcome is read from the very next tick. No future
 * tick ever informs an earlier decision, so there is no lookahead bias.
 */

import { RULES, evaluateRule, recentWinRate } from './strategies';
import type { BacktestResult, RuleDef } from './types';

export const BACKTEST_LOOKBACK = 20;
const ENTRY_THRESHOLD = 52;

export function walkForwardBacktest(
    rule: RuleDef,
    digits: number[],
    lookback = BACKTEST_LOOKBACK,
    threshold = ENTRY_THRESHOLD
): BacktestResult {
    const outcomes: boolean[] = [];
    const equityCurve: number[] = [];

    let runningWins = 0;
    let winStreak = 0;
    let lossStreak = 0;
    let bestWinStreak = 0;
    let longestLossStreak = 0;

    for (let index = lookback; index < digits.length; index++) {
        const history = digits.slice(index - lookback, index); // past ticks only
        const recent = recentWinRate(rule, history, lookback) ?? 0;
        if (recent < threshold) continue; // rule had no edge here — no entry

        const won = evaluateRule(rule, digits[index]); // resolved on the next tick
        outcomes.push(won);

        if (won) {
            runningWins += 1;
            winStreak += 1;
            lossStreak = 0;
            bestWinStreak = Math.max(bestWinStreak, winStreak);
        } else {
            winStreak = 0;
            lossStreak += 1;
            longestLossStreak = Math.max(longestLossStreak, lossStreak);
        }

        equityCurve.push((runningWins / outcomes.length) * 100);
    }

    const trades = outcomes.length;
    const wins = outcomes.filter(Boolean).length;

    return {
        id: rule.id,
        label: rule.label,
        trades,
        wins,
        losses: trades - wins,
        winRate: trades ? (wins / trades) * 100 : null,
        bestWinStreak,
        longestLossStreak,
        equityCurve,
    };
}

export function runBacktests(digits: number[], lookback = BACKTEST_LOOKBACK): BacktestResult[] {
    return RULES.map(rule => walkForwardBacktest(rule, digits, lookback));
}
