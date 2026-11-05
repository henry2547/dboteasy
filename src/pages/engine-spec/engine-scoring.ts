/**
 * Weighted multi-window confluence for Deriv digit markets.
 *
 * Three rolling windows read the same digit stream at different horizons:
 *   micro 25 ticks  -> immediate momentum
 *   mid   100 ticks -> medium-term trend validation
 *   macro 500 ticks -> long-term statistical baseline
 *
 * Each window measures how far the strategy's WINNING share sits from its
 * mathematical expectation (its "delta", in percentage points). The three
 * deltas are blended with fixed weights into one Master Score, and a single
 * verdict is derived from the score's size plus how many windows agree.
 *
 * Everything here is pure: same digits + same state in, same verdict out. The
 * UI rounds for display; the maths never rounds.
 */

export const MICRO_WINDOW = 25;
export const MID_WINDOW = 100;
export const MACRO_WINDOW = 500;

export const WINDOW_WEIGHTS = { micro: 0.5, mid: 0.3, macro: 0.2 } as const;

/** Fair share of one digit on a 10-digit wheel, and of either parity. */
export const DIGIT_BASELINE_SHARE = 0.1;
export const PARITY_BASELINE_SHARE = 0.5;

/** Master Score at or above this is strong enough to trade (percentage points). */
export const ENTRY_MASTER_PP = 4.0;
/** A window counts as "aligned" when its delta clears this floor. */
export const ALIGN_MIN_PP = 1.0;
/** Master Score treated as full-strength evidence when scaling confidence. */
export const SATURATION_MASTER_PP = 12.0;
/** A macro max-min share spread above this means the index is not digit-neutral. */
export const REGIME_SPREAD_MAX_PP = 7.0;
/** Macro entropy floor in bits (uniform 10-digit ceiling is 3.3219). */
export const ENTROPY_FLOOR_BITS = 2.95;
/** Auto-cooldown length in ticks after the micro window flips direction hard. */
export const COOLDOWN_TICKS = 25;
/** Micro delta swing between two reads that arms the auto-cooldown. */
export const MICRO_FLIP_PP = 6.0;

export type StrategyFamily = 'over' | 'under' | 'even' | 'odd' | 'matches' | 'differs';

export type StrategyId =
    | 'OVER_1'
    | 'OVER_2'
    | 'UNDER_7'
    | 'UNDER_8'
    | 'EVEN'
    | 'ODD'
    | 'MATCHES'
    | 'DIFFERS';

export interface ConfluenceStrategy {
    id: StrategyId;
    label: string;
    family: StrategyFamily;
    /** Barrier for over/under; the resolved digit for matches/differs. */
    target: number;
    contractType: string;
    description: string;
}

export type Verdict = 'execute' | 'fade' | 'hold';

export interface WindowSnapshot {
    label: 'Micro' | 'Mid' | 'Macro';
    size: number;
    sample: number;
    counts: number[];
    percentages: number[];
    /** Share of the window satisfying the strategy (0–1). */
    actual: number;
    /** Mathematical expectation of that share (0–1). */
    expected: number;
    /** (actual - expected) x 100 — percentage points of edge. */
    deltaPp: number;
    weight: number;
}

export interface RegimeSnapshot {
    spreadPp: number;
    entropyBits: number;
    broken: boolean;
    reason: string | null;
}

export interface ConfluenceResult {
    strategy: ConfluenceStrategy;
    complete: boolean;
    windows: { micro: WindowSnapshot; mid: WindowSnapshot; macro: WindowSnapshot };
    masterScore: number;
    alignment: number;
    confidence: number;
    verdict: Verdict;
    verdictLabel: string;
    reason: string;
    headline: string;
    regime: RegimeSnapshot;
    cooldownUntilTick: number;
    cooling: boolean;
    coolingTicksLeft: number;
    microFlip: boolean;
    sample: number;
}

