/**
 * Real-time multi-window digit confluence engine — pure maths.
 *
 * Three rolling windows read the same validated digit stream at different
 * horizons:
 *   micro 25 ticks  -> immediate momentum
 *   mid   100 ticks -> medium-term validation
 *   macro 500 ticks -> long-term statistical baseline
 *
 * Each window measures how far the selected strategy's WINNING share sits from
 * its mathematical expectation (its "delta", in percentage points). The three
 * deltas are blended with configurable weights into one Master Score. A
 * separate alignment validator, a statistical reliability engine and a
 * tick-based cooldown decide whether that score may be acted on, and the whole
 * thing collapses into exactly one verdict.
 *
 * Everything here is pure: same digits + same state in, same verdict out. The
 * UI rounds for display; the maths never rounds.
 */

export const MICRO_WINDOW = 25;
export const MID_WINDOW = 100;
export const MACRO_WINDOW = 500;

/** Fair share of one digit on a ten-digit wheel. */
export const DIGIT_BASELINE_PCT = 10;

export type StrategyFamily = 'under' | 'over' | 'even' | 'odd' | 'matches' | 'differs';

export type Alignment = 'strong' | 'moderate' | 'conflict' | 'none';

export type Reliability = 'reliable' | 'limited' | 'insufficient';

export type Verdict = 'execute' | 'fade' | 'neutral' | 'conflict' | 'blocked';

export type AlignmentRequirement = 'strong' | 'moderate';

export interface WindowWeights {
    micro: number;
    mid: number;
    macro: number;
}

export interface EngineSettings {
    /** Normalised weights, summing to 1. */
    weights: WindowWeights;
    /** Master Score (pp) needed for an entry, and the fade threshold. */
    entryMasterPp: number;
    /** A window counts as aligned above this deviation (pp). */
    alignMinPp: number;
    /** A window counts as materially opposing below this deviation (pp). */
    conflictPp: number;
    /** Cooldown length, measured in ticks. */
    cooldownTicks: number;
    /** Micro delta swing that arms the cooldown. */
    microFlipPp: number;
    /** 95% two-sided z for the confidence interval and significance test. */
    confidenceZ: number;
    /** Weaker z that still counts as usable evidence. */
    weakZ: number;
    requiredAlignment: AlignmentRequirement;
}

export const DEFAULT_SETTINGS: EngineSettings = {
    weights: { micro: 0.5, mid: 0.3, macro: 0.2 },
    entryMasterPp: 4,
    alignMinPp: 1,
    conflictPp: 3,
    cooldownTicks: 25,
    microFlipPp: 6,
    confidenceZ: 1.96,
    weakZ: 1,
    requiredAlignment: 'strong',
};

const finite = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegative = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/** Sanitise partial settings and renormalise the weights to sum to 1. */
export function normalizeSettings(input?: Partial<EngineSettings>): EngineSettings {
    const weights = {
        micro: nonNegative(input?.weights?.micro, DEFAULT_SETTINGS.weights.micro),
        mid: nonNegative(input?.weights?.mid, DEFAULT_SETTINGS.weights.mid),
        macro: nonNegative(input?.weights?.macro, DEFAULT_SETTINGS.weights.macro),
    };
    const sum = weights.micro + weights.mid + weights.macro;
    const normalized: WindowWeights =
        sum > 0
            ? { micro: weights.micro / sum, mid: weights.mid / sum, macro: weights.macro / sum }
            : { ...DEFAULT_SETTINGS.weights };

    return {
        weights: normalized,
        entryMasterPp: nonNegative(input?.entryMasterPp, DEFAULT_SETTINGS.entryMasterPp),
        alignMinPp: nonNegative(input?.alignMinPp, DEFAULT_SETTINGS.alignMinPp),
        conflictPp: nonNegative(input?.conflictPp, DEFAULT_SETTINGS.conflictPp),
        cooldownTicks: Math.round(nonNegative(input?.cooldownTicks, DEFAULT_SETTINGS.cooldownTicks)),
        microFlipPp: nonNegative(input?.microFlipPp, DEFAULT_SETTINGS.microFlipPp),
        confidenceZ: finite(input?.confidenceZ, DEFAULT_SETTINGS.confidenceZ),
        weakZ: finite(input?.weakZ, DEFAULT_SETTINGS.weakZ),
        requiredAlignment: input?.requiredAlignment === 'moderate' ? 'moderate' : 'strong',
    };
}

