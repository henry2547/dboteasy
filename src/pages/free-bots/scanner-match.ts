/**
 * Scanner → Free Bots matching.
 *
 * The scanner's digit sample decides which of the two supplied templates (if
 * either) suits a market, using the same suppression logic as the Over 1 /
 * Under 8 modules of the strategy engine. The match is explicit: an Over 1
 * result can only ever load the Over 1 template, an Under 8 result only the
 * Under 8 template, and a market that satisfies neither is reported as having
 * no matching template rather than being matched on its score.
 *
 * These are observations about the ticks already seen — never a prediction of
 * the next tick.
 */

import { calculateStatisticsFromDigits } from '@/pages/digits/statistics';
import { freeBotById, type FreeBotId } from './templates';

/** Below this many ticks the scan cannot judge a setup. */
export const MIN_SETUP_SAMPLE = 30;
const EXPECTED_PERCENT = 10;

export interface FreeBotSetupCondition {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
}

export interface FreeBotSetupEvidence {
    digit: number;
    percentage: number;
}

export interface FreeBotSetup {
    templateId: FreeBotId;
    strategy: 'over1' | 'under8';
    strategyLabel: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    prediction: number;
    triggerDigit: number;
    triggerLabel: string;
    /** Every statistical condition for the setup holds. */
    ready: boolean;
    /** The latest scanned tick already sits on the entry digit. */
    armed: boolean;
    conditions: FreeBotSetupCondition[];
    reason: string;
    evidence: FreeBotSetupEvidence[];
    peakDigits: number[];
    latestDigit: number | null;
}

interface SetupDraft {
    strategy: 'over1' | 'under8';
    conditions: FreeBotSetupCondition[];
    evidence: FreeBotSetupEvidence[];
    peakDigits: number[];
    latestDigit: number | null;
    ready: boolean;
    armed: boolean;
}

function peakDigitsOf(frequencies: { digit: number; count: number }[]): number[] {
    const max = Math.max(...frequencies.map(item => item.count));
    if (max <= 0) return [];
    return frequencies.filter(item => item.count === max).map(item => item.digit);
}

function percentOf(frequencies: { digit: number; percentage: number }[], digit: number): number {
    return frequencies.find(item => item.digit === digit)?.percentage ?? 0;
}

function buildOver1(digits: number[], frequencies: { digit: number; count: number; percentage: number }[]): SetupDraft {
    const zero = percentOf(frequencies, 0);
    const one = percentOf(frequencies, 1);
    const peaks = peakDigitsOf(frequencies);
    const latestDigit = digits.length ? digits[digits.length - 1] : null;

    const zeroSuppressed = zero < EXPECTED_PERCENT;
    const oneSuppressed = one < EXPECTED_PERCENT;
    const peakHighOdd = peaks.some(digit => digit === 5 || digit === 7 || digit === 9);

    return {
        strategy: 'over1',
        conditions: [
            {
                id: 'digit-0-suppressed',
                label: 'Digit 0 below its 10% share',
                passed: zeroSuppressed,
                detail: `0 at ${zero.toFixed(1)}% over ${digits.length} ticks.`,
            },
            {
                id: 'digit-1-suppressed',
                label: 'Digit 1 below its 10% share',
                passed: oneSuppressed,
                detail: `1 at ${one.toFixed(1)}% over ${digits.length} ticks.`,
            },
            {
                id: 'peak-high-odd',
                label: 'Mass concentrated on a high odd digit (5, 7 or 9)',
                passed: peakHighOdd,
                detail: `Peak digit(s): ${peaks.length ? peaks.join(', ') : '—'}.`,
            },
        ],
        evidence: [
            { digit: 0, percentage: zero },
            { digit: 1, percentage: one },
        ],
        peakDigits: peaks,
        latestDigit,
        ready: zeroSuppressed && oneSuppressed && peakHighOdd,
        armed: latestDigit !== null && latestDigit <= 1,
    };
}