const STRATEGY_DEFINITIONS: Omit<ConfluenceStrategy, 'target'>[] = [
    {
        id: 'OVER_1',
        label: 'Over 1',
        family: 'over',
        contractType: 'DIGITOVER',
        description: 'Next digit is greater than 1 — 80% fair share.',
    },
    {
        id: 'OVER_2',
        label: 'Over 2',
        family: 'over',
        contractType: 'DIGITOVER',
        description: 'Next digit is greater than 2 — 70% fair share.',
    },
    {
        id: 'UNDER_7',
        label: 'Under 7',
        family: 'under',
        contractType: 'DIGITUNDER',
        description: 'Next digit is less than 7 — 70% fair share.',
    },
    {
        id: 'UNDER_8',
        label: 'Under 8',
        family: 'under',
        contractType: 'DIGITUNDER',
        description: 'Next digit is less than 8 — 80% fair share.',
    },
    {
        id: 'EVEN',
        label: 'Even',
        family: 'even',
        contractType: 'DIGITEVEN',
        description: 'Next digit is even — 50% fair share.',
    },
    {
        id: 'ODD',
        label: 'Odd',
        family: 'odd',
        contractType: 'DIGITODD',
        description: 'Next digit is odd — 50% fair share.',
    },
    {
        id: 'MATCHES',
        label: 'Matches',
        family: 'matches',
        contractType: 'DIGITMATCH',
        description: 'Next digit matches the macro window’s hottest digit — 10% fair share.',
    },
    {
        id: 'DIFFERS',
        label: 'Differs',
        family: 'differs',
        contractType: 'DIGITDIFF',
        description: 'Next digit differs from the macro window’s coldest digit — 90% fair share.',
    },
];

export const STRATEGY_LABELS: Record<StrategyId, string> = {
    OVER_1: 'Over 1',
    OVER_2: 'Over 2',
    UNDER_7: 'Under 7',
    UNDER_8: 'Under 8',
    EVEN: 'Even',
    ODD: 'Odd',
    MATCHES: 'Matches',
    DIFFERS: 'Differs',
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Counts and percentages (0–100) for a digit slice. */
export function countDigits(digits: number[]): { counts: number[]; percentages: number[]; total: number } {
    const counts = new Array(10).fill(0);
    let total = 0;
    for (const d of digits) {
        if (Number.isInteger(d) && d >= 0 && d <= 9) {
            counts[d]++;
            total++;
        }
    }
    const percentages = counts.map(c => (total > 0 ? (c / total) * 100 : 0));
    return { counts, percentages, total };
}

function inTarget(digit: number, family: StrategyFamily, target: number): boolean {
    switch (family) {
        case 'over':
            return digit > target;
        case 'under':
            return digit < target;
        case 'even':
            return digit % 2 === 0;
        case 'odd':
            return digit % 2 === 1;
        case 'matches':
            return digit === target;
        case 'differs':
            return digit !== target;
        default:
            return false;
    }
}

/** Mathematical expected share of the strategy's winning digits. */
export function expectedShare(family: StrategyFamily, target: number): number {
    switch (family) {
        case 'over':
            return (9 - target) / 10;
        case 'under':
            return target / 10;
        case 'even':
        case 'odd':
            return PARITY_BASELINE_SHARE;
        case 'matches':
            return DIGIT_BASELINE_SHARE;
        case 'differs':
            return 1 - DIGIT_BASELINE_SHARE;
        default:
            return 0.5;
    }
}

/** Hottest (matches) or coldest (differs) digit of the macro window; ties go low. */
export function resolveTargetDigit(digits: number[], family: StrategyFamily): number {
    const { counts } = countDigits(digits);
    if (family === 'matches') {
        let best = 0;
        for (let d = 1; d <= 9; d++) if (counts[d] > counts[best]) best = d;
        return best;
    }
    let worst = 0;
    for (let d = 1; d <= 9; d++) if (counts[d] < counts[worst]) worst = d;
    return worst;
}

/** Build the strategy descriptor, resolving the digit a Matches/Differs contract reads. */
export function resolveStrategy(id: StrategyId, macroDigits: number[]): ConfluenceStrategy {
    const base = STRATEGY_DEFINITIONS.find(s => s.id === id) ?? STRATEGY_DEFINITIONS[2];
    let target = 0;
    switch (base.id) {
        case 'OVER_1':
            target = 1;
            break;
        case 'OVER_2':
            target = 2;
            break;
        case 'UNDER_7':
            target = 7;
            break;
        case 'UNDER_8':
            target = 8;
            break;
        case 'MATCHES':
        case 'DIFFERS':
            target = macroDigits.length > 0 ? resolveTargetDigit(macroDigits, base.family) : 0;
            break;
        default:
            target = 0;
    }
    const label = base.id === 'MATCHES' ? `Matches ${target}` : base.id === 'DIFFERS' ? `Differs ${target}` : base.label;
    return { ...base, label, target };
}

/** One window's share, baseline and deviation. */
export function windowSnapshot(
    digits: number[],
    size: number,
    label: WindowSnapshot['label'],
    strategy: ConfluenceStrategy,
    weight: number
): WindowSnapshot {
    const slice = digits.slice(-size);
    const { counts, percentages, total } = countDigits(slice);
    let wins = 0;
    for (const d of slice) {
        if (Number.isInteger(d) && d >= 0 && d <= 9 && inTarget(d, strategy.family, strategy.target)) wins++;
    }
    const actual = total > 0 ? wins / total : 0;
    const expected = expectedShare(strategy.family, strategy.target);
    return {
        label,
        size,
        sample: total,
        counts,
        percentages,
        actual,
        expected,
        deltaPp: (actual - expected) * 100,
        weight,
    };
}

/** Shannon entropy of a distribution, in bits. */
export function entropyBits(percentages: number[]): number {
    let h = 0;
    for (const pct of percentages) {
        const p = pct / 100;
        if (p > 0) h -= p * Math.log2(p);
    }
    return h;
}

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
            ? `Macro spread ${spreadPp.toFixed(1)} pp exceeds the ${REGIME_SPREAD_MAX_PP.toFixed(1)} pp regime limit`
            : entropyBroken
              ? `Macro entropy ${entropy.toFixed(2)} bits is below the ${ENTROPY_FLOOR_BITS} bit floor`
              : null,
    };
}

