/**
 * Even/Odd loss-response recovery controller.
 *
 * Recovery evaluation opens only after a *confirmed* primary contract loss
 * (a real Deriv settlement), never on a failed purchase, a rejection or a
 * closed tab. It then watches consecutive genuine ticks for a two-digit parity
 * pattern and buys the reversal:
 *
 *   two consecutive EVEN digits → ODD contract
 *   two consecutive ODD digits  → EVEN contract
 *   mixed parity                → no entry
 *
 * The frequency filter is optional. When enabled, the contract's losing side
 * (the parity being bet against) must sit at or below its configured ceiling;
 * both percentages are always reported either way.
 */

import { ENGINE_WINDOW, PARITY_PATTERN_LENGTH } from './config';
import type {
    DigitWindowStats,
    EngineConfig,
    ParityDirection,
    ParityStats,
    RecoveryPattern,
    RecoveryRuntime,
    RecoverySignal,
} from './types';

export function createRecoveryRuntime(): RecoveryRuntime {
    return {
        state: 'PRIMARY_TRADING',
        active: false,
        contractId: null,
        activatedContracts: [],
        attempts: 0,
        consecutiveLosses: 0,
        previousDigit: null,
        lastTwo: [null, null],
        pattern: null,
        direction: null,
        lastReason: null,
    };
}

export interface RecoveryActivation {
    runtime: RecoveryRuntime;
    activated: boolean;
    reason: string | null;
}

/**
 * Called once per settled primary contract. A second settlement for the same
 * contract id is ignored, so one loss can never open two recovery evaluations.
 */
export function activateRecovery(
    runtime: RecoveryRuntime,
    contractId: string,
    config: EngineConfig
): RecoveryActivation {
    if (!contractId) {
        return { runtime, activated: false, reason: 'A recovery activation needs a settled contract id.' };
    }
    if (runtime.activatedContracts.includes(contractId)) {
        return { runtime, activated: false, reason: 'Recovery evaluation already opened for this contract.' };
    }
    if (runtime.attempts >= config.maxRecoveryTrades) {
        return {
            runtime: {
                ...runtime,
                state: 'RECOVERY_LIMIT_REACHED',
                active: false,
                lastReason: `Maximum recovery trades reached (${config.maxRecoveryTrades}).`,
            },
            activated: false,
            reason: `Maximum recovery trades reached (${config.maxRecoveryTrades}).`,
        };
    }

    return {
        activated: true,
        reason: null,
        runtime: {
            ...runtime,
            active: true,
            state: 'PRIMARY_LOSS_DETECTED',
            contractId,
            activatedContracts: [...runtime.activatedContracts, contractId],
            previousDigit: null,
            lastTwo: [null, null],
            pattern: null,
            direction: null,
            lastReason: null,
        },
    };
}

export interface RecoveryFrequency {
    enabled: boolean;
    eligible: boolean;
    reason: string | null;
    evenPercent: number;
    oddPercent: number;
    maxEvenPercent: number;
    maxOddPercent: number;
    total: number;
}

/**
 * Eligibility for a specific direction. `ODD` loses on even digits and `EVEN`
 * loses on odd digits, so the losing side must not be overheating.
 */
export function recoveryFrequency(
    direction: ParityDirection,
    parity: ParityStats,
    config: EngineConfig,
    requiredSample = ENGINE_WINDOW
): RecoveryFrequency {
    const base = {
        enabled: config.recoveryFilterEnabled,
        evenPercent: parity.evenPercent,
        oddPercent: parity.oddPercent,
        maxEvenPercent: config.maxEvenPercent,
        maxOddPercent: config.maxOddPercent,
        total: parity.total,
    };

    if (!config.recoveryFilterEnabled) {
        return { ...base, eligible: true, reason: null };
    }

    if (parity.total < requiredSample) {
        return {
            ...base,
            eligible: false,
            reason: `Waiting for ${requiredSample} ticks in the window (${parity.total} observed).`,
        };
    }

    const losingPercent = direction === 'ODD' ? parity.evenPercent : parity.oddPercent;
    const ceiling = direction === 'ODD' ? config.maxEvenPercent : config.maxOddPercent;

    if (losingPercent > ceiling) {
        return {
            ...base,
            eligible: false,
            reason: `${direction} contract needs the ${direction === 'ODD' ? 'even' : 'odd'} share at or below ${ceiling}% (currently ${losingPercent.toFixed(2)}%).`,
        };
    }

    return { ...base, eligible: true, reason: null };
}

export interface RecoveryTickInput {
    digit: number;
    parity: ParityStats;
    config: EngineConfig;
    /** The window must hold this many observations before an entry may pass. */
    requiredSample?: number;
}

export interface RecoveryTickResult {
    runtime: RecoveryRuntime;
    signal: RecoverySignal | null;
}

/**
 * Feeds one genuine tick to the recovery controller. Emits a signal only when a
 * full parity pattern is present; eligibility travels with it so the UI can
 * explain a block without a second evaluation.
 */