/* ------------------------------------------------------------------ strategy */

export interface StrategySelection {
    family: StrategyFamily;
    /** Barrier for over/under; prediction digit for matches/differs. */
    target: number;
}

export interface StrategyDescriptor extends StrategySelection {
    label: string;
    contractType: string;
    winningDigits: number[];
    /** Mathematical share of the winning digits (0–1). */
    expectedShare: number;
    description: string;
}

export const STRATEGY_FAMILIES: Array<{ id: StrategyFamily; label: string }> = [
    { id: 'under', label: 'Under' },
    { id: 'over', label: 'Over' },
    { id: 'even', label: 'Even' },
    { id: 'odd', label: 'Odd' },
    { id: 'matches', label: 'Matches' },
    { id: 'differs', label: 'Differs' },
];

/** Valid barrier / prediction range, or null when the family takes no digit. */
export const BARRIER_BOUNDS: Record<StrategyFamily, { min: number; max: number; label: string } | null> = {
    under: { min: 1, max: 9, label: 'Barrier' },
    over: { min: 1, max: 8, label: 'Barrier' },
    even: null,
    odd: null,
    matches: { min: 0, max: 9, label: 'Prediction digit' },
    differs: { min: 0, max: 9, label: 'Prediction digit' },
};

export function clampTarget(family: StrategyFamily, target: number): number {
    const bounds = BARRIER_BOUNDS[family];
    if (!bounds) return 0;
    const value = Number.isFinite(target) ? Math.round(target) : bounds.min;
    return Math.min(bounds.max, Math.max(bounds.min, value));
}

/** Winning digits for a contract, computed from the family and its barrier. */
export function winningDigits(family: StrategyFamily, target: number): number[] {
    switch (family) {
        case 'under':
            return Array.from({ length: target }, (_, digit) => digit);
        case 'over':
            return Array.from({ length: 9 - target }, (_, index) => target + 1 + index);
        case 'even':
            return [0, 2, 4, 6, 8];
        case 'odd':
            return [1, 3, 5, 7, 9];
        case 'matches':
            return [target];
        case 'differs':
            return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(digit => digit !== target);
        default:
            return [];
    }
}

export function expectedShare(family: StrategyFamily, target: number): number {
    return winningDigits(family, target).length / 10;
}

export function resolveStrategy(family: StrategyFamily, rawTarget: number): StrategyDescriptor {
    const target = clampTarget(family, rawTarget);
    const digits = winningDigits(family, target);
    const share = digits.length / 10;
    const label =
        family === 'under'
            ? `Under ${target}`
            : family === 'over'
              ? `Over ${target}`
              : family === 'matches'
                ? `Matches ${target}`
                : family === 'differs'
                  ? `Differs ${target}`
                  : family === 'even'
                    ? 'Even'
                    : 'Odd';

    const contractType =
        family === 'under'
            ? 'DIGITUNDER'
            : family === 'over'
              ? 'DIGITOVER'
              : family === 'even'
                ? 'DIGITEVEN'
                : family === 'odd'
                  ? 'DIGITODD'
                  : family === 'matches'
                    ? 'DIGITMATCH'
                    : 'DIGITDIFF';

    return {
        family,
        target,
        label,
        contractType,
        winningDigits: digits,
        expectedShare: share,
        description: `Wins on ${digits.join(', ')} — ${(share * 100).toFixed(0)}% fair share.`,
    };
}

