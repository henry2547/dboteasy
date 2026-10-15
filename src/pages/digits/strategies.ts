/**
 * Educational, percentage-based entry rules and their live performance.
 *
 * These rules describe *what the feed has been doing*. Nothing here predicts a
 * digit or places a trade — the lab is read-only.
 */

import type { AdaptiveSignal, RuleDef, RulePerformance } from './types';

export const RULES: RuleDef[] = [
    {
        id: 'over1',
        label: 'Over 1',
        kind: 'over',
        barrier: 1,
        description: 'Last digit is greater than 1 (2–9).',
    },
    {
        id: 'over2',
        label: 'Over 2',
        kind: 'over',
        barrier: 2,
        description: 'Last digit is greater than 2 (3–9).',
    },
    {
        id: 'under8',
        label: 'Under 8',
        kind: 'under',
        barrier: 8,
        description: 'Last digit is less than 8 (0–7).',
    },
    {
        id: 'under7',
        label: 'Under 7',
        kind: 'under',
        barrier: 7,
        description: 'Last digit is less than 7 (0–6).',
    },
    {
        id: 'even',
        label: 'Even',
        kind: 'even',
        description: 'Last digit is even (0, 2, 4, 6, 8).',
    },
    {
        id: 'odd',
        label: 'Odd',
        kind: 'odd',
        description: 'Last digit is odd (1, 3, 5, 7, 9).',
    },
];

/** The window of most recent ticks the adaptive logic reacts to. */
export const RECENT_WINDOW = 20;

export function evaluateRule(rule: RuleDef, digit: number): boolean {
    switch (rule.kind) {
        case 'over':
            return digit > (rule.barrier ?? 0);
        case 'under':
            return digit < (rule.barrier ?? 0);
        case 'even':
            return digit % 2 === 0;
        case 'odd':
            return digit % 2 === 1;
        default:
            return false;
    }
}

export function ruleById(id: string): RuleDef | undefined {
    return RULES.find(rule => rule.id === id);
}

/** Hit-rate over the last `window` digits. */
export function recentWinRate(rule: RuleDef, digits: number[], window = RECENT_WINDOW): number | null {
    if (digits.length === 0) return null;
    const slice = digits.slice(-window);
    const wins = slice.filter(digit => evaluateRule(rule, digit)).length;
    return (wins / slice.length) * 100;
}

/** Consecutive losses ending at the latest tick. */
export function currentLossStreak(rule: RuleDef, digits: number[]): number {
    let streak = 0;
    for (let index = digits.length - 1; index >= 0; index--) {
        if (evaluateRule(rule, digits[index])) break;
        streak += 1;
    }
    return streak;
}

function streaksFromOutcomes(outcomes: boolean[]): { win: number; loss: number } {
    let win = 0;
    let loss = 0;

    for (let index = outcomes.length - 1; index >= 0; index--) {
        if (outcomes[index]) {
            if (loss > 0) break;
            win += 1;
        } else {
            if (win > 0) break;
            loss += 1;
        }
    }

    return { win, loss };
}

export function computeRulePerformance(digits: number[], window = RECENT_WINDOW): RulePerformance[] {
    return RULES.map(rule => {
        const outcomes = digits.map(digit => evaluateRule(rule, digit));
        const total = outcomes.length;
        const wins = outcomes.filter(Boolean).length;
        const { win, loss } = streaksFromOutcomes(outcomes);
        const recent = recentWinRate(rule, digits, window);

        return {
            id: rule.id,
            label: rule.label,
            total,
            wins,
            losses: total - wins,
            winRate: total ? (wins / total) * 100 : null,
            winStreak: win,
            lossStreak: loss,
            recentWinRate: recent,
        };
    });
}

/**
 * Adapts entries to recent behaviour: a rule is "enter" only while its recent
 * hit-rate holds an edge and it is not on a losing run.
 */
export function computeAdaptiveSignals(digits: number[], window = RECENT_WINDOW): AdaptiveSignal[] {
    return RULES.map(rule => {
        const recent = recentWinRate(rule, digits, window) ?? 0;
        const lossStreak = currentLossStreak(rule, digits);
        const edge = recent - 50;
        const confidence = Math.max(0, Math.min(100, 50 + edge * 1.6));

        if (digits.length === 0) {
            return { id: rule.id, label: rule.label, recommendation: 'skip', confidence: 0, reason: 'Waiting for ticks.' };
        }

        if (lossStreak >= 4) {
            return {
                id: rule.id,
                label: rule.label,
                recommendation: 'skip',
                confidence,
                reason: `${lossStreak} losses in a row — cooling off.`,
            };
        }

        if (edge >= 5) {
            return {
                id: rule.id,
                label: rule.label,
                recommendation: 'enter',
                confidence,
                reason: `Recent hit-rate ${recent.toFixed(0)}% (+${edge.toFixed(0)} pts vs even).`,
            };
        }

        return {
            id: rule.id,
            label: rule.label,
            recommendation: 'skip',
            confidence,
            reason: `Recent hit-rate ${recent.toFixed(0)}% — no edge right now.`,
        };
    });
}
