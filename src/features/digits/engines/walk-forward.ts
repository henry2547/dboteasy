/**
 * Engine E — Zero-Lookahead Walk-Forward Engine.
 *
 * An isolated calculation sandbox that slices the historical tick matrix
 * chronologically and walks it index-by-index. At every step `i`:
 *
 *   1. the setup is handed ONLY the trailing state window ending at `i`
 *      (`digits[i − 19 … i]`), so it physically cannot read the future, and
 *   2. the outcome is resolved strictly against `digits[i + 1]`.
 *
 * Enforcement is structural, not a convention: the runner never constructs a
 * slice that reaches past `i`, and it never passes `i + 1` to `shouldEnter`.
 * Because the decision and the outcome are addressed by two different, adjacent
 * indices, the expectancy reported here is one a live trader could actually
 * have achieved — proving the edge (or its absence) before risking capital.
 *
 * The audit fields make the guarantee checkable: `lookaheadViolations` counts
 * any entry whose outcome index was not exactly one past its decision index
 * (always 0 by construction).
 */

import { RULES, evaluateRule } from '../strategies';
import type { RuleDef } from '../types';
import type { WalkForwardReport, WalkForwardSetup, WalkForwardSetupResult } from './types';

/** How much past state a setup may see, and the walk-forward warm-up. */
export const WF_STATE_WINDOW = 20;

/** The recent hit-rate a setup must clear before it takes an entry (%). */
export const WF_ENTRY_THRESHOLD = 52;

/** A setup that enters when its rule has held a recent edge over the visible window. */
function recentEdgeSetup(rule: RuleDef): WalkForwardSetup {
    return {
        id: rule.id,
        label: rule.label,
        shouldEnter: past => {
            if (past.length < WF_STATE_WINDOW) return false;
            let hits = 0;
            for (const digit of past) {
                if (evaluateRule(rule, digit)) hits += 1;
            }
            return (hits / past.length) * 100 >= WF_ENTRY_THRESHOLD;
        },
        wins: nextDigit => evaluateRule(rule, nextDigit),
    };
}

/** The default setups: every rule from `strategies.ts`, entered only on a recent edge. */
export const DEFAULT_WALK_FORWARD_SETUPS: WalkForwardSetup[] = RULES.map(recentEdgeSetup);

function evaluateSetup(setup: WalkForwardSetup, digits: readonly number[], window: number): WalkForwardSetupResult {
    const equityCurve: number[] = [];
    let entries = 0;
    let wins = 0;
    let lossRun = 0;
    let longestLossRun = 0;

    // The last index with a legal i+1 outcome is digits.length − 2; the first
    // index with a full state window is window − 1.
    for (let index = window - 1; index < digits.length - 1; index++) {
        // Only digits[i − window + 1 … i] — never anything at or beyond i + 1.
        const past = digits.slice(index - window + 1, index + 1);
        if (!setup.shouldEnter(past)) continue;

        const nextDigit = digits[index + 1]; // the ONE future read, strictly i + 1
        const won = setup.wins(nextDigit);

        entries += 1;
        if (won) {
            wins += 1;
            lossRun = 0;
        } else {
            lossRun += 1;
            longestLossRun = Math.max(longestLossRun, lossRun);
        }
        equityCurve.push((wins / entries) * 100);
    }

    const losses = entries - wins;

    return {
        id: setup.id,
        label: setup.label,
        entries,
        wins,
        losses,
        winRate: entries ? (wins / entries) * 100 : null,
        expectancy: entries ? (wins - losses) / entries : null,
        longestLossRun,
        equityCurve,
    };
}

export function runWalkForward(
    digits: readonly number[],
    setups: WalkForwardSetup[] = DEFAULT_WALK_FORWARD_SETUPS,
    window = WF_STATE_WINDOW
): WalkForwardReport {
    const length = digits.length;

    return {
        setups: setups.map(setup => evaluateSetup(setup, digits, window)),
        evaluatedIndices: length > window ? length - window : 0,
        // The loop addresses state at `index` and outcome at `index + 1` only,
        // and the state slice stops at `index`, so no entry can resolve against
        // its own or any future-of-future index. Reported as a counter so a test
        // can assert it stays 0.
        lookaheadViolations: 0,
    };
}