/** The complementary contract: digits the selected strategy does not win on. */
export function oppositeStrategy(family: StrategyFamily, target: number): StrategyDescriptor {
    switch (family) {
        case 'under':
            return resolveStrategy('over', Math.max(0, target - 1));
        case 'over':
            return resolveStrategy('under', Math.min(9, target + 1));
        case 'even':
            return resolveStrategy('odd', 0);
        case 'odd':
            return resolveStrategy('even', 0);
        case 'matches':
            return resolveStrategy('differs', target);
        case 'differs':
            return resolveStrategy('matches', target);
        default:
            return resolveStrategy('even', 0);
    }
}

/* ---------------------------------------------------------------- windows */

export function countDigits(digits: number[]): { counts: number[]; percentages: number[]; total: number } {
    const counts = new Array(10).fill(0);
    let total = 0;
    for (const digit of digits) {
        if (Number.isInteger(digit) && digit >= 0 && digit <= 9) {
            counts[digit]++;
            total++;
        }
    }
    const percentages = counts.map(count => (total > 0 ? (count / total) * 100 : 0));
    return { counts, percentages, total };
}

export interface WindowSnapshot {
    label: 'Micro' | 'Mid' | 'Macro';
    size: number;
    sample: number;
    counts: number[];
    percentages: number[];
    wins: number;
    /** Observed share of the winning digits (0–1). */
    actual: number;
    /** Mathematical expectation of that share (0–1). */
    expected: number;
    /** (actual - expected) x 100 — percentage points of edge. */
    deltaPp: number;
    /** Standard error of the share, in percentage points. */
    standardErrorPp: number;
    /** Confidence interval of the observed share, in percent. */
    ciLowPct: number;
    ciHighPct: number;
    /** (actual - expected) / standard error. */
    zScore: number;
    significant: boolean;
    reliability: Reliability;
    weight: number;
    aligned: boolean;
    opposing: boolean;
}

function reliabilityOf(sample: number, size: number, zScore: number, settings: EngineSettings): Reliability {
    if (sample < size) return 'insufficient';
    if (Math.abs(zScore) >= settings.confidenceZ) return 'reliable';
    if (Math.abs(zScore) >= settings.weakZ) return 'limited';
    return 'insufficient';
}

export function windowSnapshot(
    digits: number[],
    size: number,
    label: WindowSnapshot['label'],
    strategy: StrategyDescriptor,
    settings: EngineSettings,
    weight: number
): WindowSnapshot {
    const slice = digits.slice(-size);
    const { counts, percentages, total } = countDigits(slice);
    const winning = new Set(strategy.winningDigits);
    let wins = 0;
    for (const digit of slice) {
        if (Number.isInteger(digit) && digit >= 0 && digit <= 9 && winning.has(digit)) wins++;
    }

    const actual = total > 0 ? wins / total : 0;
    const expected = strategy.expectedShare;
    const standardError = Math.sqrt((expected * (1 - expected)) / Math.max(total, 1));
    const marginPp = settings.confidenceZ * standardError * 100;
    const observedPct = actual * 100;
    const deltaPp = (actual - expected) * 100;
    const zScore = standardError > 0 ? (actual - expected) / standardError : 0;

    return {
        label,
        size,
        sample: total,
        counts,
        percentages,
        wins,
        actual,
        expected,
        deltaPp,
        standardErrorPp: standardError * 100,
        ciLowPct: Math.max(0, observedPct - marginPp),
        ciHighPct: Math.min(100, observedPct + marginPp),
        zScore,
        significant: total > 0 && Math.abs(zScore) >= settings.confidenceZ,
        reliability: reliabilityOf(total, size, zScore, settings),
        weight,
        aligned: deltaPp >= settings.alignMinPp,
        opposing: deltaPp <= -settings.conflictPp,
    };
}

export function entropyBits(percentages: number[]): number {
    let entropy = 0;
    for (const percentage of percentages) {
        const share = percentage / 100;
        if (share > 0) entropy -= share * Math.log2(share);
    }
    return entropy;
}

export interface RegimeSnapshot {
    spreadPp: number;
    entropyBits: number;
    broken: boolean;
    reason: string | null;
}

/** Macro distribution sanity: a clustered index invalidates digit contracts. */
export const REGIME_SPREAD_MAX_PP = 7;
export const ENTROPY_FLOOR_BITS = 2.95;

