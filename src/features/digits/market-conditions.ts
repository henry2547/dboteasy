/**
 * Turns the digit statistics into a plain-language read of the five markets the
 * app actually trades: Over 1, Over 2, Under 7, Under 8 and Even/Odd.
 *
 * Each reading compares the digits that LOSE the contract with the fair 10%
 * share, then repeats the check on a short recent window so a stale long-run
 * average cannot make an unstable market look safe. Everything is derived from
 * the live feed; nothing here predicts or places a trade.
 */

import type { DigitFrequency, DigitStatistics } from './types';

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
/**
 * A losing set of N digits is expected to take N × 10% of the ticks (Over 1 loses
 * on two digits, Under 7 on three), so every comparison uses that fair share —
 * comparing a three-digit set with 10% marked every Under 7 market as unstable.
 */
const DRIFT_TOLERANCE = 1.5;
/** Ticks of the recent window used for the drift check. */
const RECENT_WINDOW = 100;

const fairShare = (losingDigits: number): number => EXPECTED * losingDigits;

const toneFor = (losingShare: number, losingDigits: number, drift: number): ConditionTone => {
    const fair = fairShare(losingDigits);
    const tolerance = DRIFT_TOLERANCE * Math.sqrt(Math.max(1, losingDigits));
    if (losingShare <= fair + 0.5 && Math.abs(drift) <= tolerance) return 'favourable';
    if (losingShare <= fair + 4) return 'neutral';
    return 'caution';
};

function shareOf(frequencies: DigitFrequency[], digits: number[]): number {
    return frequencies.filter(item => digits.includes(item.digit)).reduce((sum, item) => sum + item.percentage, 0);
}

function recentShare(digits: number[], losing: number[]): number | null {
    const window = digits.slice(-RECENT_WINDOW);
    if (window.length < 20) return null;
    return (window.filter(digit => losing.includes(digit)).length / window.length) * 100;
}

function percent(value: number | null, digits = 1): string {
    return value === null ? '—' : `${value.toFixed(digits)}%`;
}

interface BarrierRead {
    id: string;
    label: string;
    barrier: number;
    kind: 'over' | 'under';
    losing: number[];
    entry: number[];
}

const BARRIERS: BarrierRead[] = [
    { id: 'over1', label: 'Over 1', barrier: 1, kind: 'over', losing: [0, 1], entry: [5, 6] },
    { id: 'over2', label: 'Over 2', barrier: 2, kind: 'over', losing: [0, 1, 2], entry: [4, 6] },
    { id: 'under8', label: 'Under 8', barrier: 8, kind: 'under', losing: [8, 9], entry: [4, 7] },
    { id: 'under7', label: 'Under 7', barrier: 7, kind: 'under', losing: [7, 8, 9], entry: [2, 5] },
];

/** The hot/cold reading the Even/Odd guidance uses. */
export interface ParityRead {
    hot: number;
    cold: number;
    hotShare: number;
    coldShare: number;
    parity: 'even' | 'odd' | null;
    recentEven: number | null;
}

export function readParity(statistics: DigitStatistics, recentDigits: number[] = []): ParityRead {
    const sorted = [...statistics.frequencies].sort((a, b) => b.percentage - a.percentage);
    const hot = sorted[0];
    const cold = sorted[sorted.length - 1];
    const parity = hot && cold && hot.digit % 2 === cold.digit % 2 ? (hot.digit % 2 === 0 ? 'even' : 'odd') : null;
    const window = recentDigits.slice(-RECENT_WINDOW);

    return {
        hot: hot?.digit ?? 0,
        hotShare: hot?.percentage ?? 0,
        cold: cold?.digit ?? 0,
        coldShare: cold?.percentage ?? 0,
        parity,
        recentEven: window.length >= 20 ? (window.filter(digit => digit % 2 === 0).length / window.length) * 100 : null,
    };
}

