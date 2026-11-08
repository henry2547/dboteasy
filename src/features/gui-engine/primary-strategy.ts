/**
 * Over 1 / Under 8 primary strategy controllers.
 *
 * A pure state machine over consecutive genuine tick digits:
 *
 *   1. Permission filter — digits 0 & 1 (Over 1) or 8 & 9 (Under 8) must EACH
 *      sit at or below 10.2% of the rolling 1,000-tick window. The two shares
 *      are checked separately; they are never averaged.
 *   2. Two-consecutive-digit pair detection (00/01/10/11 or 88/89/98/99).
 *   3. Delayed confirmation — once a pair is pending, any number of digits from
 *      outside the confirmation group may arrive; only a confirmation digit of
 *      the same group confirms, and the setup expires after the configured
 *      number of subsequent ticks.
 *
 * The controller never buys anything and never talks to Deriv: it returns
 * events, and the engine hook decides what to do with them.
 */

import { ENGINE_WINDOW, PRIMARY_DIGIT_CEILING, PRIMARY_STRATEGIES } from './config';
import type {
    DigitWindowStats,
    EngineConfig,
    FrequencyPermission,
    FrequencyReading,
    PendingSetup,
    PrimaryEvent,
    PrimaryRuntime,
    PrimaryState,
    PrimaryStrategyId,
} from './types';

export interface PrimaryTickInput {
    digit: number;
    epoch: number;
    now: number;
    stats: DigitWindowStats;
    config: EngineConfig;
    market: string;
    marketName: string;
    /** The window must hold this many observations before an entry may pass. */
    requiredSample?: number;
}

export function createPrimaryRuntime(strategy: PrimaryStrategyId): PrimaryRuntime {
    return {
        strategy,
        state: 'INITIALIZING',
        pending: null,
        previousDigit: null,
        lastPair: null,
        lastEvent: null,
        setupsCreated: 0,
    };
}

/**
 * Individual-digit permission filter. Both readings must pass on their own
 * before a pair may create a setup.
 */
export function frequencyPermission(
    strategy: PrimaryStrategyId,
    stats: DigitWindowStats,
    threshold = PRIMARY_DIGIT_CEILING,
    requiredSample = ENGINE_WINDOW
): FrequencyPermission {
    const digits = PRIMARY_STRATEGIES[strategy].filterDigits;
    const readings: FrequencyReading[] = digits.map(digit => ({
        digit,
        percent: stats.percent[digit] ?? 0,
        threshold,
        passed: (stats.percent[digit] ?? 0) <= threshold,
    }));

    if (stats.total < requiredSample) {
        return {
            passed: false,
            reason: `Waiting for ${requiredSample} ticks in the window (${stats.total} observed).`,
            readings,
            windowSize: requiredSample,
            observed: stats.total,
        };
    }

    const failed = readings.filter(reading => !reading.passed);
    if (failed.length > 0) {
        const detail = failed.map(reading => `digit ${reading.digit} at ${reading.percent.toFixed(2)}%`).join(' and ');
        return {
            passed: false,
            reason: `${detail} — above the ${threshold}% ceiling.`,
            readings,
            windowSize: requiredSample,
            observed: stats.total,
        };
    }

    return {
        passed: true,
        reason: null,
        readings,
        windowSize: requiredSample,
        observed: stats.total,
    };
}

function createSetupId(strategy: PrimaryStrategyId, epoch: number, pair: string, created: number): string {
    return `${strategy}-${epoch}-${pair}-${created + 1}`;
}