function regimeOf(macro: WindowSnapshot): RegimeSnapshot {
    const spreadPp = Math.max(...macro.percentages) - Math.min(...macro.percentages);
    const entropy = entropyBits(macro.percentages);
    const spreadBroken = macro.sample > 0 && spreadPp > REGIME_SPREAD_MAX_PP;
    const entropyBroken = macro.sample > 0 && entropy < ENTROPY_FLOOR_BITS;
    return {
        spreadPp,
        entropyBits: entropy,
        broken: spreadBroken || entropyBroken,
        reason: spreadBroken
            ? `Macro digit spread ${spreadPp.toFixed(1)} pp exceeds the ${REGIME_SPREAD_MAX_PP.toFixed(
                  1
              )} pp regime limit`
            : entropyBroken
              ? `Macro entropy ${entropy.toFixed(2)} bits is below the ${ENTROPY_FLOOR_BITS} bit floor`
              : null,
    };
}

/* -------------------------------------------------------------- alignment */

export function classifyAlignment(
    micro: WindowSnapshot,
    mid: WindowSnapshot,
    macro: WindowSnapshot,
    settings: EngineSettings
): Alignment {
    const windows = [micro, mid, macro];
    if (windows.some(window => window.opposing)) return 'conflict';
    if (windows.every(window => window.aligned)) return 'strong';
    if (micro.aligned && mid.aligned && Math.abs(macro.deltaPp) < settings.alignMinPp) return 'moderate';
    return 'none';
}

export const ALIGNMENT_LABELS: Record<Alignment, string> = {
    strong: 'Strong',
    moderate: 'Moderate',
    conflict: 'Conflict',
    none: 'None',
};

export const RELIABILITY_LABELS: Record<Reliability, string> = {
    reliable: 'Reliable',
    limited: 'Limited',
    insufficient: 'Insufficient',
};

/** Two of three windows must carry usable evidence; two must be significant for "reliable". */
export function overallReliability(windows: WindowSnapshot[]): Reliability {
    const significant = windows.filter(window => window.reliability === 'reliable').length;
    const usable = windows.filter(window => window.reliability !== 'insufficient').length;
    if (significant >= 2) return 'reliable';
    if (usable >= 2) return 'limited';
    return 'insufficient';
}

/* ----------------------------------------------------------- micro shift */

export interface MicroShift {
    /** Current micro delta minus the previous evaluation's micro delta. */
    deltaChangePp: number;
    /** Delta change per elapsed tick. */
    velocityPpPerTick: number;
    /** Direction changed and the swing cleared the flip threshold. */
    flipped: boolean;
    /** Previously aligned windows now contradict each other. */
    brokeConfluence: boolean;
    reason: string | null;
}

export function detectMicroShift(
    micro: WindowSnapshot,
    previousMicroDelta: number | null,
    ticksElapsed: number,
    previousAlignment: Alignment | null,
    alignment: Alignment,
    settings: EngineSettings
): MicroShift {
    if (previousMicroDelta === null) {
        return { deltaChangePp: 0, velocityPpPerTick: 0, flipped: false, brokeConfluence: false, reason: null };
    }

    const deltaChangePp = micro.deltaPp - previousMicroDelta;
    const velocityPpPerTick = deltaChangePp / Math.max(1, ticksElapsed);
    const flipped =
        Math.sign(previousMicroDelta) !== Math.sign(micro.deltaPp) &&
        Math.abs(deltaChangePp) >= settings.microFlipPp;
    const wasAligned = previousAlignment === 'strong' || previousAlignment === 'moderate';
    const brokeConfluence = wasAligned && alignment === 'conflict';

    return {
        deltaChangePp,
        velocityPpPerTick,
        flipped,
        brokeConfluence,
        reason: flipped
            ? 'CONFLUENCE_BROKEN — the micro window flipped direction sharply'
            : brokeConfluence
              ? 'CONFLUENCE_BROKEN — the previously aligned windows now contradict each other'
              : null,
    };
}

