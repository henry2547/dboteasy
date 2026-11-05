import {
    ALIGN_MIN_PP,
    COOLDOWN_TICKS,
    ENTRY_MASTER_PP,
    MACRO_WINDOW,
    MICRO_WINDOW,
    WINDOW_WEIGHTS,
    countDigits,
    entropyBits,
    evaluateConfluence,
    expectedShare,
    resolveStrategy,
    resolveTargetDigit,
    windowSnapshot,
    type EvaluateOptions,
} from '../engine-scoring';

/** 0–9 repeated: every digit at exactly 10%, the neutral baseline. */
const neutral = (length = MACRO_WINDOW) => Array.from({ length }, (_, i) => i % 10);
/** Digits 0–6 only: an Under 7 share of 100% (and a broken baseline). */
const allLow = (length = MACRO_WINDOW) => Array.from({ length }, (_, i) => i % 7);
const low = (n: number) => Array.from({ length: n }, (_, i) => i % 7);
const high = (n: number) => Array.from({ length: n }, (_, i) => 7 + (i % 3));
/** 19 of every 25 ticks low: a 76% Under 7 share in every window, regime intact. */
const balancedLow = (length = MACRO_WINDOW) =>
    Array.from({ length }, (_, i) => (i % 25 < 6 ? 7 + (i % 3) : i % 7));

const baseOptions = (digits: number[]): EvaluateOptions => ({
    digits,
    strategyId: 'UNDER_7',
    tickIndex: 100,
    previousMicroDelta: null,
    cooldownUntilTick: 0,
});

