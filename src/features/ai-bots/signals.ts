/**
 * The two AI bot rules, as pure functions over scanned ticks.
 *
 * - Even-Odd AI: the hot digit (most frequent) and the cold digit (least
 *   frequent) must share a parity. While they do, the market trades that parity
 *   as soon as the last five digits lean to it (three or more of the five).
 * - Rise-Fall AI: the last five quotes strictly rising → Fall, strictly falling →
 *   Rise. A flat tick breaks the run.
 *
 * The Even-Odd parity is read from the whole scanned sample, but the entry is
 * confirmed on the last five digits only, so the trade follows what the market
 * is doing right now instead of a stale long-run average.
 *
 * Every reading is of ticks already seen; nothing predicts the next one.
 */

import { calculateStatisticsFromDigits } from '@/features/digits/statistics';
import type { ScanRow, TradeSide } from './types';

/** Below this many ticks a market reading is not a setup yet. */
export const MIN_SIGNAL_SAMPLE = 30;
/** Digits of the entry confirmation window (the newest five). */
export const EVEN_ODD_WINDOW = 5;
/** How many of those digits must share the parity for the entry to count. */
export const EVEN_ODD_CONFIRMATION = 3;
/** Ticks of the Rise-Fall run — a fixed five, never a setting. */
export const RISE_FALL_RUN = 5;
/** Every contract the bots buy lasts one tick. */
export const CONTRACT_TICKS = 1;

export type Parity = 'even' | 'odd';
export type RunDirection = 'rising' | 'falling';

export const parityOf = (digit: number): Parity => (digit % 2 === 0 ? 'even' : 'odd');

const sideForParity = (parity: Parity): TradeSide => (parity === 'even' ? 'Even' : 'Odd');

export interface HotColdReading {
    hotDigit: number | null;
    coldDigit: number | null;
    /** Parity shared by the hot and cold digit, `null` when they disagree. */
    parity: Parity | null;
    lastDigit: number | null;
    /** Which of the two digits the newest tick landed on. */
    matched: 'hot' | 'cold' | null;
    /** The newest digits the entry confirmation reads, oldest first. */
    window: number[];
    /** How many of `window` carry `parity`. */
    aligned: number;
    /** True when the last five digits lean to the shared parity. */
    confirmed: boolean;
    signal: TradeSide | null;
}

const EMPTY_READING: HotColdReading = {
    hotDigit: null,
    coldDigit: null,
    parity: null,
    lastDigit: null,
    matched: null,
    window: [],
    aligned: 0,
    confirmed: false,
    signal: null,
};

export function readHotCold(digits: number[], windowSize: number = EVEN_ODD_WINDOW): HotColdReading {
    if (digits.length < MIN_SIGNAL_SAMPLE) return { ...EMPTY_READING };

    const size = Math.max(1, Math.floor(windowSize));
    const statistics = calculateStatisticsFromDigits(digits);
    const hotDigit = statistics.mostFrequentDigits[0] ?? null;
    const coldDigit = statistics.leastFrequentDigits[0] ?? null;
    const lastDigit = digits[digits.length - 1] ?? null;
    const window = digits.slice(-size);

    const parity =
        hotDigit !== null && coldDigit !== null && parityOf(hotDigit) === parityOf(coldDigit)
            ? parityOf(hotDigit)
            : null;

    const aligned = parity === null ? 0 : window.filter(digit => parityOf(digit) === parity).length;
    const confirmed =
        parity !== null &&
        window.length === size &&
        aligned >= Math.min(size, Math.ceil(size / 2)) &&
        aligned >= EVEN_ODD_CONFIRMATION;

    const matched =
        parity === null || lastDigit === null
            ? null
            : lastDigit === hotDigit
              ? 'hot'
              : lastDigit === coldDigit
                ? 'cold'
                : null;

    return {
        hotDigit,
        coldDigit,
        parity,
        lastDigit,
        matched,
        window,
        aligned,
        confirmed,
        signal: confirmed ? sideForParity(parity as Parity) : null,
    };
}

/** Whether the market still holds the condition the Even-Odd bot entered on. */
export const isEvenOddConditionValid = (reading: HotColdReading): boolean =>
    reading.hotDigit !== null && reading.coldDigit !== null && reading.parity !== null;

export interface RunReading {
    direction: RunDirection | null;
    signal: TradeSide | null;
    /** Consecutive ticks moving the same way at the end of the sample. */
    run: number;
    runLength: number;
}

