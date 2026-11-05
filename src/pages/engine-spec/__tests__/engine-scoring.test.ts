import {
    DEFAULT_SETTINGS,
    MACRO_WINDOW,
    MICRO_WINDOW,
    classifyAlignment,
    countDigits,
    detectMicroShift,
    digitComparisonRows,
    entropyBits,
    evaluateConfluence,
    expectedShare,
    normalizeSettings,
    oppositeStrategy,
    resolveStrategy,
    windowSnapshot,
    winningDigits,
    type EvaluateOptions,
    type StrategyFamily,
    type WindowSnapshot,
} from '../engine-scoring';

/** 0–9 repeated: every digit at exactly 10%, the neutral baseline. */
const neutral = (length = MACRO_WINDOW) => Array.from({ length }, (_, index) => index % 10);

/**
 * A block of `total` digits holding exactly `lowCount` digits from 0–6 and the
 * rest from 7–9, dealt round-robin so the distribution stays evenly spread
 * (no regime break from clustering).
 */
const block = (total: number, lowCount: number): number[] => {
    const low = [0, 1, 2, 3, 4, 5, 6];
    const high = [7, 8, 9];
    const counts = new Array(10).fill(0);
    const lowBase = Math.floor(lowCount / 7);
    const lowExtra = lowCount % 7;
    low.forEach((digit, index) => (counts[digit] = lowBase + (index < lowExtra ? 1 : 0)));
    const highCount = total - lowCount;
    const highBase = Math.floor(highCount / 3);
    const highExtra = highCount % 3;
    high.forEach((digit, index) => (counts[digit] = highBase + (index < highExtra ? 1 : 0)));

    const out: number[] = [];
    let remaining = total;
    while (remaining > 0) {
        for (let digit = 0; digit < 10; digit++) {
            if (counts[digit] > 0) {
                out.push(digit);
                counts[digit]--;
                remaining--;
            }
        }
    }
    return out;
};

/** Interleaved even / odd digits with exact segment counts. */
const paritySegment = (evenCount: number, oddCount: number): number[] => {
    const even = [0, 2, 4, 6, 8];
    const odd = [1, 3, 5, 7, 9];
    const out: number[] = [];
    let e = 0;
    let o = 0;
    while (e < evenCount || o < oddCount) {
        if (e < evenCount) out.push(even[e++ % 5]);
        if (o < oddCount) out.push(odd[o++ % 5]);
    }
    return out;
};

/**
 * 60% even / 40% odd in every window, each digit between 8% and 12% so the
 * macro baseline stays digit-neutral.
 */
const evenBias = (): number[] => [
    ...paritySegment(240, 160),
    ...paritySegment(45, 30),
    ...paritySegment(15, 10),
];

/** All three windows sit +4 pp for Under 7: a floor-clearing score with no significance. */
const weakEdge = (): number[] => [...block(400, 296), ...block(75, 55), ...block(25, 19)];

/** Micro and mid support Under 7 while the macro baseline opposes it. */
const microOnly = (): number[] => [...block(400, 240), ...block(75, 50), ...block(25, 25)];

const baseOptions = (digits: number[], family: StrategyFamily = 'under', target = 7): EvaluateOptions => ({
    digits,
    selection: { family, target },
    settings: DEFAULT_SETTINGS,
    tickIndex: 100,
    previousMicroDelta: null,
    previousAlignment: null,
    cooldownUntilTick: 0,
});

const snapshot = (
    label: WindowSnapshot['label'],
    deltaPp: number,
    overrides: Partial<WindowSnapshot> = {}
): WindowSnapshot => ({
    label,
    size: label === 'Micro' ? MICRO_WINDOW : label === 'Mid' ? 100 : MACRO_WINDOW,
    sample: label === 'Micro' ? MICRO_WINDOW : label === 'Mid' ? 100 : MACRO_WINDOW,
    counts: new Array(10).fill(0),
    percentages: new Array(10).fill(10),
    wins: 0,
    actual: 0.5,
    expected: 0.5,
    deltaPp,
    standardErrorPp: 1,
    ciLowPct: 40,
    ciHighPct: 60,
    zScore: deltaPp,
    significant: false,
    reliability: 'limited',
    weight: 0.3,
    aligned: deltaPp >= DEFAULT_SETTINGS.alignMinPp,
    opposing: deltaPp <= -DEFAULT_SETTINGS.conflictPp,
    ...overrides,
});

