/**
 * Engine C — Dynamic Latency & Execution Safety Guard.
 *
 * Two live measurements feed one binary circuit breaker:
 *   • currentPingMs  — the WebSocket round-trip (ping → pong), maintained by the
 *                      public client in `deriv-public-ws.ts`.
 *   • tick lifespan  — the average Δt between consecutive market frames.
 *
 * Threshold reasoning: a round-trip that eats more than 40% of the time between
 * two ticks means the decision → order path can span a whole tick boundary.
 * Any signal derived from the last tick would already be stale by the time the
 * broker saw the order, so the guard trips to `isExecutionSafe: false`. Below
 * 40% there is head-room to act inside the current interval.
 *
 * Conservative default: when either measurement is missing (no ping yet, or too
 * few ticks to time the feed) the guard reports unsafe. A safety breaker should
 * fail closed — it cannot certify a low-latency path it has not measured.
 *
 * Note: this engine only *reports* the flag. The Digits lab is read-only and
 * owns no execution button, so the flag is surfaced as a warning, not wired to
 * a trade submission.
 */

import type { LatencyGuardReading } from './types';

/** A round-trip may consume at most this share of one tick interval. */
export const PING_BUDGET_SHARE = 0.4;

/** Consecutive frames needed before the feed's pacing is trusted. */
export const MIN_LIFESPAN_SAMPLES = 5;

/** Frames used for the rolling average (keeps the read responsive to a slowing feed). */
export const LIFESPAN_SAMPLE_SIZE = 60;

/**
 * Average Δt (in ms) between consecutive tick frames. Epochs arrive in seconds,
 * so the mean delta is scaled by 1000.
 */
export function averageTickLifespan(epochs: number[], sampleSize = LIFESPAN_SAMPLE_SIZE): number | null {
    const recent = epochs.slice(-(sampleSize + 1));
    if (recent.length < MIN_LIFESPAN_SAMPLES + 1) return null;

    const deltas: number[] = [];
    for (let index = 1; index < recent.length; index++) {
        const delta = Number(recent[index]) - Number(recent[index - 1]);
        if (Number.isFinite(delta) && delta > 0) deltas.push(delta);
    }

    if (deltas.length < MIN_LIFESPAN_SAMPLES) return null;

    const meanSeconds = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
    return meanSeconds * 1000;
}

export function computeLatencyGuard(params: { pingMs: number | null; epochs: number[] }): LatencyGuardReading {
    const averageTickLifespanMs = averageTickLifespan(params.epochs);
    const currentPingMs = params.pingMs;

    if (currentPingMs === null || averageTickLifespanMs === null || averageTickLifespanMs <= 0) {
        return {
            currentPingMs,
            averageTickLifespanMs,
            pingShare: null,
            isExecutionSafe: false,
            reason:
                currentPingMs === null
                    ? 'Waiting for the first ping measurement before the latency guard can certify the feed.'
                    : 'Waiting for enough ticks to time the feed before the latency guard can certify it.',
        };
    }

    const pingShare = currentPingMs / averageTickLifespanMs;
    const isExecutionSafe = pingShare <= PING_BUDGET_SHARE;

    return {
        currentPingMs,
        averageTickLifespanMs,
        pingShare,
        isExecutionSafe,
        reason: isExecutionSafe
            ? `Round-trip uses ${(pingShare * 100).toFixed(0)}% of the average tick interval — inside the ${(PING_BUDGET_SHARE * 100).toFixed(0)}% budget.`
            : `Round-trip uses ${(pingShare * 100).toFixed(0)}% of the average tick interval — over the ${(PING_BUDGET_SHARE * 100).toFixed(0)}% budget.`,
    };
}