export function buildMarketConditions(
    statistics: DigitStatistics,
    recentDigits: number[] = []
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

    const items: ConditionItem[] = BARRIERS.map(read => {
        const losingShare = shareOf(frequencies, read.losing);
        const fair = fairShare(read.losing.length);
        const recent = recentShare(recentDigits, read.losing);
        const drift = recent === null ? 0 : recent - losingShare;
        const tone = toneFor(losingShare, read.losing.length, drift);
        const winRate = 100 - losingShare;

        return {
            label: read.label,
            value: `${winRate.toFixed(1)}% win · ${read.losing
                .map(digit => `${digit} ${percent(frequencies[digit]?.percentage ?? 0, 1)}`)
                .join(' · ')}`,
            detail:
                tone === 'favourable'
                    ? `Digits ${read.losing.join(', ')} sit at ${losingShare.toFixed(1)}%, at or below their ${fair.toFixed(0)}% fair share — a clean ${read.label} floor.`
                    : tone === 'neutral'
                      ? `Digits ${read.losing.join(', ')} are at ${losingShare.toFixed(1)}% against a ${fair.toFixed(0)}% fair share${
                            recent === null ? '' : ` (recent ${recent.toFixed(1)}%)`
                        } — usable, but not clean.`
                      : `Digits ${read.losing.join(', ')} run at ${losingShare.toFixed(1)}% against a ${fair.toFixed(0)}% fair share — ${read.label} is unstable right now.`,
            tone,
        };
    });

    const parity = readParity(statistics, recentDigits);
    const evenGap = Math.abs(statistics.evenPercentage - statistics.oddPercentage);
    const parityTone: ConditionTone = parity.parity === null ? 'caution' : evenGap <= 4 ? 'favourable' : 'neutral';

    items.push({
        label: 'Even / Odd',
        value: `${statistics.evenPercentage.toFixed(1)}% even · ${statistics.oddPercentage.toFixed(1)}% odd`,
        detail:
            parity.parity === null
                ? `Hot digit ${parity.hot} and cold digit ${parity.cold} split parity — there is no parity edge to trade.`
                : `Hot ${parity.hot} (${parity.hotShare.toFixed(1)}%) and cold ${parity.cold} (${parity.coldShare.toFixed(1)}%) are both ${parity.parity}. Even and Odd are ${evenGap.toFixed(1)} pts apart.`,
        tone: parityTone,
    });

    const entryGuidance = buildEntryGuidance(statistics, recentDigits, parity);

    const favourable = items.filter(item => item.tone === 'favourable').length;
    const caution = items.filter(item => item.tone === 'caution').length;
    const score = Math.round((favourable / items.length) * 100);

    const tone: ConditionTone = caution === 0 && favourable >= 2 ? 'favourable' : caution >= 3 ? 'caution' : 'neutral';
    const headline =
        tone === 'favourable'
            ? 'Conditions look favourable'
            : tone === 'caution'
              ? 'Conditions are mixed — trade small'
              : 'Conditions are neutral';

    return {
        headline,
        summary: `${sampleSize} ticks analysed · ${favourable} of ${items.length} markets clean · ${caution} to avoid`,
        tone,
        score,
        items,
        entryGuidance,
    };
}

function buildEntryGuidance(
    statistics: DigitStatistics,
    recentDigits: number[],
    parity: ParityRead
): string[] {
    const { frequencies } = statistics;
    const lines: string[] = [];

    BARRIERS.forEach(read => {
        const losingShare = shareOf(frequencies, read.losing);
        const fair = fairShare(read.losing.length);
        const recent = recentShare(recentDigits, read.losing);
        const clean = losingShare <= fair + 0.5;
        const digits = read.entry
            .map(digit => `${digit} (${(frequencies[digit]?.percentage ?? 0).toFixed(1)}%)`)
            .join(' and ');
        lines.push(
            `${read.label}: ${
                clean
                    ? `digits ${read.losing.join(', ')} are cold (${losingShare.toFixed(1)}% vs ${fair.toFixed(0)}% fair) — enter while the last digit is ${digits}.`
                    : `wait — digits ${read.losing.join(', ')} are at ${losingShare.toFixed(1)}% against ${fair.toFixed(0)}% fair${
                          recent === null ? '' : ` (recent ${recent.toFixed(1)}%)`
                      }.`
            }`
        );
    });

    const evenTail = recentDigits.slice(-5);
    const evenLean = evenTail.length === 5 ? evenTail.filter(digit => digit % 2 === 0).length : null;

    if (parity.parity === null) {
        lines.push(
            `Even/Odd: no entry — hot digit ${parity.hot} and cold digit ${parity.cold} split parity. Wait for them to agree again.`
        );
    } else if (evenLean !== null && (parity.parity === 'even' ? evenLean >= 3 : evenLean <= 2)) {
        lines.push(
            `Even/Odd: ${parity.parity === 'even' ? 'Even' : 'Odd'} is confirmed — hot and cold digits are both ${parity.parity} and the last 5 digits lean that way.`
        );
    } else {
        lines.push(
            `Even/Odd: both hot and cold digits are ${parity.parity} — wait for the last 5 digits to lean ${parity.parity} (3 or more).`
        );
    }

    return lines;
}