function buildUnder8(digits: number[], frequencies: { digit: number; count: number; percentage: number }[]): SetupDraft {
    const eight = percentOf(frequencies, 8);
    const nine = percentOf(frequencies, 9);
    const peaks = peakDigitsOf(frequencies);
    const latestDigit = digits.length ? digits[digits.length - 1] : null;

    const eightSuppressed = eight < EXPECTED_PERCENT;
    const nineSuppressed = nine < EXPECTED_PERCENT;
    const peakLowEven = peaks.some(digit => digit === 0 || digit === 2 || digit === 4);

    return {
        strategy: 'under8',
        conditions: [
            {
                id: 'digit-8-suppressed',
                label: 'Digit 8 below its 10% share',
                passed: eightSuppressed,
                detail: `8 at ${eight.toFixed(1)}% over ${digits.length} ticks.`,
            },
            {
                id: 'digit-9-suppressed',
                label: 'Digit 9 below its 10% share',
                passed: nineSuppressed,
                detail: `9 at ${nine.toFixed(1)}% over ${digits.length} ticks.`,
            },
            {
                id: 'peak-low-even',
                label: 'Mass concentrated on a low digit (0, 2 or 4)',
                passed: peakLowEven,
                detail: `Peak digit(s): ${peaks.length ? peaks.join(', ') : '—'}.`,
            },
        ],
        evidence: [
            { digit: 8, percentage: eight },
            { digit: 9, percentage: nine },
        ],
        peakDigits: peaks,
        latestDigit,
        ready: eightSuppressed && nineSuppressed && peakLowEven,
        armed: latestDigit !== null && latestDigit >= 8,
    };
}

function toSetup(draft: SetupDraft): FreeBotSetup | null {
    const passed = draft.conditions.filter(condition => condition.passed).length;
    const templateId: FreeBotId =
        draft.strategy === 'over1' ? 'over1_entry_every_time' : 'under8_entry_every_time';
    const template = freeBotById(templateId);
    if (!template) return null;

    // The scanner only ever matches the two Over/Under templates, which always
    // carry a barrier digit — the library's Even/Odd templates never reach here.
    const { contractType, prediction, triggerDigit } = template;
    if (contractType !== 'DIGITOVER' && contractType !== 'DIGITUNDER') return null;
    if (prediction === null || triggerDigit === null) return null;

    const triggerLabel =
        draft.strategy === 'over1' ? 'Last digit ≤ 1 (0 or 1)' : 'Last digit ≥ 8 (8 or 9)';
    const failed = draft.conditions.filter(condition => !condition.passed);

    const reason = draft.ready
        ? draft.armed
            ? `Setup holds and the latest tick sits on ${draft.latestDigit} — entry armed.`
            : `Setup holds; waiting for a tick on ${draft.strategy === 'over1' ? '0 or 1' : '8 or 9'} to arm the entry.`
        : `No ${template.strategyLabel} setup: ${failed.map(condition => condition.label.toLowerCase()).join('; ')}.`;

    return {
        templateId,
        strategy: draft.strategy,
        strategyLabel: draft.strategy === 'over1' ? 'Over 1' : 'Under 8',
        contractType,
        prediction,
        triggerDigit,
        triggerLabel,
        ready: draft.ready,
        armed: draft.armed,
        conditions: draft.conditions,
        reason: `${reason} (${passed}/${draft.conditions.length} conditions passed)`,
        evidence: draft.evidence,
        peakDigits: draft.peakDigits,
        latestDigit: draft.latestDigit,
    };
}

/**
 * Picks the template a scanned market suits, or the closest partial setup when
 * neither holds. Returns `null` when the sample is too small to judge.
 */
export function matchFreeBotSetup(digits: number[]): FreeBotSetup | null {
    if (digits.length < MIN_SETUP_SAMPLE) return null;

    const statistics = calculateStatisticsFromDigits(digits);
    const frequencies = statistics.frequencies.map(item => ({
        digit: item.digit,
        count: item.count,
        percentage: item.percentage,
    }));

    const over1 = buildOver1(digits, frequencies);
    const under8 = buildUnder8(digits, frequencies);

    const candidates = [over1, under8];
    const ready = candidates.filter(draft => draft.ready);

    // A ready setup wins. Between two ready setups the armed one wins, and
    // between two armed (or two unarmed) ones the sharper suppression wins.
    const suppressionMargin = (draft: SetupDraft) =>
        draft.conditions.reduce((total, condition) => total + (condition.passed ? 1 : 0), 0);

    const ranked = (ready.length ? ready : candidates).slice().sort((a, b) => {
        if (a.armed !== b.armed) return a.armed ? -1 : 1;
        return suppressionMargin(b) - suppressionMargin(a);
    });

    return toSetup(ranked[0]);
}
