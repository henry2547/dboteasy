/**
 * Rolling 1,000-tick digit window — pure functions, no React, no network.
 *
 * The hook keeps the tick array in React state and calls these helpers; the
 * strategy controllers receive the derived statistics.
 */

import { ENGINE_WINDOW } from './config';
import type { DigitWindowStats, EngineTick, ParityStats } from './types';

/**
 * Appends one genuine tick, keeping chronological order and never storing the
 * same observation twice. Returns the same array identity when nothing should
 * change so a replayed tick cannot cause a state update.
 */
export function pushTick(ticks: EngineTick[], tick: EngineTick, max = ENGINE_WINDOW): EngineTick[] {
    if (ticks.some(existing => existing.key === tick.key)) return ticks;
    const next = [...ticks, tick];
    return next.length > max ? next.slice(next.length - max) : next;
}

/** Replaces the whole window (history load / reconnect rebuild). */
export function replaceWindow(ticks: EngineTick[], fresh: EngineTick[], max = ENGINE_WINDOW): EngineTick[] {
    const byKey = new Map<string, EngineTick>();
    fresh.forEach(tick => byKey.set(tick.key, tick));
    const ordered = Array.from(byKey.values()).sort((a, b) => a.epoch - b.epoch);
    return ordered.length > max ? ordered.slice(ordered.length - max) : ordered;
}

export function computeDigitStats(ticks: EngineTick[]): DigitWindowStats {
    const counts = Array.from({ length: 10 }, () => 0);
    ticks.forEach(tick => {
        if (Number.isInteger(tick.lastDigit) && tick.lastDigit >= 0 && tick.lastDigit <= 9) {
            counts[tick.lastDigit] += 1;
        }
    });

    const total = ticks.length;
    const percent = counts.map(count => (total === 0 ? 0 : (count / total) * 100));

    return { counts, percent, total };
}

export function computeParityStats(ticks: EngineTick[]): ParityStats {
    let even = 0;
    let odd = 0;

    ticks.forEach(tick => {
        if (!Number.isInteger(tick.lastDigit)) return;
        if (tick.lastDigit % 2 === 0) even += 1;
        else odd += 1;
    });

    const total = even + odd;
    const evenPercent = total === 0 ? 0 : (even / total) * 100;
    const oddPercent = total === 0 ? 0 : (odd / total) * 100;

    return {
        even,
        odd,
        evenPercent,
        oddPercent,
        evenDelta: evenPercent - 50,
        oddDelta: oddPercent - 50,
        total,
        baseline: 50,
    };
}

/** True when the window holds the full 1,000 genuine observations the rules assume. */
export function isWindowComplete(ticks: EngineTick[], required = ENGINE_WINDOW): boolean {
    return ticks.length >= required;
}

export function digitsOf(ticks: EngineTick[]): number[] {
    return ticks.map(tick => tick.lastDigit);
}