function headlineFor(
    strategy: ConfluenceStrategy,
    alignment: number,
    master: number,
    micro: WindowSnapshot,
    macro: WindowSnapshot
): string {
    const name = strategy.label;
    if (alignment === 3 && master >= ENTRY_MASTER_PP) {
        return `All 3 windows show strong momentum for ${name}.`;
    }
    if (alignment === 3 && master <= -ENTRY_MASTER_PP) {
        return `All 3 windows lean against ${name}.`;
    }
    if (alignment === 2) {
        const lagging =
            micro.deltaPp < ALIGN_MIN_PP
                ? 'micro'
                : macro.deltaPp < ALIGN_MIN_PP
                  ? 'macro'
                  : 'mid';
        return `2 of 3 windows aligned for ${name}; the ${lagging} window has not confirmed.`;
    }
    if (micro.deltaPp >= ENTRY_MASTER_PP && macro.deltaPp <= -ALIGN_MIN_PP) {
        return `Micro burst for ${name} fights a negative macro baseline — likely a false breakout.`;
    }
    if (alignment === 1) return `Only one window supports ${name}; the rest sit near baseline.`;
    return `Windows are split — no stable edge for ${name} yet.`;
}

export interface EvaluateOptions {
    digits: number[];
    strategyId: StrategyId;
    /** Monotonic count of evaluated ticks, used to time the cooldown. */
    tickIndex: number;
    /** Micro delta from the previous evaluation, for flip detection. */
    previousMicroDelta: number | null;
    cooldownUntilTick: number;
}

/**
 * Evaluate the whole engine: three windows -> Master Score -> one verdict.
 * Pure and deterministic; the returned `cooldownUntilTick` is the caller's next
 * state, so the hook only has to carry it forward.
 */
