/**
 * Scanner → Free Bots matching.
 *
 * The scanner ranks every volatility market on its own scanned digits and offers exactly the bots
 * whose rule those digits satisfy:
 * - Bot 8 — Over 1, Confirmed 0/1 Pair: digits **0 and 1 both below 10%** of the sample.
 * - Bot 9 — Under 8, Confirmed 8/9 Pair: digits **8 and 9 both below 10%** of the sample.
 *
 * A market can satisfy both rules at once, so the match returns every rule that holds — each with
 * the bot that trades it — instead of forcing one strategy onto the row by its score.
 *
 * The red (coldest) bar is reported as evidence rather than as a scan condition: bots 8 and 9 buy
 * once one of their two losing digits carries that bar and their pair is confirmed, so the row says
 * whether that entry trigger is already set on the scanned market.
 *
 * These are observations about the ticks already seen — never a prediction of the next tick.
 */

import {
    adaptiveShareLimit,
    digitBarState,
    pairConfirmation,
} from '@/external/bot-skeleton/services/tradeEngine/utils/digit-analysis';
import { calculateStatisticsFromDigits } from '@/pages/digits/statistics';
import { FREE_BOT_TEMPLATES, freeBotById, type FreeBotId } from './templates';

/** Below this many ticks the scan cannot judge a setup. */
export const MIN_SETUP_SAMPLE = 30;
/** The scanner's own rule: a losing digit has to stay below this share of the sample. */
export const SETUP_SHARE_CEILING = 10;
/** The bots' configured share ceiling — the loosest the adaptive ceiling ever gets at run time. */
export const BOT_SHARE_CEILING = 10.2;
/** Window the bots read the digit bars over. */
export const SETUP_SAMPLE = 100;

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
    /** Position of the template in the Free Bots library, so the UI can say "Bot 8". */
    botNumber: number;
    name: string;
    strategy: 'over1' | 'under8';
    strategyLabel: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    prediction: number;
    /** Every statistical condition for the setup holds. */
    ready: boolean;
    /** The bots' own entry trigger is set on the latest scanned ticks. */
    armed: boolean;
    conditions: FreeBotSetupCondition[];
    reason: string;
    evidence: FreeBotSetupEvidence[];
    /** The losing digit carrying the red (coldest) bar right now, or `null` when neither does. */
    redBarDigit: number | null;
    latestDigit: number | null;
    /** The cold-share ceiling the bot would gate on if it ran on this sample now. */
    adaptiveCeiling: number | null;
}

interface StrategyRule {
    strategy: 'over1' | 'under8';
    templateId: FreeBotId;
    /** The two digits the contract loses to, in ascending order. */
    pair: [number, number];
    /** The pair set the bots' confirmation read uses. */
    set: '0_1' | '8_9';
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    barrier: number;
}

/** Bot 8 and bot 9, in library order. */
const RULES: StrategyRule[] = [
    {
        strategy: 'over1',
        templateId: 'over1_cold_run_recovery',
        pair: [0, 1],
        set: '0_1',
        contractType: 'DIGITOVER',
        barrier: 1,
    },
    {
        strategy: 'under8',
        templateId: 'under8_cold_run_recovery',
        pair: [8, 9],
        set: '8_9',
        contractType: 'DIGITUNDER',
        barrier: 8,
    },
];

function botNumberFor(templateId: FreeBotId): number {
    return FREE_BOT_TEMPLATES.findIndex(template => template.id === templateId) + 1;
}

function percentOf(frequencies: { digit: number; percentage: number }[], digit: number): number {
    return frequencies.find(item => item.digit === digit)?.percentage ?? 0;
}