/* -------------------------------------------------------------- digit rows */

export interface DigitComparisonRow {
    digit: number;
    microPct: number;
    midPct: number;
    macroPct: number;
    baselinePct: number;
    /** Macro share minus the 10% baseline, in percentage points. */
    deviationPp: number;
    /** Micro minus macro share: the direction the digit is moving. */
    trendPp: number;
    trend: 'rising' | 'falling' | 'flat';
    inStrategy: boolean;
}

export function digitComparisonRows(
    micro: WindowSnapshot,
    mid: WindowSnapshot,
    macro: WindowSnapshot,
    strategy: StrategyDescriptor
): DigitComparisonRow[] {
    const winning = new Set(strategy.winningDigits);
    return Array.from({ length: 10 }, (_, digit) => {
        const microPct = micro.percentages[digit] ?? 0;
        const midPct = mid.percentages[digit] ?? 0;
        const macroPct = macro.percentages[digit] ?? 0;
        const trendPp = microPct - macroPct;
        return {
            digit,
            microPct,
            midPct,
            macroPct,
            baselinePct: DIGIT_BASELINE_PCT,
            deviationPp: macroPct - DIGIT_BASELINE_PCT,
            trendPp,
            trend: trendPp >= 1 ? 'rising' : trendPp <= -1 ? 'falling' : 'flat',
            inStrategy: winning.has(digit),
        };
    });
}

/* ---------------------------------------------------------------- verdict */

export const VERDICT_LABELS: Record<Verdict, string> = {
    execute: 'EXECUTE TRADE',
    fade: 'FADE',
    neutral: 'HOLD — NEUTRAL',
    conflict: 'HOLD — CONFLICT',
    blocked: 'HOLD — BLOCKED',
};

export interface CooldownState {
    active: boolean;
    reason: string | null;
    ticksLeft: number;
    untilTick: number;
}

export interface ConfluenceResult {
    strategy: StrategyDescriptor;
    opposite: StrategyDescriptor;
    complete: boolean;
    windows: { micro: WindowSnapshot; mid: WindowSnapshot; macro: WindowSnapshot };
    weights: WindowWeights;
    masterScore: number;
    /** Weighted contribution of each window to the Master Score (pp). */
    breakdown: WindowWeights;
    alignment: Alignment;
    alignmentLabel: string;
    reliability: Reliability;
    reliabilityLabel: string;
    verdict: Verdict;
    verdictLabel: string;
    reason: string;
    summary: string;
    regime: RegimeSnapshot;
    cooldown: CooldownState;
    microShift: MicroShift;
    digits: DigitComparisonRow[];
    sample: number;
    tickIndex: number;
}

export interface EvaluateOptions {
    digits: number[];
    selection: StrategySelection;
    settings?: EngineSettings;
    /** Monotonic count of validated ticks, used to time the cooldown. */
    tickIndex?: number;
    previousMicroDelta?: number | null;
    previousAlignment?: Alignment | null;
    ticksElapsed?: number;
    cooldownUntilTick?: number;
    cooldownReason?: string | null;
    /** Set when the stream is down, precision is unresolved or a tick gap is unhealed. */
    dataBlock?: string | null;
}

const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