const directionBetween = (previous: number, next: number): RunDirection | null =>
    next > previous ? 'rising' : next < previous ? 'falling' : null;

export function readRun(prices: number[], runLength: number = RISE_FALL_RUN): RunReading {
    const length = Math.max(2, Math.floor(runLength));
    const reading: RunReading = { direction: null, signal: null, run: 0, runLength: length };
    if (prices.length < length) return reading;

    const recent = prices.slice(-length);
    const rising = recent.every((price, index) => index === 0 || price > recent[index - 1]);
    const falling = recent.every((price, index) => index === 0 || price < recent[index - 1]);
    const direction: RunDirection | null = rising ? 'rising' : falling ? 'falling' : null;

    // How long the tail has actually moved one way, so a scanning row can say how far it got.
    const tail = directionBetween(prices[prices.length - 2], prices[prices.length - 1]);
    let run = tail ? 1 : 0;
    for (let index = prices.length - 2; tail && index > 0; index -= 1) {
        if (directionBetween(prices[index - 1], prices[index]) !== tail) break;
        run += 1;
    }

    return {
        direction,
        signal: direction === 'rising' ? 'Fall' : direction === 'falling' ? 'Rise' : null,
        run: Math.min(run, length),
        runLength: length,
    };
}

export interface MarketInsight {
    row: ScanRow;
    signal: TradeSide | null;
    /** Right-hand status line of the row. */
    status: string;
    /** Small line under the market name: the reading behind the status. */
    detail: string;
}

function evenOddInsight(row: ScanRow): MarketInsight {
    const reading = readHotCold(row.digits);
    const { hotDigit, coldDigit, parity, lastDigit, matched, aligned, window, signal } = reading;

    if (row.status !== 'scanned') {
        return { row, signal: null, status: row.reason ?? 'Market skipped', detail: row.symbol };
    }
    if (hotDigit === null || coldDigit === null) {
        return {
            row,
            signal: null,
            status: `Scanning / Initial · ${row.digits.length} ticks`,
            detail: row.symbol,
        };
    }

    const detail = `cold ${coldDigit} · hot ${hotDigit}`;
    if (parity === null) {
        return {
            row,
            signal: null,
            status: `Conditions invalid / Hot and cold split parity (${hotDigit} vs ${coldDigit})`,
            detail,
        };
    }

    if (signal) {
        return {
            row,
            signal,
            status: `Trade ${signal} / Last ${window.length} digits ${aligned}/${window.length} ${parity}${
                lastDigit !== null && matched ? ` · last ${lastDigit} ${matched}` : ''
            }`,
            detail,
        };
    }

    return {
        row,
        signal: null,
        status: `Scanning / Last ${window.length} digits ${aligned}/${window.length} ${parity}`,
        detail,
    };
}

function riseFallInsight(row: ScanRow, runLength: number): MarketInsight {
    const reading = readRun(row.prices, runLength);

    if (row.status !== 'scanned') {
        return { row, signal: null, status: row.reason ?? 'Market skipped', detail: row.symbol };
    }
    if (row.prices.length < reading.runLength) {
        return {
            row,
            signal: null,
            status: `Scanning / Initial · ${row.prices.length}/${reading.runLength} ticks`,
            detail: row.symbol,
        };
    }

    if (reading.signal) {
        return {
            row,
            signal: reading.signal,
            status: `Trade ${reading.signal} / Last ${reading.runLength} ticks ${reading.direction}`,
            detail: `${reading.run}/${reading.runLength} ${reading.direction}`,
        };
    }

    return {
        row,
        signal: null,
        status: `Scanning / ${reading.run}/${reading.runLength} ticks moving one way`,
        detail: `${reading.run}/${reading.runLength} checked`,
    };
}

/** One insight per scanned market, in the order the rows arrive. */
export function buildInsights(
    botId: 'even_odd' | 'rise_fall',
    rows: ScanRow[],
    settings: { marketScope: string }
): MarketInsight[] {
    const scoped = settings.marketScope === 'all' ? rows : rows.filter(row => row.symbol === settings.marketScope);
    return scoped.map(row => (botId === 'even_odd' ? evenOddInsight(row) : riseFallInsight(row, RISE_FALL_RUN)));
}

export const countSignals = (insights: MarketInsight[]): number =>
    insights.filter(insight => insight.signal !== null).length;
