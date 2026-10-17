/**
 * Deterministic strategy evaluation engine.
 *
 * The AI scanner *ranks and explains* markets; this engine *decides* whether a
 * configured condition is satisfied and emits a structured signal. It never
 * predicts a digit and never overrides the risk manager. Pattern confirmation
 * (the two-digit setup) is kept strictly separate from the contract's
 * subsequent outcome (the digit that follows).
 */

import { configVersion } from './scanner-config';
import type {
    DigitContractType,
    MarketScan,
    PatternObservation,
    ScannerConfig,
    StrategyId,
    StrategySignal,
    StrategyToggle,
} from './scanner-types';

let signalCounter = 0;

function nextSignalId(): string {
    signalCounter += 1;
    return `sig-${Date.now().toString(36)}-${signalCounter}`;
}

/** Maps a strategy id to the Deriv contract type it purchases. */
export function contractTypeFor(strategy: StrategyId): DigitContractType {
    switch (strategy) {
        case 'matches':
            return 'DIGITMATCH';
        case 'differs':
            return 'DIGITDIFF';
        case 'over1':
            return 'DIGITOVER';
        case 'under8':
            return 'DIGITUNDER';
        case 'even':
            return 'DIGITEVEN';
        case 'odd':
            return 'DIGITODD';
        case 'custom':
            return 'DIGITMATCH'; // placeholder until a block-builder strategy is bound
    }
}

interface EvaluationInput {
    scan: MarketScan;
    config: ScannerConfig;
    now: number;
}

/**
 * Evaluates the top-ranked market against every enabled strategy and returns
 * the first qualifying signal, or null when no condition is satisfied.
 *
 * "No qualifying setup" is a first-class result — the scanner waits rather
 * than inventing evidence.
 */
export function evaluateStrategy({ scan, config, now }: EvaluationInput): StrategySignal | null {
    const enabled = config.strategies.filter(t => t.enabled);
    const failures: string[] = [];

    if (scan.sampleSize < config.minSampleSize) {
        failures.push(`Sample ${scan.sampleSize} < minimum ${config.minSampleSize}.`);
    }
    if (!scan.feedFresh) {
        failures.push('Market feed is not fresh.');
    }

    for (const toggle of enabled) {
        const result = evaluateOne(toggle, scan, config, now);
        if (result) return result;
        if (failures.length === 0) failures.push(`${toggle.id}: conditions not met.`);
    }

    // No strategy qualified — return null; the caller reports "No qualifying setup".
    void failures;
    return null;
}