export function evaluatePrimaryTick(
    runtime: PrimaryRuntime,
    input: PrimaryTickInput
): { runtime: PrimaryRuntime; events: PrimaryEvent[] } {
    const definition = PRIMARY_STRATEGIES[runtime.strategy];
    const permission = frequencyPermission(
        runtime.strategy,
        input.stats,
        PRIMARY_DIGIT_CEILING,
        input.requiredSample ?? ENGINE_WINDOW
    );

    const events: PrimaryEvent[] = [];
    let pending = runtime.pending;
    let state: PrimaryState = runtime.state;
    let lastPair = runtime.lastPair;
    let setupsCreated = runtime.setupsCreated;

    // --- 1. An open setup is always evaluated first -------------------------
    if (pending) {
        if (!permission.passed) {
            const blocked: PendingSetup = {
                ...pending,
                status: 'blocked',
                blockReason: permission.reason ?? 'Frequency filter failed.',
            };
            events.push({
                type: 'blocked',
                setup: blocked,
                reason: blocked.blockReason as string,
                stage: 'pre_confirmation',
            });
            pending = null;
            state = 'SETUP_BLOCKED';
        } else if (definition.targetDigits.includes(input.digit)) {
            const confirmed: PendingSetup = { ...pending, status: 'confirmed' };
            events.push({
                type: 'confirmation',
                setup: confirmed,
                digit: input.digit,
                ticksWaited: pending.ticksWaited,
            });
            pending = null;
            state = 'CONFIRMATION_RECEIVED';
        } else {
            const ticksWaited = pending.ticksWaited + 1;
            const next: PendingSetup = {
                ...pending,
                interveningDigits: [...pending.interveningDigits, input.digit],
                ticksWaited,
            };

            if (ticksWaited >= input.config.maxTicksToConfirm) {
                const expired: PendingSetup = { ...next, status: 'expired' };
                events.push({ type: 'expired', setup: expired });
                pending = null;
                state = 'SETUP_EXPIRED';
            } else {
                pending = next;
                state = 'WAITING_FOR_CONFIRMATION';
            }
        }
    } else if (!permission.passed) {
        // --- 2. No setup: the permission filter gates every new pair ---------
        state = 'FREQUENCY_FILTER_BLOCKED';
    } else if (runtime.previousDigit !== null) {
        const pair = `${runtime.previousDigit}${input.digit}`;

        if (definition.validPairs.includes(pair)) {
            const setup: PendingSetup = {
                id: createSetupId(runtime.strategy, input.epoch, pair, setupsCreated),
                strategy: runtime.strategy,
                market: input.market,
                marketName: input.marketName,
                pair,
                pairDigits: [runtime.previousDigit, input.digit],
                detectedAt: input.now,
                detectedSequence: [runtime.previousDigit, input.digit],
                confirmationDeadline: input.config.maxTicksToConfirm,
                interveningDigits: [],
                ticksWaited: 0,
                status: 'pending',
                frequencyAtDetection: permission,
            };
            pending = setup;
            setupsCreated += 1;
            lastPair = { pair, at: input.now, sequence: setup.detectedSequence };
            events.push({ type: 'pair', setup });
            state = 'PAIR_DETECTED';
        } else {
            state = 'WAITING_FOR_PAIR';
        }
    } else {
        // The very first tick while running can never form a pair with history
        // that was collected before the engine started.
        state = 'WAITING_FOR_PAIR';
    }

    const lastEvent = events.length > 0 ? events[events.length - 1] : runtime.lastEvent;

    return {
        runtime: {
            ...runtime,
            state,
            pending,
            previousDigit: input.digit,
            lastPair,
            lastEvent,
            setupsCreated,
        },
        events,
    };
}

/** A confirmation that fails the pre-purchase revalidation is consumed, not reused. */
export function rejectConfirmedSetup(runtime: PrimaryRuntime, reason: string): PrimaryRuntime {
    const setup = runtime.pending;
    if (!setup) return runtime;

    return {
        ...runtime,
        state: 'SETUP_BLOCKED',
        pending: null,
        lastEvent: {
            type: 'blocked',
            setup: { ...setup, status: 'blocked', blockReason: reason },
            reason,
            stage: 'post_confirmation',
        },
    };
}

export function setPrimaryState(runtime: PrimaryRuntime, state: PrimaryState): PrimaryRuntime {
    return { ...runtime, state };
}

/** Stopping invalidates any unexecuted setup; the engine keeps the records. */
export function stopPrimaryRuntime(runtime: PrimaryRuntime): PrimaryRuntime {
    return {
        ...runtime,
        state: 'ENGINE_STOPPED',
        pending: null,
        previousDigit: null,
    };
}

export function resumePrimaryRuntime(runtime: PrimaryRuntime): PrimaryRuntime {
    return { ...runtime, state: 'MONITORING_FREQUENCY', previousDigit: null };
}