describe('strategy baselines', () => {
    it('computes winning digits for every contract family', () => {
        expect(winningDigits('under', 1)).toEqual([0]);
        expect(winningDigits('under', 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(winningDigits('under', 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        expect(winningDigits('over', 1)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
        expect(winningDigits('over', 8)).toEqual([9]);
        expect(winningDigits('even', 0)).toEqual([0, 2, 4, 6, 8]);
        expect(winningDigits('odd', 0)).toEqual([1, 3, 5, 7, 9]);
        expect(winningDigits('matches', 4)).toEqual([4]);
        expect(winningDigits('differs', 4)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9]);
    });

    it('uses the mathematical fair share as each baseline', () => {
        expect(expectedShare('under', 1)).toBeCloseTo(0.1);
        expect(expectedShare('under', 7)).toBeCloseTo(0.7);
        expect(expectedShare('under', 9)).toBeCloseTo(0.9);
        expect(expectedShare('over', 1)).toBeCloseTo(0.8);
        expect(expectedShare('over', 8)).toBeCloseTo(0.1);
        expect(expectedShare('even', 0)).toBeCloseTo(0.5);
        expect(expectedShare('odd', 0)).toBeCloseTo(0.5);
        expect(expectedShare('matches', 4)).toBeCloseTo(0.1);
        expect(expectedShare('differs', 4)).toBeCloseTo(0.9);
    });

    it('labels the resolved strategy and clamps out-of-range barriers', () => {
        expect(resolveStrategy('under', 7).label).toBe('Under 7');
        expect(resolveStrategy('over', 2).contractType).toBe('DIGITOVER');
        expect(resolveStrategy('matches', 4).label).toBe('Matches 4');
        expect(resolveStrategy('differs', 4).label).toBe('Differs 4');
        expect(resolveStrategy('under', 12).target).toBe(9);
        expect(resolveStrategy('over', 0).target).toBe(1);
        expect(resolveStrategy('matches', 11).target).toBe(9);
    });

    it('maps each strategy to its complementary contract', () => {
        expect(oppositeStrategy('under', 7).label).toBe('Over 6');
        expect(oppositeStrategy('over', 2).label).toBe('Under 3');
        expect(oppositeStrategy('even', 0).label).toBe('Odd');
        expect(oppositeStrategy('odd', 0).label).toBe('Even');
        expect(oppositeStrategy('matches', 5).label).toBe('Differs 5');
        expect(oppositeStrategy('differs', 5).label).toBe('Matches 5');
    });
});

describe('window statistics', () => {
    it('counts digits and computes entropy in bits', () => {
        const { counts, percentages, total } = countDigits(neutral());
        expect(total).toBe(500);
        expect(counts.every(count => count === 50)).toBe(true);
        expect(percentages.every(pct => pct === 10)).toBe(true);
        expect(entropyBits(percentages)).toBeCloseTo(Math.log2(10), 6);
    });

    it('reports share, delta, standard error, interval and z-score', () => {
        const strategy = resolveStrategy('under', 7);
        const window = windowSnapshot(block(100, 74), 100, 'Mid', strategy, DEFAULT_SETTINGS, 0.3);
        expect(window.sample).toBe(100);
        expect(window.actual).toBeCloseTo(0.74);
        expect(window.expected).toBeCloseTo(0.7);
        expect(window.deltaPp).toBeCloseTo(4, 6);
        // SE = sqrt(0.7 * 0.3 / 100) = 0.0458 -> 4.58 pp
        expect(window.standardErrorPp).toBeCloseTo(4.5826, 3);
        expect(window.zScore).toBeCloseTo(0.8729, 3);
        expect(window.ciLowPct).toBeCloseTo(65.02, 1);
        expect(window.ciHighPct).toBeCloseTo(82.98, 1);
        expect(window.reliability).toBe('insufficient');
    });

    it('classifies reliability from the z-score of a complete window', () => {
        const strategy = resolveStrategy('even', 0);
        const weak = windowSnapshot(neutral(100), 100, 'Mid', strategy, DEFAULT_SETTINGS, 0.3);
        const strong = windowSnapshot(paritySegment(62, 38), 100, 'Mid', strategy, DEFAULT_SETTINGS, 0.3);
        expect(weak.reliability).toBe('insufficient');
        expect(strong.reliability).toBe('reliable');
    });
});

describe('alignment validation', () => {
    it('classifies strong, moderate, conflict and none', () => {
        expect(
            classifyAlignment(snapshot('Micro', 2), snapshot('Mid', 2), snapshot('Macro', 2), DEFAULT_SETTINGS)
        ).toBe('strong');
        expect(
            classifyAlignment(snapshot('Micro', 2), snapshot('Mid', 2), snapshot('Macro', 0.5), DEFAULT_SETTINGS)
        ).toBe('moderate');
        expect(
            classifyAlignment(snapshot('Micro', 2), snapshot('Mid', 2), snapshot('Macro', -3), DEFAULT_SETTINGS)
        ).toBe('conflict');
        expect(
            classifyAlignment(snapshot('Micro', 0.5), snapshot('Mid', 0), snapshot('Macro', 0), DEFAULT_SETTINGS)
        ).toBe('none');
    });
});

describe('master score and verdicts', () => {
    it('blends the three deltas with the configured weights', () => {
        const result = evaluateConfluence(baseOptions(evenBias(), 'even', 0));
        const { micro, mid, macro } = result.windows;
        expect(micro.deltaPp).toBeCloseTo(10, 6);
        expect(mid.deltaPp).toBeCloseTo(10, 6);
        expect(macro.deltaPp).toBeCloseTo(10, 6);
        expect(result.masterScore).toBeCloseTo(
            micro.deltaPp * 0.5 + mid.deltaPp * 0.3 + macro.deltaPp * 0.2,
            10
        );
        expect(result.masterScore).toBeCloseTo(10, 6);
    });

    it('normalises configured weights before scoring', () => {
        const settings = normalizeSettings({ weights: { micro: 60, mid: 30, macro: 10 } });
        expect(settings.weights.micro).toBeCloseTo(0.6);
        expect(settings.weights.mid).toBeCloseTo(0.3);
        expect(settings.weights.macro).toBeCloseTo(0.1);

        const fallback = normalizeSettings({ weights: { micro: 0, mid: 0, macro: 0 } });
        expect(fallback.weights).toEqual(DEFAULT_SETTINGS.weights);
    });

    it('executes only when the score, alignment and reliability gates all pass', () => {
        const result = evaluateConfluence(baseOptions(evenBias(), 'even', 0));
        expect(result.complete).toBe(true);
        expect(result.regime.broken).toBe(false);
        expect(result.alignment).toBe('strong');
        expect(result.reliability).toBe('reliable');
        expect(result.verdict).toBe('execute');
        expect(result.verdictLabel).toBe('EXECUTE TRADE');
        expect(result.summary).toContain('no order is placed');
    });

    it('holds neutral when the score sits inside the band', () => {
        const result = evaluateConfluence(baseOptions(neutral(), 'even', 0));
        expect(result.complete).toBe(true);
        expect(Math.abs(result.masterScore)).toBeLessThan(DEFAULT_SETTINGS.entryMasterPp);
        expect(result.verdict).toBe('neutral');
        expect(result.verdictLabel).toBe('HOLD — NEUTRAL');
    });

    it('blocks a floor-clearing score whose evidence is not significant', () => {
        const result = evaluateConfluence(baseOptions(weakEdge()));
        expect(result.masterScore).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.entryMasterPp);
        expect(result.reliability).toBe('insufficient');
        expect(result.verdict).toBe('blocked');
        expect(result.reason).toContain('reliability');
    });

    it('fades to the opposite contract only when that side qualifies', () => {
        const odd = evaluateConfluence(baseOptions(evenBias(), 'odd', 0));
        expect(odd.masterScore).toBeLessThanOrEqual(-DEFAULT_SETTINGS.entryMasterPp);
        expect(odd.alignment).toBe('conflict');
        expect(odd.verdict).toBe('fade');
        expect(odd.opposite.label).toBe('Even');
        expect(odd.summary).toContain('Even');
    });

    it('reports conflict when micro and mid support a side the macro baseline opposes', () => {
        const result = evaluateConfluence(baseOptions(microOnly()));
        expect(result.masterScore).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.entryMasterPp);
        expect(result.alignment).toBe('conflict');
        expect(result.verdict).toBe('conflict');
        expect(result.verdictLabel).toBe('HOLD — CONFLICT');
    });

    it('blocks while the macro window is still filling', () => {
        const result = evaluateConfluence(baseOptions(block(120, 80)));
        expect(result.complete).toBe(false);
        expect(result.verdict).toBe('blocked');
        expect(result.reason).toContain('Collecting history');
    });

    it('blocks a broken macro regime even on a strong score', () => {
        const result = evaluateConfluence(baseOptions(new Array(MACRO_WINDOW).fill(0)));
        expect(result.masterScore).toBeGreaterThan(DEFAULT_SETTINGS.entryMasterPp);
        expect(result.regime.broken).toBe(true);
        expect(result.verdict).toBe('blocked');
        expect(result.reason).toMatch(/regime|entropy/i);
    });

    it('blocks when the data feed reports a problem', () => {
        const result = evaluateConfluence({
            ...baseOptions(evenBias(), 'even', 0),
            dataBlock: 'The market-data stream is not connected — signals are suspended.',
        });
        expect(result.verdict).toBe('blocked');
        expect(result.reason).toContain('not connected');
    });
});

describe('cooldown and micro shift', () => {
    it('arms the cooldown on a hard micro flip and blocks new signals', () => {
        const result = evaluateConfluence({
            ...baseOptions(evenBias(), 'even', 0),
            previousMicroDelta: -10,
        });
        expect(result.microShift.flipped).toBe(true);
        expect(result.cooldown.active).toBe(true);
        expect(result.cooldown.reason).toContain('CONFLUENCE_BROKEN');
        expect(result.cooldown.untilTick).toBe(100 + DEFAULT_SETTINGS.cooldownTicks);
        expect(result.verdict).toBe('blocked');
        expect(result.reason).toContain('ticks of stability');
    });

    it('measures the micro delta change and its velocity per tick', () => {
        const micro = snapshot('Micro', 10);
        const shift = detectMicroShift(micro, 4, 3, 'strong', 'strong', DEFAULT_SETTINGS);
        expect(shift.deltaChangePp).toBeCloseTo(6);
        expect(shift.velocityPpPerTick).toBeCloseTo(2);
        expect(shift.flipped).toBe(false);
    });

    it('arms the cooldown when previously aligned windows break into conflict', () => {
        const micro = snapshot('Micro', 0.5);
        const shift = detectMicroShift(micro, 2, 1, 'strong', 'conflict', DEFAULT_SETTINGS);
        expect(shift.brokeConfluence).toBe(true);
        expect(shift.reason).toContain('CONFLUENCE_BROKEN');
    });
});

describe('digit comparison', () => {
    it('reports every digit against the 10% baseline with its strategy membership', () => {
        const strategy = resolveStrategy('under', 7);
        const micro = windowSnapshot(neutral(), MICRO_WINDOW, 'Micro', strategy, DEFAULT_SETTINGS, 0.5);
        const mid = windowSnapshot(neutral(), 100, 'Mid', strategy, DEFAULT_SETTINGS, 0.3);
        const macro = windowSnapshot(neutral(), MACRO_WINDOW, 'Macro', strategy, DEFAULT_SETTINGS, 0.2);
        const rows = digitComparisonRows(micro, mid, macro, strategy);

        expect(rows).toHaveLength(10);
        expect(rows[0]).toMatchObject({ digit: 0, baselinePct: 10, inStrategy: true });
        expect(rows[7]).toMatchObject({ digit: 7, inStrategy: false });
        expect(rows.every(row => Math.abs(row.deviationPp) < 0.001)).toBe(true);
        expect(rows.every(row => Math.abs(row.trendPp - (row.microPct - row.macroPct)) < 1e-9)).toBe(true);
    });

    it('marks a digit hotter in micro than macro as rising', () => {
        const strategy = resolveStrategy('even', 0);
        const digits = [...neutral(475), ...new Array(25).fill(2)];
        const micro = windowSnapshot(digits, MICRO_WINDOW, 'Micro', strategy, DEFAULT_SETTINGS, 0.5);
        const mid = windowSnapshot(digits, 100, 'Mid', strategy, DEFAULT_SETTINGS, 0.3);
        const macro = windowSnapshot(digits, MACRO_WINDOW, 'Macro', strategy, DEFAULT_SETTINGS, 0.2);
        const rows = digitComparisonRows(micro, mid, macro, strategy);
        expect(rows[2].trend).toBe('rising');
        expect(rows[2].inStrategy).toBe(true);
    });
});