function evaluateOne(
    toggle: StrategyToggle,
    scan: MarketScan,
    config: ScannerConfig,
    now: number
): StrategySignal | null {
    const passed: string[] = [];
    const failed: string[] = [];

    if (scan.sampleSize < config.minSampleSize) failed.push(`Sample ${scan.sampleSize} < ${config.minSampleSize}.`);
    else passed.push(`Sample ${scan.sampleSize} ≥ ${config.minSampleSize}.`);

    if (!scan.feedFresh) failed.push('Feed stale.');
    else passed.push('Feed fresh.');

    const contractType = contractTypeFor(toggle.id);
    let prediction: number | null = null;
    let barrier: number | null = null;
    let reason = '';

    switch (toggle.id) {
        case 'even': {
            const edge = scan.evenPercentage - 50;
            if (edge >= 5) {
                passed.push(`Even ${scan.evenPercentage.toFixed(0)}% (+${edge.toFixed(0)} pts).`);
                reason = `Even digit frequency ${scan.evenPercentage.toFixed(0)}% shows an edge.`;
            } else {
                failed.push(`Even edge ${edge.toFixed(0)} pts below 5.`);
            }
            break;
        }
        case 'odd': {
            const edge = scan.oddPercentage - 50;
            if (edge >= 5) {
                passed.push(`Odd ${scan.oddPercentage.toFixed(0)}% (+${edge.toFixed(0)} pts).`);
                reason = `Odd digit frequency ${scan.oddPercentage.toFixed(0)}% shows an edge.`;
            } else {
                failed.push(`Odd edge ${edge.toFixed(0)} pts below 5.`);
            }
            break;
        }
        case 'over1':
        case 'under8': {
            const direction = toggle.id === 'over1' ? 'over' : 'under';
            const obs = scan.patterns.find(o => o.pattern.direction === direction);
            if (!obs || obs.confirmations < config.minEvidence) {
                failed.push(`Pattern confirmations ${obs?.confirmations ?? 0} < ${config.minEvidence}.`);
                break;
            }
            barrier = obs.pattern.barrier;
            if (!obs.currentlyConfirmed) {
                failed.push('Pattern not currently confirmed (last two digits do not match).');
                break;
            }
            passed.push(
                `${obs.pattern.label}: ${obs.confirmations}× confirmed, ` +
                    `${obs.observedWinRate !== null ? obs.observedWinRate.toFixed(0) + '% cleared' : 'no outcomes'}.`
            );
            reason = `Pattern ${obs.pattern.label} is live with ${obs.confirmations} confirmations.`;
            break;
        }
        case 'matches':
        case 'differs': {
            // Choose the digit: user override, else the engine's candidate.
            if (toggle.digit !== null) {
                prediction = toggle.digit;
                passed.push(`Using user-selected digit ${prediction}.`);
            } else {
                const sorted = [...scan.frequencies].map((pct, digit) => ({ pct, digit })).sort((a, b) => b.pct - a.pct);
                const candidate = toggle.id === 'matches' ? sorted[0] : sorted[sorted.length - 1];
                if (!candidate || Math.abs(candidate.pct - 10) < 3) {
                    failed.push('No digit with a sufficient frequency edge for a candidate.');
                    break;
                }
                prediction = candidate.digit;
                passed.push(`Engine candidate digit ${prediction} (${candidate.pct.toFixed(0)}%).`);
            }
            reason = `${toggle.id === 'matches' ? 'Matches' : 'Differs'} digit ${prediction} selected.`;
            break;
        }
        case 'custom': {
            // Custom block-builder strategies are not yet wired to a contract
            // definition; the engine refuses to fabricate one.
            failed.push('Custom strategy has no bound contract definition yet.');
            break;
        }
    }

    if (failed.length > 0) return null;

    return {
        id: nextSignalId(),
        symbol: scan.symbol,
        strategy: toggle.id,
        contractType,
        prediction,
        barrier,
        signalTimestamp: now,
        tickEpoch: scan.lastTickEpoch ?? Math.floor(now / 1000),
        configVersion: configVersion(config),
        statistics: {
            sampleSize: scan.sampleSize,
            frequencies: scan.frequencies,
            meanAbsoluteDeviation: scan.meanAbsoluteDeviation,
            frequencyStability: scan.frequencyStability,
            evenPercentage: scan.evenPercentage,
            oddPercentage: scan.oddPercentage,
            lowPercentage: scan.lowPercentage,
            highPercentage: scan.highPercentage,
        },
        conditionsPassed: passed,
        conditionsFailed: failed,
        reason,
        proposal: {
            contractType,
            symbol: scan.symbol,
            duration: config.durationTicks,
            durationUnit: 't',
            stake: config.stake,
            prediction,
            barrier,
        },
    };
}

/** Human-readable summary of why a scan did not produce a signal. */
export function explainNoSignal(scan: MarketScan, config: ScannerConfig): string {
    const enabled = config.strategies.filter(t => t.enabled).map(t => t.id);
    if (scan.sampleSize < config.minSampleSize) return `Waiting for ${config.minSampleSize} ticks (${scan.sampleSize} so far).`;
    if (!scan.feedFresh) return 'Feed is stale — waiting for fresh ticks.';
    if (!scan.qualifyingStrategies.some(s => enabled.includes(s))) return 'No enabled strategy qualifies on this market.';
    return 'No qualifying setup.';
}

export type { PatternObservation };
