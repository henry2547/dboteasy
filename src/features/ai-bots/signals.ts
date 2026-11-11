/**
 * The two AI bot rules, as pure functions over scanned ticks.
 *
 * - Even-Odd AI: the hot digit (most frequent) and the cold digit (least
 *   frequent) must share a parity. While they do, the market trades that parity
 *   as soon as the newest digit equals either the hot or the cold digit.
 * - Rise-Fall AI: the last N quotes strictly rising → Fall, strictly falling →
 *   Rise. A flat tick breaks the run.
 *
 * Every reading is of ticks already seen; nothing predicts the next one.
 */

import { calculateStatisticsFromDigits } from '@/features/digits/statistics';
import type { ScanRow, TradeSide } from './types';

/** Below this many ticks a market reading is not a setup yet. */
export const MIN_SIGNAL_SAMPLE = 30;

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
    signal: TradeSide | null;
}

export function readHotCold(digits: number[]): HotColdReading {
    if (digits.length < MIN_SIGNAL_SAMPLE) {
        return { hotDigit: null, coldDigit: null, parity: null, lastDigit: null, matched: null, signal: null };
    }

    const statistics = calculateStatisticsFromDigits(digits);
    const hotDigit = statistics.mostFrequentDigits[0] ?? null;
    const coldDigit = statistics.leastFrequentDigits[0] ?? null;
    const lastDigit = digits[digits.length - 1] ?? null;

    const parity =
        hotDigit !== null && coldDigit !== null && parityOf(hotDigit) === parityOf(coldDigit)
            ? parityOf(hotDigit)
            : null;

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
        signal: parity !== null && matched !== null ? sideForParity(parity) : null,
    };
}

export interface RunReading {
    direction: RunDirection | null;
    signal: TradeSide | null;
    /** Consecutive ticks moving the same way at the end of the sample. */
    run: number;
    runLength: number;
}

const directionBetween = (previous: number, next: number): RunDirection | null =>
    next > previous ? 'rising' : next < previous ? 'falling' : null;

export function readRun(prices: number[], runLength: number): RunReading {
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
    const { hotDigit, coldDigit, parity, lastDigit, matched, signal } = reading;

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
            status: `Scanning / Hot and cold split parity (${hotDigit} vs ${coldDigit})`,
            detail,
        };
    }

    if (signal && lastDigit !== null) {
        return {
            row,
            signal,
            status: `Trade ${signal} / Last digit ${lastDigit} is the ${matched} digit`,
            detail,
        };
    }

    return {
        row,
        signal: null,
        status: `Scanning / Waiting for ${hotDigit} or ${coldDigit}`,
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
    settings: { ticks: number; marketScope: string }
): MarketInsight[] {
    const scoped = settings.marketScope === 'all' ? rows : rows.filter(row => row.symbol === settings.marketScope);
    return scoped.map(row => (botId === 'even_odd' ? evenOddInsight(row) : riseFallInsight(row, settings.ticks)));
}

export const countSignals = (insights: MarketInsight[]): number =>
    insights.filter(insight => insight.signal !== null).length;
