/**
 * Turns the digit statistics and adaptive signals into a plain-language read of
 * the current market, plus the entry guidance for the Over/Under playbook.
 *
 * Everything here is derived from the live feed through the behaviour and
 * strategy-learning calculations — it describes what the market is doing, it
 * never predicts or places a trade.
 */

import type { AdaptiveSignal, DigitFrequency, DigitStatistics } from './types';

export type ConditionTone = 'favourable' | 'neutral' | 'caution';

export interface ConditionItem {
    label: string;
    value: string;
    detail: string;
    tone: ConditionTone;
}

export interface MarketCondition {
    headline: string;
    summary: string;
    tone: ConditionTone;
    score: number;
    items: ConditionItem[];
    entryGuidance: string[];
}

const EXPECTED = 10;
/** How far a digit may stray from 10% before it stops counting as "stable". */
const STABLE_TOLERANCE = 4;

function group(frequencies: DigitFrequency[], digits: number[]) {
    const set = frequencies.filter(item => digits.includes(item.digit));
    const maxPercentage = set.length ? Math.max(...set.map(item => item.percentage)) : 0;
    const maxDeviation = set.length ? Math.max(...set.map(item => item.absoluteDeviation)) : 0;
    return { maxPercentage, maxDeviation, set };
}

function toneFor(maxPercentage: number, maxDeviation: number): ConditionTone {
    if (maxPercentage <= EXPECTED && maxDeviation <= STABLE_TOLERANCE) return 'favourable';
    if (maxPercentage <= EXPECTED + 4) return 'neutral';
    return 'caution';
}

export function buildMarketConditions(
    statistics: DigitStatistics,
    signals: AdaptiveSignal[]
): MarketCondition {
    const { frequencies, sampleSize } = statistics;

    if (sampleSize === 0) {
        return {
            headline: 'Reading the market…',
            summary: 'Waiting for ticks to describe the current conditions.',
            tone: 'neutral',
            score: 0,
            items: [],
            entryGuidance: ['Tick data is still loading — give it a moment.'],
        };
    }

    const over2 = group(frequencies, [0, 1, 2]);
    const over1 = group(frequencies, [0, 1]);
    const high = group(frequencies, [7, 8, 9]);

    const over2Tone = toneFor(over2.maxPercentage, over2.maxDeviation);
    const over1Tone = toneFor(over1.maxPercentage, over1.maxDeviation);
    const evenOddGap = Math.abs(statistics.evenPercentage - statistics.oddPercentage);
    const balanceTone: ConditionTone = evenOddGap <= 4 ? 'favourable' : evenOddGap <= 10 ? 'neutral' : 'caution';

    const bestSignal = [...signals].sort((a, b) => b.confidence - a.confidence)[0];

    const items: ConditionItem[] = [
        {
            label: 'Over 2 control',
            value: `0–2 max ${over2.maxPercentage.toFixed(1)}%`,
            detail:
                over2Tone === 'favourable'
                    ? 'Digits 0, 1 and 2 sit at 10% or below and hold steady — the barrier floor is stable.'
                    : over2Tone === 'neutral'
                      ? 'Digits 0–2 are hovering around the 10% line — watch for drift.'
                      : 'A low digit is running hot — the floor is unstable right now.',
            tone: over2Tone,
        },
        {
            label: 'Over 1 control',
            value: `0–1 max ${over1.maxPercentage.toFixed(1)}%`,
            detail:
                over1Tone === 'favourable'
                    ? 'Digits 0 and 1 stay at 10% or below and barely move — a clean Over 1 floor.'
                    : 'The lowest digits are above 10% or shifting — Over 1 is less predictable.',
            tone: over1Tone,
        },
        {
            label: 'Even / Odd balance',
            value: `${statistics.evenPercentage.toFixed(1)}% / ${statistics.oddPercentage.toFixed(1)}%`,
            detail: `Even and Odd are ${evenOddGap.toFixed(1)} pts apart.`,
            tone: balanceTone,
        },
        {
            label: 'High digits (7–9)',
            value: `max ${high.maxPercentage.toFixed(1)}%`,
            detail: 'Digits above the barrier decide most Over payouts.',
            tone: high.maxPercentage >= EXPECTED ? 'favourable' : 'neutral',
        },
        {
            label: 'Strongest rule now',
            value: bestSignal ? `${bestSignal.label} · ${Math.round(bestSignal.confidence)}%` : '—',
            detail: bestSignal ? bestSignal.reason : 'Not enough data yet.',
            tone: bestSignal?.recommendation === 'enter' ? 'favourable' : 'caution',
        },
    ];

    // Entry guidance, following the Over 2 / Over 1 playbook.
    const behindBarrier = frequencies
        .filter(item => item.digit < 2)
        .sort((a, b) => b.percentage - a.percentage);
    const behindTop = behindBarrier[0];
    const entryGuidance: string[] = [];

    if (behindTop) {
        entryGuidance.push(
            `Over 2: enter the highest-share digit behind the barrier — digit ${behindTop.digit} (${behindTop.percentage.toFixed(1)}%).`
        );
    }

    const five = frequencies.find(item => item.digit === 5);
    const six = frequencies.find(item => item.digit === 6);
    entryGuidance.push(
        `Over 1: prefer 5 or 6 where the floor is clean — 5 at ${five?.percentage.toFixed(1) ?? '—'}%, 6 at ${six?.percentage.toFixed(1) ?? '—'}%.`
    );

    const hottest = [...frequencies].sort((a, b) => b.percentage - a.percentage)[0];
    const coldest = [...frequencies].sort((a, b) => a.percentage - b.percentage)[0];
    entryGuidance.push(
        `Avoid entering on a stretched digit while its bar is long: ${hottest?.digit} is hottest (${hottest?.percentage.toFixed(1)}%), ${coldest?.digit} coldest (${coldest?.percentage.toFixed(1)}%).`
    );

    const favourableCount = items.filter(item => item.tone === 'favourable').length;
    const cautionCount = items.filter(item => item.tone === 'caution').length;
    const score = Math.max(
        0,
        Math.min(100, Math.round((favourableCount / items.length) * 70 + (bestSignal?.confidence ?? 0) * 0.3))
    );

    const tone: ConditionTone =
        cautionCount === 0 && favourableCount >= 2 ? 'favourable' : cautionCount >= 2 ? 'caution' : 'neutral';

    const headline =
        tone === 'favourable'
            ? 'Conditions look favourable'
            : tone === 'caution'
              ? 'Conditions are mixed — trade small'
              : 'Conditions are neutral';

    const summary = `${sampleSize} ticks analysed · ${items[0].value} · ${items[1].value} · Even/Odd ${items[2].value}`;

    return { headline, summary, tone, score, items, entryGuidance };
}