export function evaluateRecoveryTick(runtime: RecoveryRuntime, input: RecoveryTickInput): RecoveryTickResult {
    if (!runtime.active || runtime.state === 'RECOVERY_LIMIT_REACHED') {
        return { runtime, signal: null };
    }

    const previous = runtime.previousDigit;
    const lastTwo: [number | null, number | null] = [
        previous === null ? null : previous,
        PARITY_PATTERN_LENGTH === 2 ? input.digit : input.digit,
    ];

    // Pattern detection needs two consecutive ticks observed while recovery is active.
    if (previous === null) {
        return {
            runtime: {
                ...runtime,
                previousDigit: input.digit,
                lastTwo: [null, input.digit],
                state: 'WAITING_FOR_EVEN_ODD_PATTERN',
            },
            signal: null,
        };
    }

    if (runtime.state === 'RECOVERY_PURCHASE_PENDING' || runtime.state === 'RECOVERY_CONTRACT_OPEN') {
        return { runtime: { ...runtime, previousDigit: input.digit, lastTwo }, signal: null };
    }

    const bothEven = previous % 2 === 0 && input.digit % 2 === 0;
    const bothOdd = previous % 2 === 1 && input.digit % 2 === 1;

    if (!bothEven && !bothOdd) {
        return {
            runtime: {
                ...runtime,
                previousDigit: input.digit,
                lastTwo,
                pattern: null,
                direction: null,
                state: 'WAITING_FOR_EVEN_ODD_PATTERN',
            },
            signal: null,
        };
    }

    const pattern: RecoveryPattern = bothEven ? 'even_even' : 'odd_odd';
    const direction: ParityDirection = bothEven ? 'ODD' : 'EVEN';
    const frequency = recoveryFrequency(direction, input.parity, input.config, input.requiredSample);

    return {
        runtime: {
            ...runtime,
            previousDigit: input.digit,
            lastTwo,
            pattern,
            direction,
            state: frequency.eligible ? 'RECOVERY_TRADE_ELIGIBLE' : 'RECOVERY_FILTER_CHECK',
            lastReason: frequency.reason,
        },
        signal: {
            pattern,
            direction,
            digits: [previous, input.digit],
            frequency,
        },
    };
}

export function markRecoveryPurchasePending(runtime: RecoveryRuntime): RecoveryRuntime {
    return { ...runtime, state: 'RECOVERY_PURCHASE_PENDING', previousDigit: null };
}

export function markRecoveryContractOpen(runtime: RecoveryRuntime): RecoveryRuntime {
    return { ...runtime, state: 'RECOVERY_CONTRACT_OPEN' };
}

export interface RecoverySettlement {
    runtime: RecoveryRuntime;
    limitReached: boolean;
}

/**
 * Applies the settled recovery result. A win closes the recovery episode; a
 * loss consumes one attempt and keeps monitoring only while another attempt is
 * allowed — recovery can never loop forever.
 */
export function settleRecovery(
    runtime: RecoveryRuntime,
    outcome: 'won' | 'lost',
    config: EngineConfig
): RecoverySettlement {
    if (outcome === 'won') {
        return {
            limitReached: false,
            runtime: {
                ...runtime,
                state: 'RECOVERY_WON',
                active: false,
                contractId: null,
                attempts: 0,
                consecutiveLosses: 0,
                previousDigit: null,
                lastTwo: [null, null],
                pattern: null,
                direction: null,
                lastReason: null,
            },
        };
    }

    const attempts = runtime.attempts + 1;
    const consecutiveLosses = runtime.consecutiveLosses + 1;
    const exhausted = attempts >= config.maxRecoveryTrades;

    return {
        limitReached: exhausted,
        runtime: {
            ...runtime,
            state: exhausted ? 'RECOVERY_LIMIT_REACHED' : 'RECOVERY_LOST',
            active: !exhausted,
            contractId: exhausted ? null : runtime.contractId,
            attempts,
            consecutiveLosses,
            previousDigit: null,
            lastTwo: [null, null],
            pattern: null,
            direction: null,
            lastReason: exhausted
                ? `Recovery attempts exhausted (${attempts}/${config.maxRecoveryTrades}).`
                : `Recovery lost (${attempts}/${config.maxRecoveryTrades}); monitoring for the next parity pattern.`,
        },
    };
}

/**
 * A recovery attempt that never reached a purchase (risk block, duplicate entry,
 * disconnect). It has to go back to pattern monitoring: leaving the controller in
 * RECOVERY_PURCHASE_PENDING made `evaluateRecoveryTick` ignore every later tick, so
 * the Even/Odd leg stopped working for the rest of the session.
 */
export function abortRecoveryAttempt(runtime: RecoveryRuntime, reason: string): RecoveryRuntime {
    return {
        ...runtime,
        state: 'WAITING_FOR_EVEN_ODD_PATTERN',
        previousDigit: null,
        lastTwo: [null, null],
        pattern: null,
        direction: null,
        lastReason: reason,
    };
}

export function stopRecoveryRuntime(runtime: RecoveryRuntime): RecoveryRuntime {
    return {
        ...runtime,
        active: false,
        state: 'ENGINE_STOPPED',
        previousDigit: null,
        lastTwo: [null, null],
    };
}