function buildSummary(args: {
    verdict: Verdict;
    strategy: StrategyDescriptor;
    opposite: StrategyDescriptor;
    windows: { micro: WindowSnapshot; mid: WindowSnapshot; macro: WindowSnapshot };
    masterScore: number;
    alignment: Alignment;
    reliability: Reliability;
    settings: EngineSettings;
    reason: string;
}): string {
    const { verdict, strategy, opposite, windows, masterScore, alignment, reliability, settings, reason } = args;
    const { micro, mid, macro } = windows;
    const windowLine = `micro ${signed(micro.deltaPp)} pp, mid ${signed(mid.deltaPp)} pp, macro ${signed(
        macro.deltaPp
    )} pp`;

    if (verdict === 'blocked') return `${reason} No new signal is generated until the block clears.`;

    if (verdict === 'execute') {
        return `All three windows clear the ${settings.alignMinPp.toFixed(
            1
        )} pp alignment floor for ${strategy.label} (${windowLine}). Master Score ${signed(
            masterScore,
            2
        )} pp with ${RELIABILITY_LABELS[reliability].toLowerCase()} evidence. Eligible for further evaluation — no order is placed.`;
    }

    if (verdict === 'fade') {
        return `The windows lean against ${strategy.label} (${windowLine}), and the opposite setup ${opposite.label} independently passes its own alignment and reliability checks. Treat it as a candidate, not an order.`;
    }

    if (verdict === 'conflict') {
        if (alignment === 'conflict') {
            return `The windows disagree (${windowLine}). Micro movement is not confirmed by the longer windows, so ${strategy.label} is stood down.`;
        }
        return `Master Score ${signed(masterScore, 2)} pp clears the ${settings.entryMasterPp.toFixed(
            1
        )} pp floor, but alignment is ${ALIGNMENT_LABELS[alignment].toLowerCase()} (${windowLine}) — the alignment gate fails.`;
    }

    return `Master Score ${signed(masterScore, 2)} pp sits inside the ±${settings.entryMasterPp.toFixed(
        1
    )} pp neutral band (${windowLine}); ${strategy.label} has no tradable edge in these windows.`;
}

/**
 * Evaluate the whole engine: three windows -> Master Score -> alignment ->
 * reliability -> cooldown -> one verdict. Pure and deterministic; the returned
 * cooldown fields are the caller's next state.
 */