export function evaluateConfluence(options: EvaluateOptions): ConfluenceResult {
    const { digits, strategyId, tickIndex, previousMicroDelta, cooldownUntilTick } = options;
    const strategy = resolveStrategy(strategyId, digits.slice(-MACRO_WINDOW));

    const micro = windowSnapshot(digits, MICRO_WINDOW, 'Micro', strategy, WINDOW_WEIGHTS.micro);
    const mid = windowSnapshot(digits, MID_WINDOW, 'Mid', strategy, WINDOW_WEIGHTS.mid);
    const macro = windowSnapshot(digits, MACRO_WINDOW, 'Macro', strategy, WINDOW_WEIGHTS.macro);
    const windows = { micro, mid, macro };

    const complete = micro.sample === MICRO_WINDOW && mid.sample === MID_WINDOW && macro.sample === MACRO_WINDOW;

    // Master Score = 0.50 x micro + 0.30 x mid + 0.20 x macro (percentage points).
    const masterScore =
        micro.deltaPp * WINDOW_WEIGHTS.micro +
        mid.deltaPp * WINDOW_WEIGHTS.mid +
        macro.deltaPp * WINDOW_WEIGHTS.macro;

    const alignment = [micro, mid, macro].filter(w => w.deltaPp >= ALIGN_MIN_PP).length;
    const regime = regimeOf(macro);

    // Auto-cooldown: the micro window flipped direction by more than MICRO_FLIP_PP.
    const microFlip =
        previousMicroDelta !== null &&
        Math.sign(previousMicroDelta) !== Math.sign(micro.deltaPp) &&
        Math.abs(micro.deltaPp - previousMicroDelta) >= MICRO_FLIP_PP;
    const nextCooldownUntil = microFlip ? tickIndex + COOLDOWN_TICKS : cooldownUntilTick;
    const cooling = tickIndex < nextCooldownUntil;

    const confidence = Number(
        (
            100 *
            clamp01(0.65 * clamp01(Math.abs(masterScore) / SATURATION_MASTER_PP) + 0.35 * (alignment / 3))
        ).toFixed(1)
    );

    let verdict: Verdict;
    let reason: string;

    if (!complete) {
        verdict = 'hold';
        reason = `Warming up — ${macro.sample}/${MACRO_WINDOW} ticks in the macro baseline.`;
    } else if (regime.broken) {
        verdict = 'hold';
        reason = regime.reason ?? 'Regime break.';
    } else if (cooling) {
        verdict = 'hold';
        reason = `Auto-cooldown — micro momentum flipped, ${COOLDOWN_TICKS} ticks of stability required.`;
    } else if (Math.abs(masterScore) < ENTRY_MASTER_PP) {
        verdict = 'hold';
        reason = `Master Score ${masterScore.toFixed(2)} pp is below the ${ENTRY_MASTER_PP.toFixed(1)} pp entry floor.`;
    } else if (alignment === 3) {
        verdict = 'execute';
        reason = `All three windows agree — Master Score ${masterScore >= 0 ? '+' : ''}${masterScore.toFixed(2)} pp.`;
    } else if (micro.deltaPp >= ENTRY_MASTER_PP && macro.deltaPp <= -ALIGN_MIN_PP) {
        verdict = 'fade';
        reason = 'Micro burst contradicts the macro baseline — treat the move as exhaustion, not an entry.';
    } else {
        verdict = 'hold';
        reason = `${alignment} of 3 windows aligned — confluence is not strong enough to execute.`;
    }

    return {
        strategy,
        complete,
        windows,
        masterScore,
        alignment,
        confidence,
        verdict,
        verdictLabel: verdict === 'execute' ? 'EXECUTE TRADE' : verdict === 'fade' ? 'FADE' : 'HOLD — NEUTRAL',
        reason,
        headline: headlineFor(strategy, alignment, masterScore, micro, macro),
        regime,
        cooldownUntilTick: nextCooldownUntil,
        cooling,
        coolingTicksLeft: Math.max(0, nextCooldownUntil - tickIndex),
        microFlip,
        sample: macro.sample,
    };
}