function buildSetup(
    digits: number[],
    frequencies: { digit: number; percentage: number }[],
    rule: StrategyRule
): FreeBotSetup | null {
    const template = freeBotById(rule.templateId);
    if (!template) return null;

    const [first, second] = rule.pair;
    const firstShare = percentOf(frequencies, first);
    const secondShare = percentOf(frequencies, second);
    const sharePassed = firstShare < SETUP_SHARE_CEILING && secondShare < SETUP_SHARE_CEILING;

    const redBarDigit = rule.pair.find(digit => digitBarState(digits, digit, SETUP_SAMPLE) === 'coldest') ?? null;
    const latestDigit = digits.length ? digits[digits.length - 1] : null;
    const armed = redBarDigit !== null && pairConfirmation(digits, rule.set);
    const adaptiveCeiling = adaptiveShareLimit(digits, BOT_SHARE_CEILING, SETUP_SAMPLE);
    const botNumber = botNumberFor(rule.templateId);
    const strategyLabel = rule.strategy === 'over1' ? 'Over 1' : 'Under 8';
    const pairText = `${first} or ${second}`;
    const redBarText = redBarDigit === null ? `neither ${pairText} carries it` : `digit ${redBarDigit} carries it`;

    const conditions: FreeBotSetupCondition[] = [
        {
            id: `digit-${first}-below`,
            label: `Digit ${first} below ${SETUP_SHARE_CEILING}% of the sample`,
            passed: firstShare < SETUP_SHARE_CEILING,
            detail: `${first} at ${firstShare.toFixed(1)}% over ${digits.length} ticks.`,
        },
        {
            id: `digit-${second}-below`,
            label: `Digit ${second} below ${SETUP_SHARE_CEILING}% of the sample`,
            passed: secondShare < SETUP_SHARE_CEILING,
            detail: `${second} at ${secondShare.toFixed(1)}% over ${digits.length} ticks.`,
        },
    ];

    const waitingFor =
        redBarDigit === null
            ? `the bot waits until ${pairText} carries the red (coldest) bar`
            : `the bot waits for a confirmed ${first}/${second} pair`;

    const reason = sharePassed
        ? armed
            ? `Bot ${botNumber} (${strategyLabel}) conditions met — its entry trigger is set right now: a confirmed ${first}/${second} pair with the red bar on digit ${redBarDigit}.`
            : `Bot ${botNumber} (${strategyLabel}) conditions met — ${waitingFor}, then a confirmed ${first}/${second} pair. Red bar now: ${redBarText}.`
        : `No bot ${botNumber} setup: ${conditions
              .filter(condition => !condition.passed)
              .map(condition => condition.label.toLowerCase())
              .join('; ')}.`;

    return {
        templateId: rule.templateId,
        botNumber,
        name: template.name,
        strategy: rule.strategy,
        strategyLabel: rule.strategy === 'over1' ? 'Over 1' : 'Under 8',
        contractType: rule.contractType,
        prediction: rule.barrier,
        ready: sharePassed,
        armed,
        conditions,
        reason: `${reason} (${conditions.filter(condition => condition.passed).length}/${conditions.length} conditions passed)`,
        evidence: [
            { digit: first, percentage: firstShare },
            { digit: second, percentage: secondShare },
        ],
        redBarDigit,
        latestDigit,
        adaptiveCeiling,
    };
}

/**
 * Every bot whose conditions the sample satisfies, armed setup first. Both bots are returned when
 * both rules hold; when neither does, the closest partial setup is returned on its own so the row
 * can show which condition failed instead of pretending the market qualified.
 *
 * Returns an empty list when the sample is too small to judge.
 */
export function matchFreeBotSetups(digits: number[]): FreeBotSetup[] {
    if (digits.length < MIN_SETUP_SAMPLE) return [];

    const statistics = calculateStatisticsFromDigits(digits);
    const frequencies = statistics.frequencies.map(item => ({
        digit: item.digit,
        count: item.count,
        percentage: item.percentage,
    }));

    const setups = RULES.map(rule => buildSetup(digits, frequencies, rule)).filter(
        (setup): setup is FreeBotSetup => setup !== null
    );

    const ready = setups.filter(setup => setup.ready);
    if (ready.length > 0) {
        // Stable: an armed setup first, then library order (Over 1 before Under 8).
        return ready.slice().sort((a, b) => Number(b.armed) - Number(a.armed));
    }

    const closest = setups
        .slice()
        .sort((a, b) => {
            const passed = a.conditions.filter(condition => condition.passed).length;
            const otherPassed = b.conditions.filter(condition => condition.passed).length;
            return otherPassed - passed;
        })[0];

    return closest ? [closest] : [];
}

/**
 * The single setup a market is described by elsewhere (the scan summary and its trend read): the
 * armed or first qualifying bot, or the closest partial setup. `null` below the minimum sample.
 */
export function matchFreeBotSetup(digits: number[]): FreeBotSetup | null {
    return matchFreeBotSetups(digits)[0] ?? null;
}