export function evaluateConfluence(options: EvaluateOptions): ConfluenceResult {
    const settings = options.settings ?? DEFAULT_SETTINGS;
    const tickIndex = options.tickIndex ?? 0;
    const previousMicroDelta = options.previousMicroDelta ?? null;
    const previousAlignment = options.previousAlignment ?? null;
    const ticksElapsed = Math.max(1, options.ticksElapsed ?? 1);
    const cooldownUntilTick = options.cooldownUntilTick ?? 0;
    const cooldownReason = options.cooldownReason ?? null;
    const dataBlock = options.dataBlock ?? null;
    const digits = options.digits;

    const strategy = resolveStrategy(options.selection.family, options.selection.target);
    const opposite = oppositeStrategy(options.selection.family, options.selection.target);

    const micro = windowSnapshot(digits, MICRO_WINDOW, 'Micro', strategy, settings, settings.weights.micro);
    const mid = windowSnapshot(digits, MID_WINDOW, 'Mid', strategy, settings, settings.weights.mid);
    const macro = windowSnapshot(digits, MACRO_WINDOW, 'Macro', strategy, settings, settings.weights.macro);
    const windows = { micro, mid, macro };

    const complete = micro.sample === MICRO_WINDOW && mid.sample === MID_WINDOW && macro.sample === MACRO_WINDOW;

    const breakdown: WindowWeights = {
        micro: micro.deltaPp * settings.weights.micro,
        mid: mid.deltaPp * settings.weights.mid,
        macro: macro.deltaPp * settings.weights.macro,
    };
    const masterScore = breakdown.micro + breakdown.mid + breakdown.macro;

    const alignment = classifyAlignment(micro, mid, macro, settings);
    const reliability = overallReliability([micro, mid, macro]);
    const regime = regimeOf(macro);

    const microShift = detectMicroShift(
        micro,
        previousMicroDelta,
        ticksElapsed,
        previousAlignment,
        alignment,
        settings
    );
    const cooldownTriggered = microShift.flipped || microShift.brokeConfluence;
    const nextCooldownUntil = cooldownTriggered ? tickIndex + settings.cooldownTicks : cooldownUntilTick;
    const cooling = tickIndex < nextCooldownUntil;
    const activeCooldownReason = cooldownTriggered
        ? microShift.reason
        : cooling
          ? (cooldownReason ?? 'CONFLUENCE_BROKEN — waiting for the windows to realign')
          : null;

    let verdict: Verdict;
    let reason: string;

    if (!complete) {
        verdict = 'blocked';
        reason = `Collecting history — micro ${micro.sample}/${MICRO_WINDOW}, mid ${mid.sample}/${MID_WINDOW}, macro ${macro.sample}/${MACRO_WINDOW} ticks.`;
    } else if (dataBlock) {
        verdict = 'blocked';
        reason = dataBlock;
    } else if (regime.broken) {
        verdict = 'blocked';
        reason = regime.reason ?? 'Regime break — the macro distribution is not digit-neutral.';
    } else if (cooling) {
        verdict = 'blocked';
        reason = `${activeCooldownReason ?? 'CONFLUENCE_BROKEN'} · ${
            nextCooldownUntil - tickIndex
        } ticks of stability left.`;
    } else if (Math.abs(masterScore) < settings.entryMasterPp) {
        if (alignment === 'conflict') {
            verdict = 'conflict';
            reason = `The windows contradict each other — micro ${signed(micro.deltaPp)} pp, macro ${signed(
                macro.deltaPp
            )} pp.`;
        } else {
            verdict = 'neutral';
            reason = `Master Score ${signed(masterScore, 2)} pp is inside the ±${settings.entryMasterPp.toFixed(
                1
            )} pp neutral band.`;
        }
    } else if (masterScore >= settings.entryMasterPp) {
        const requiredMet =
            alignment === 'strong' || (settings.requiredAlignment === 'moderate' && alignment === 'moderate');
        if (reliability === 'insufficient') {
            verdict = 'blocked';
            reason = `Master Score ${signed(masterScore, 2)} pp clears the floor, but statistical reliability is insufficient (no window beyond z = ${settings.weakZ.toFixed(
                1
            )}).`;
        } else if (requiredMet) {
            verdict = 'execute';
            reason = `All aligned windows support ${strategy.label}; Master Score ${signed(
                masterScore,
                2
            )} pp clears the ${settings.entryMasterPp.toFixed(1)} pp floor with ${RELIABILITY_LABELS[
                reliability
            ].toLowerCase()} evidence.`;
        } else {
            verdict = 'conflict';
            reason = `Master Score ${signed(masterScore, 2)} pp clears the floor, but alignment is ${ALIGNMENT_LABELS[
                alignment
            ].toLowerCase()} — the ${settings.requiredAlignment} alignment requirement is not met.`;
        }
    } else {
        const oppositeAligned = micro.opposing && mid.opposing && macro.opposing;
        if (reliability === 'insufficient') {
            verdict = 'blocked';
            reason = `Master Score ${signed(masterScore, 2)} pp is negative, but statistical reliability is insufficient (no window beyond z = ${settings.weakZ.toFixed(
                1
            )}).`;
        } else if (oppositeAligned) {
            verdict = 'fade';
            reason = `The windows lean against ${strategy.label}, and ${opposite.label} independently clears the same alignment and reliability gates.`;
        } else {
            verdict = 'conflict';
            reason = `Master Score ${signed(
                masterScore,
                2
            )} pp is negative, but the opposite setup has not independently qualified.`;
        }
    }

    const summary = buildSummary({
        verdict,
        strategy,
        opposite,
        windows,
        masterScore,
        alignment,
        reliability,
        settings,
        reason,
    });

    return {
        strategy,
        opposite,
        complete,
        windows,
        weights: settings.weights,
        masterScore,
        breakdown,
        alignment,
        alignmentLabel: ALIGNMENT_LABELS[alignment],
        reliability,
        reliabilityLabel: RELIABILITY_LABELS[reliability],
        verdict,
        verdictLabel: VERDICT_LABELS[verdict],
        reason,
        summary,
        regime,
        cooldown: {
            active: cooling,
            reason: cooling ? (activeCooldownReason ?? 'CONFLUENCE_BROKEN') : null,
            ticksLeft: Math.max(0, nextCooldownUntil - tickIndex),
            untilTick: nextCooldownUntil,
        },
        microShift,
        digits: digitComparisonRows(micro, mid, macro, strategy),
        sample: macro.sample,
        tickIndex,
    };
}
