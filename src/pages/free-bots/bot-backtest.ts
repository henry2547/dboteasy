/**
 * Walk-forward backtest for bots 8 and 9, on ticks the scanner already read.
 *
 * Every entry decision is made from the ticks up to and including the entry tick — the same gates the
 * loaded bot applies: a confirmed losing pair, both losing digits under the adaptive share ceiling,
 * and the red (coldest) bar on one of the two. The outcome is read strictly from the NEXT tick, so no
 * future tick ever informs an earlier decision.
 *
 * Nothing here predicts a digit: the result is a measurement of what this rule would have done on the
 * sample it was given, with the sample size reported so a thin reading is never mistaken for an edge.
 */

import {
    adaptiveShareLimit,
    areDigitsBelowShare,
    digitBarState,
    pairConfirmation,
} from '@/external/bot-skeleton/services/tradeEngine/utils/digit-analysis';
import { BOT_SHARE_CEILING, SETUP_SAMPLE } from './scanner-match';
import { FREE_BOT_TEMPLATES, freeBotById, type FreeBotId } from './templates';

export interface BotBacktestResult {
    templateId: FreeBotId;
    /** Position of the template in the Free Bots library ("Bot 8"). */
    botNumber: number;
    strategy: 'over1' | 'under8';
    label: string;
    /** Ticks the walk looked at. */
    ticks: number;
    /** Window the gates read, in ticks. */
    sample: number;
    /** The configured ceiling the adaptive ceiling starts from. */
    shareCeiling: number;
    /** Mean adaptive ceiling the gate used across the entries it took. */
    averageCeiling: number | null;
    entries: number;
    wins: number;
    losses: number;
    winRate: number | null;
    bestWinStreak: number;
    longestLossStreak: number;
    /** Running win rate after each entry, for the sparkline. */
    equityCurve: number[];
}

const LEGS = {
    over1: { templateId: 'over1_cold_run_recovery' as FreeBotId, pair: [0, 1], set: '0_1', barrier: 1 },
    under8: { templateId: 'under8_cold_run_recovery' as FreeBotId, pair: [8, 9], set: '8_9', barrier: 8 },
};

export interface BotBacktestOptions {
    /** Window the gates read; defaults to the bots' own 100 ticks. */
    sample?: number;
    /** Ceiling the adaptive ceiling starts from; defaults to the bots' own 10.2%. */
    shareCeiling?: number;
}

export function backtestColdRunBot(
    strategy: 'over1' | 'under8',
    digits: number[],
    options: BotBacktestOptions = {}
): BotBacktestResult {
    const leg = LEGS[strategy];
    const sample = Math.max(2, options.sample ?? SETUP_SAMPLE);
    const shareCeiling = options.shareCeiling ?? BOT_SHARE_CEILING;
    const template = freeBotById(leg.templateId);
    const [first, second] = leg.pair;

    const equityCurve: number[] = [];
    const ceilings: number[] = [];
    let entries = 0;
    let wins = 0;
    let winStreak = 0;
    let lossStreak = 0;
    let bestWinStreak = 0;
    let longestLossStreak = 0;

    for (let index = sample; index < digits.length - 1; index += 1) {
        const history = digits.slice(0, index + 1); // the entry tick is the newest tick there
        const ceiling = adaptiveShareLimit(history, shareCeiling, sample);

        const signal =
            ceiling !== null &&
            pairConfirmation(history, leg.set) &&
            areDigitsBelowShare(history, leg.pair, ceiling, sample) &&
            (digitBarState(history, first, sample) === 'coldest' ||
                digitBarState(history, second, sample) === 'coldest');

        if (!signal) continue;

        const next = digits[index + 1];
        const won = strategy === 'over1' ? next > leg.barrier : next < leg.barrier;

        entries += 1;
        ceilings.push(ceiling as number);
        if (won) {
            wins += 1;
            winStreak += 1;
            lossStreak = 0;
            bestWinStreak = Math.max(bestWinStreak, winStreak);
        } else {
            winStreak = 0;
            lossStreak += 1;
            longestLossStreak = Math.max(longestLossStreak, lossStreak);
        }
        equityCurve.push((wins / entries) * 100);
    }

    return {
        templateId: leg.templateId,
        botNumber: FREE_BOT_TEMPLATES.findIndex(item => item.id === leg.templateId) + 1,
        strategy,
        label: template?.strategyLabel ?? (strategy === 'over1' ? 'Over 1' : 'Under 8'),
        ticks: digits.length,
        sample,
        shareCeiling,
        averageCeiling: ceilings.length
            ? Math.round((ceilings.reduce((total, value) => total + value, 0) / ceilings.length) * 10) / 10
            : null,
        entries,
        wins,
        losses: entries - wins,
        winRate: entries ? (wins / entries) * 100 : null,
        bestWinStreak,
        longestLossStreak,
        equityCurve,
    };
}

/** Both bots backtested on one digit sample — what the scanner row shows. */
export function backtestColdRunBots(digits: number[], options: BotBacktestOptions = {}): BotBacktestResult[] {
    return [backtestColdRunBot('over1', digits, options), backtestColdRunBot('under8', digits, options)];
}