describe('multi-window confluence scoring', () => {
    it('uses the mathematical fair share as each strategy baseline', () => {
        expect(expectedShare('under', 7)).toBeCloseTo(0.7);
        expect(expectedShare('under', 8)).toBeCloseTo(0.8);
        expect(expectedShare('over', 1)).toBeCloseTo(0.8);
        expect(expectedShare('over', 2)).toBeCloseTo(0.7);
        expect(expectedShare('even', 0)).toBeCloseTo(0.5);
        expect(expectedShare('odd', 0)).toBeCloseTo(0.5);
        expect(expectedShare('matches', 4)).toBeCloseTo(0.1);
        expect(expectedShare('differs', 4)).toBeCloseTo(0.9);
    });

    it('reads a window share and delta against that baseline', () => {
        const strategy = resolveStrategy('UNDER_7', neutral());
        const window = windowSnapshot(allLow(100), 100, 'Mid', strategy, WINDOW_WEIGHTS.mid);
        expect(window.sample).toBe(100);
        expect(window.actual).toBe(1);
        expect(window.expected).toBeCloseTo(0.7);
        expect(window.deltaPp).toBeCloseTo(30);
    });

    it('counts digits and computes entropy in bits', () => {
        const { counts, percentages, total } = countDigits(neutral());
        expect(total).toBe(500);
        expect(counts.every(c => c === 50)).toBe(true);
        expect(percentages.every(p => p === 10)).toBe(true);
        expect(entropyBits(percentages)).toBeCloseTo(Math.log2(10), 6);
    });

    it('holds on a neutral market (no window clears the entry floor)', () => {
        const result = evaluateConfluence(baseOptions(neutral()));
        expect(result.complete).toBe(true);
        // The mid and macro windows sit exactly on fair value; a 25-tick slice
        // can only be near it, so the blended score stays well inside the floor.
        expect(Math.abs(result.masterScore)).toBeLessThan(ENTRY_MASTER_PP);
        expect(result.windows.mid.deltaPp).toBeCloseTo(0, 6);
        expect(result.windows.macro.deltaPp).toBeCloseTo(0, 6);
        expect(result.alignment).toBe(0);
        expect(result.verdict).toBe('hold');
    });

    it('blends the three deltas with 0.50 / 0.30 / 0.20 weights', () => {
        // Last 25 ticks all low, the rest neutral: only the micro window moves.
        const digits = [...neutral(MACRO_WINDOW - MICRO_WINDOW), ...allLow(MICRO_WINDOW)];
        const result = evaluateConfluence(baseOptions(digits));
        const { micro, mid, macro } = result.windows;
        const weighted =
            micro.deltaPp * WINDOW_WEIGHTS.micro +
            mid.deltaPp * WINDOW_WEIGHTS.mid +
            macro.deltaPp * WINDOW_WEIGHTS.macro;
        expect(result.masterScore).toBeCloseTo(weighted, 10);
        expect(micro.deltaPp).toBeCloseTo(30);
        expect(macro.deltaPp).toBeLessThan(micro.deltaPp);
    });

    it('executes when all three windows align on a strong, regime-safe score', () => {
        const result = evaluateConfluence(baseOptions(balancedLow()));
        expect(result.complete).toBe(true);
        expect(result.regime.broken).toBe(false);
        expect(result.windows.micro.deltaPp).toBeCloseTo(6);
        expect(result.masterScore).toBeCloseTo(6);
        expect(result.alignment).toBe(3);
        expect(result.verdict).toBe('execute');
        expect(result.verdictLabel).toBe('EXECUTE TRADE');
        expect(result.confidence).toBeCloseTo(67.5);
        expect(result.headline).toContain('All 3 windows');
    });

    it('keeps the verdict on HOLD while the macro baseline fills', () => {
        const result = evaluateConfluence(baseOptions(allLow(120)));
        expect(result.complete).toBe(false);
        expect(result.sample).toBe(120);
        expect(result.verdict).toBe('hold');
        expect(result.reason).toContain('Warming up');
    });

    it('vetoes a strong score when the macro distribution is broken', () => {
        const result = evaluateConfluence(baseOptions(new Array(MACRO_WINDOW).fill(0)));
        expect(result.masterScore).toBeGreaterThan(ENTRY_MASTER_PP);
        expect(result.regime.broken).toBe(true);
        expect(result.verdict).toBe('hold');
        expect(result.reason).toMatch(/regime|entropy/i);
    });

    it('arms the auto-cooldown on a hard micro flip and holds', () => {
        const result = evaluateConfluence({
            ...baseOptions(balancedLow()),
            previousMicroDelta: -10,
        });
        expect(result.microFlip).toBe(true);
        expect(result.cooling).toBe(true);
        expect(result.cooldownUntilTick).toBe(100 + COOLDOWN_TICKS);
        expect(result.verdict).toBe('hold');
        expect(result.reason).toContain('Auto-cooldown');
    });

    it('fades a micro burst that fights a negative macro baseline', () => {
        // Macro sits at 68.8% Under 7 (-1.2 pp), the last 100 ticks at 75% (+5.0 pp)
        // and the last 25 at 88% (+18.0 pp): micro only, with the baseline against it.
        const digits = [...low(268), ...high(132), ...low(53), ...high(25), ...low(22)];
        const result = evaluateConfluence(baseOptions(digits));
        expect(result.complete).toBe(true);
        expect(result.windows.micro.deltaPp).toBeGreaterThanOrEqual(ENTRY_MASTER_PP);
        expect(result.windows.macro.deltaPp).toBeLessThan(-ALIGN_MIN_PP);
        expect(result.alignment).toBe(2);
        expect(result.masterScore).toBeGreaterThanOrEqual(ENTRY_MASTER_PP);
        expect(result.verdict).toBe('fade');
        expect(result.verdictLabel).toBe('FADE');
    });

    it('resolves the Matches / Differs target from the macro window', () => {
        const digits = [...neutral(490), 7, 7, 7, 7, 7, 7, 7, 7, 7, 8];
        const hottest = resolveTargetDigit(digits, 'matches');
        const coldest = resolveTargetDigit(digits, 'differs');
        expect(hottest).toBe(7);
        expect(coldest).toBe(0);

        const matches = evaluateConfluence({ ...baseOptions(digits), strategyId: 'MATCHES' });
        expect(matches.strategy.target).toBe(hottest);
        expect(matches.strategy.label).toBe(`Matches ${hottest}`);
    });

    it('keeps confidence inside 0–100', () => {
        const strong = evaluateConfluence(baseOptions(balancedLow()));
        const neutralResult = evaluateConfluence(baseOptions(neutral()));
        expect(strong.confidence).toBeLessThanOrEqual(100);
        expect(neutralResult.confidence).toBeGreaterThanOrEqual(0);
        expect(neutralResult.confidence).toBeLessThan(strong.confidence);
    });
});
