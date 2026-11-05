/**
 * Written specification for the weighted multi-window confluence engine.
 *
 * This file is content only. The live verdict block renders from
 * `engine-scoring.ts`; every number, formula and threshold below describes
 * exactly what that module does, so the page cannot drift from the engine.
 */

export interface SpecMetric {
    label: string;
    value: string;
    hint: string;
}

export interface SpecTableData {
    title?: string;
    columns: string[];
    rows: string[][];
    /** Minimum table width in px; the wrapper scrolls sideways below it. */
    minWidth?: number;
}

export interface SpecFormula {
    label: string;
    expression: string;
    note: string;
}

export interface SpecSectionData {
    id: string;
    kicker: string;
    title: string;
    intro: string;
    bullets?: string[];
    formulas?: SpecFormula[];
    tables?: SpecTableData[];
    code?: { language: string; text: string };
}

export const SPEC_METRICS: SpecMetric[] = [
    { label: 'Micro window', value: '25', hint: 'ticks · weight 0.50 · momentum' },
    { label: 'Mid window', value: '100', hint: 'ticks · weight 0.30 · validation' },
    { label: 'Macro window', value: '500', hint: 'ticks · weight 0.20 · baseline' },
    { label: 'Entry floor', value: '+4.0 pp', hint: 'Master Score to execute' },
    { label: 'Alignment', value: '3 / 3', hint: 'windows must agree' },
    { label: 'Auto-cooldown', value: '25 ticks', hint: 'after a micro flip' },
];

export const SPEC_SECTIONS: SpecSectionData[] = [
    {
        id: 'windows',
        kicker: '1. Architecture',
        title: 'Three simultaneous tick windows',
        intro:
            'One streaming feed, one rolling digit array, three read horizons. The micro window describes the move happening now, the mid window validates that it is a trend rather than a blip, and the macro window says what the index has actually been paying. The engine re-reads all three on every tick; none of them ever resets, they slide.',
        tables: [
            {
                title: 'The three windows',
                columns: ['Layer', 'Window', 'Weight', 'Job in the decision', 'Evidence it contributes'],
                minWidth: 900,
                rows: [
                    [
                        'Micro',
                        'Last 25 ticks',
                        '0.50',
                        'Immediate momentum: is the strategy’s winning share above its fair baseline right now?',
                        'share, baseline, delta, digit clustering, momentum direction',
                    ],
                    [
                        'Mid',
                        'Last 100 ticks',
                        '0.30',
                        'Trend validation: does the momentum survive a full minute-scale window, or is it a three-tick burst?',
                        'share, baseline, delta, parity split, repeat rate',
                    ],
                    [
                        'Macro',
                        'Last 500 ticks',
                        '0.20',
                        'Statistical baseline: is the index still digit-neutral, and what is each digit’s true long-run share?',
                        'share, baseline, delta, entropy, max-min spread',
                    ],
                ],
            },
        ],
        formulas: [
            {
                label: 'Window share',
                expression: 'share_w = wins_w / n_w',
                note: 'Fraction of the window’s ticks that satisfy the strategy (digit > barrier, digit < barrier, parity, match or differ).',
            },
            {
                label: 'Expected baseline',
                expression: 'Under N: N/10 · Over N: (9-N)/10 · Even/Odd: 0.50 · Matches: 0.10 · Differs: 0.90',
                note: 'The mathematical fair share of the winning digits. A neutral market sits exactly here.',
            },
            {
                label: 'Window delta',
                expression: 'delta_w = (share_w - baseline) x 100',
                note: 'Percentage points of edge above fair value for that window. Sign is the direction the distribution leans.',
            },
            {
                label: 'Baseline example',
                expression: 'Under 7 at 74 of 100 ticks => (0.74 - 0.70) x 100 = +4.0 pp',
                note: 'A 74% Under 7 share is only four points above the 70% fair share — large in tick counts, modest in edge.',
            },
        ],
        bullets: [
            'One feed, no second socket: the engine reads the market already selected on the Digits tab.',
            'Windows complete before they vote: 25 / 100 / 500 samples are required, so the verdict is HOLD while the macro baseline fills.',
            'Refresh is per tick and O(1) per window: fixed weights, no re-tuning mid-session, so the same ticks always produce the same verdict.',
        ],
    },
    {
        id: 'confluence',
        kicker: '2. Confluence',
        title: 'Master Score and alignment',
        intro:
            'The three deltas become one weighted number, then a set of hard gates decides whether that number is tradable. High alignment is what separates a real distribution shift from a micro burst: a large Master Score with only one supporting window is refused.',
        formulas: [
            {
                label: 'Master Score',
                expression: 'Master = (delta_micro x 0.50) + (delta_mid x 0.30) + (delta_macro x 0.20)',
                note: 'Single weighted synthesis, in percentage points. Positive favours the strategy; negative leans against it.',
            },
            {
                label: 'Alignment',
                expression: 'aligned = count( delta_w >= +1.0 pp )',
                note: 'How many windows independently confirm the edge, 0 to 3. Execution requires 3.',
            },
            {
                label: 'Confluence confidence',
                expression: 'confidence = 100 x (0.65 x min(|Master| / 12, 1) + 0.35 x aligned/3)',
                note: 'A 0–100% score blending magnitude with agreement. 12 pp is the practical saturation point on a 10-digit wheel.',
            },
            {
                label: 'Macro entropy',
                expression: 'H = -sum p_d x log2 p_d',
                note: 'Uniform ceiling is log2(10) = 3.3219 bits. Below 2.95 bits the baseline is structurally clustered and no digit contract is taken.',
            },
            {
                label: 'Macro spread',
                expression: 'spread = max(share_d) - min(share_d)',
                note: 'A spread above 7 pp means the index is not paying anything close to 10% a digit — regime break.',
            },
            {
                label: 'Micro flip',
                expression: 'flip = sign(delta_micro) changed AND |delta_micro - previous| >= 6.0 pp',
                note: 'Rapid volatility shift out of confluence. Arms the automatic 25-tick cooldown.',
            },
        ],
        tables: [
            {
                title: 'Verdict gate stack (evaluated in order)',
                columns: ['Order', 'Condition', 'Result'],
                minWidth: 760,
                rows: [
                    ['1', 'Any window incomplete (25 / 100 / 500)', 'HOLD — warming up'],
                    ['2', 'Macro spread > 7.0 pp or macro entropy < 2.95 bits', 'HOLD — regime break'],
                    ['3', 'Cooldown active (micro flipped >= 6.0 pp)', 'HOLD — cooling'],
                    ['4', '|Master Score| < 4.0 pp', 'HOLD — neutral'],
                    ['5', 'Master >= +4.0 pp and 3 of 3 windows aligned', 'EXECUTE TRADE'],
                    ['6', 'Micro >= +4.0 pp and macro <= -1.0 pp', 'FADE — false breakout'],
                    ['7', 'Everything else (2 or fewer windows aligned)', 'HOLD — conflict'],
                ],
            },
        ],
        bullets: [
            'The macro window carries the least weight but holds the veto: a broken baseline cancels the verdict regardless of how loud the micro window is.',
            'Alignment is measured on the same side as the strategy. A window sitting at baseline contributes nothing to the count, even when the weighted total clears the floor.',
            'FADE is not an opposite trade: it says the micro burst is exhaustion, so the named side is stood down until the windows realign.',
        ],
    },
    {
        id: 'output',
        kicker: '3. Output',
        title: 'One consolidated verdict block',
        intro:
            'Every window, filter and gate collapses into a single block. The user never reconciles three signals — the block states the market, the strategy, the verdict, the confidence and one line explaining the alignment.',
        tables: [
            {
                title: 'The output contract',
                columns: ['Field', 'Content', 'Example'],
                minWidth: 820,
                rows: [
                    ['Target market', 'Selected volatility index', 'Volatility 75 (1s)'],
                    ['Strategy', 'Contract family plus barrier / parity / digit', 'Under 7 Strategy'],
                    ['Final verdict', 'EXECUTE TRADE · FADE · HOLD — NEUTRAL', 'EXECUTE TRADE'],
                    ['Confidence', 'Master Confluence Confidence, 0–100%', '68.4%'],
                    ['Alignment line', 'One sentence naming the windows that agree or conflict', 'All 3 windows show strong momentum for Under 7.'],
                    ['Evidence row', 'Per window: share, fair baseline, delta and weight', '25t 76.0% vs 70% · +6.0 pp · ×0.50'],
                    ['Master Score', 'Weighted total in percentage points', '+5.21 pp'],
                ],
            },
        ],
        bullets: [
            'Exactly one verdict is shown. The three window rows are evidence behind it, never three separate calls to action.',
            'The verdict is a pure function of the visible numbers, so a user can recompute the Master Score by hand from the rows.',
            'The reason line always explains a HOLD or FADE: warming up, regime break, cooldown, below floor, or insufficient alignment.',
        ],
    },
    {
        id: 'risk',
        kicker: '4. Execution',
        title: 'Risk and execution rules',
        intro:
            'The verdict says whether an edge exists; these rules decide whether it may be taken. Thresholds are fixed per session and every wait is measured in ticks, so a 1-second index behaves like a 1-second index.',
        tables: [
            {
                title: 'Entry thresholds',
                columns: ['Parameter', 'Value', 'Rule'],
                minWidth: 760,
                rows: [
                    ['ENTRY_MASTER_PP', '+4.0 pp', 'Minimum Master Score for any entry, and the minimum micro delta for a fade.'],
                    ['ALIGN_MIN_PP', '+1.0 pp', 'A window only counts as aligned above this floor.'],
                    ['REQUIRED_ALIGNMENT', '3 of 3', 'EXECUTE needs every window on side; two is a wait.'],
                    ['SATURATION_MASTER_PP', '12.0 pp', 'Master Score mapped to full magnitude in the confidence score.'],
                    ['REGIME_SPREAD_MAX_PP', '7.0 pp', 'Macro max-min share spread that ends digit trading.'],
                    ['ENTROPY_FLOOR_BITS', '2.95', 'Macro entropy below this is a structural cluster.'],
                    ['COOLDOWN_TICKS', '25', 'One full micro window of stability after a flip.'],
                    ['MICRO_FLIP_PP', '6.0 pp', 'Direction change plus swing that arms the cooldown.'],
                ],
            },
            {
                title: 'Session controls',
                columns: ['Control', 'Default', 'Detail'],
                minWidth: 720,
                rows: [
                    ['Base stake', '1.0% of balance', 'Recomputed when the session starts, held flat for the run.'],
                    ['Staking', 'Flat — 1.0x', 'No martingale step: the edge is statistical, not recoverable by size.'],
                    ['Open contracts', '1 maximum', 'No averaging into a position.'],
                    ['Entries per 100 ticks', '10 maximum', 'Hard cap whatever the verdicts say.'],
                    ['Session take profit', '+2.5% of start balance', 'Stops the run and announces the target.'],
                    ['Session stop loss', '-4.0% of start balance', 'Stops the run and announces the stop.'],
                    ['Daily loss stop', '-8.0% of balance', 'Across sessions; requires a manual resumption.'],
                    ['Failed entry checks', '3 in a row', 'The bot stops and journals the reason instead of waiting forever.'],
                ],
            },
            {
                title: 'Verdict behaviour',
                columns: ['Verdict', 'Meaning', 'Action'],
                minWidth: 720,
                rows: [
                    ['EXECUTE TRADE', 'Master >= +4.0 pp, all three windows aligned, regime intact', 'One entry on the named contract, flat stake.'],
                    ['FADE', 'Micro burst contradicted by the macro baseline', 'Stand aside from the named side; no opposite entry without its own signal.'],
                    ['HOLD — NEUTRAL', 'Any gate failed: warming up, regime, cooling, floor or conflict', 'Wait for the next tick and re-read all three windows.'],
                ],
            },
        ],
        formulas: [
            {
                label: 'Cooldown clock',
                expression: 'cooldownUntil = tickIndex + 25 when a micro flip is detected',
                note: 'The engine counts ticks, not seconds, so a 1s index and a 2s index cool for the same amount of market data.',
            },
        ],
        bullets: [
            'A verdict can change on any tick; execution requires it to be EXECUTE when the contract is bought, not when the page was last read.',
            'The auto-cooldown is applied before the score gates, so a violent micro flip cannot be traded on the same tick that produced it.',
            'Risk controls never resize to recover a loss. Three failed entry checks in a row stop the session and journal why.',
        ],
    },
    {
        id: 'javascript',
        kicker: '5. JavaScript',
        title: 'Aggregation logic — JavaScript',
        intro:
            'The complete pure aggregation: three window reads, the weighted Master Score, the gates and one returned verdict object. This is the shape `engine-scoring.ts` ships in the app.',
        code: {
            language: 'javascript',
            text: `const WINDOWS = [
    { layer: 'Micro', size: 25,  weight: 0.50 },
    { layer: 'Mid',   size: 100, weight: 0.30 },
    { layer: 'Macro', size: 500, weight: 0.20 },
];

const FAIR = {
    over:    n => (9 - n) / 10,
    under:   n => n / 10,
    even:    () => 0.50,
    odd:     () => 0.50,
    matches: () => 0.10,
    differs: () => 0.90,
};

function wins(digit, side) {
    if (side.family === 'over')    return digit > side.target;
    if (side.family === 'under')   return digit < side.target;
    if (side.family === 'even')    return digit % 2 === 0;
    if (side.family === 'odd')     return digit % 2 === 1;
    if (side.family === 'matches') return digit === side.target;
    return digit !== side.target;                       // differs
}

function shares(slice) {
    const counts = new Array(10).fill(0);
    for (const d of slice) counts[d]++;
    return counts.map(c => (slice.length ? (c / slice.length) * 100 : 0));
}

function readWindow(digits, size, side) {
    const slice = digits.slice(-size);
    const hits = slice.filter(d => wins(d, side)).length;
    const actual = slice.length ? hits / slice.length : 0;
    const expected = FAIR[side.family](side.target);
    return {
        size,
        sample: slice.length,
        percentages: shares(slice),
        actual,
        expected,
        deltaPp: (actual - expected) * 100,
    };
}

function entropy(percentages) {
    return percentages.reduce((h, pct) => {
        const p = pct / 100;
        return p > 0 ? h - p * Math.log2(p) : h;
    }, 0);
}

function evaluate(digits, side, previousMicroDelta, tickIndex, cooldownUntil) {
    const windows = WINDOWS.map(w => ({ ...w, ...readWindow(digits, w.size, side) }));
    const [micro, mid, macro] = windows;
    const complete = windows.every(w => w.sample === w.size);

    // Master Score = 0.50 micro + 0.30 mid + 0.20 macro
    const master = windows.reduce((sum, w) => sum + w.deltaPp * w.weight, 0);
    const aligned = windows.filter(w => w.deltaPp >= 1.0).length;

    const spread = Math.max(...macro.percentages) - Math.min(...macro.percentages);
    const regimeBroken = spread > 7.0 || entropy(macro.percentages) < 2.95;

    const flipped = previousMicroDelta !== null &&
        Math.sign(previousMicroDelta) !== Math.sign(micro.deltaPp) &&
        Math.abs(micro.deltaPp - previousMicroDelta) >= 6.0;
    const nextCooldown = flipped ? tickIndex + 25 : cooldownUntil;
    const cooling = tickIndex < nextCooldown;

    const confidence = 100 * Math.min(1,
        0.65 * Math.min(Math.abs(master) / 12, 1) + 0.35 * aligned / 3);

    let verdict = 'HOLD';
    let reason = 'Windows conflict — confluence too weak to execute.';

    if (!complete) {
        reason = 'Warming up: macro baseline has ' + macro.sample + '/500 ticks.';
    } else if (regimeBroken) {
        reason = 'Regime break: the macro distribution is no longer digit-neutral.';
    } else if (cooling) {
        reason = 'Auto-cooldown after a micro-window flip.';
    } else if (Math.abs(master) < 4.0) {
        reason = 'Master Score below the +4.0 pp entry floor.';
    } else if (aligned === 3) {
        verdict = 'EXECUTE';
        reason = 'All three windows agree.';
    } else if (micro.deltaPp >= 4.0 && macro.deltaPp <= -1.0) {
        verdict = 'FADE';
        reason = 'Micro burst contradicts the macro baseline.';
    }

    return {
        market: side.market,
        strategy: side.label,
        verdict,                              // EXECUTE | FADE | HOLD
        confidence: Number(confidence.toFixed(1)),
        masterScore: Number(master.toFixed(2)),
        alignment: aligned,
        reason,
        headline: aligned === 3 && master >= 4.0
            ? 'All 3 windows show strong momentum for ' + side.label + '.'
            : aligned + ' of 3 windows aligned for ' + side.label + '.',
        windows,                              // the evidence behind the verdict
        cooldownUntil: nextCooldown,
    };
}`,
        },
    },
    {
        id: 'python',
        kicker: '6. Python',
        title: 'Aggregation logic — Python',
        intro:
            'The same engine for a Python writer or a bot backend. Same windows, same weights, same gates — only the returned payload differs.',
        code: {
            language: 'python',
            text: `import math
from dataclasses import dataclass, field

WINDOWS = [
    ("Micro", 25, 0.50),
    ("Mid", 100, 0.30),
    ("Macro", 500, 0.20),
]

FAIR = {
    "over":    lambda n: (9 - n) / 10,
    "under":   lambda n: n / 10,
    "even":    lambda n: 0.50,
    "odd":     lambda n: 0.50,
    "matches": lambda n: 0.10,
    "differs": lambda n: 0.90,
}


def wins(digit, family, target):
    if family == "over":    return digit > target
    if family == "under":   return digit < target
    if family == "even":    return digit % 2 == 0
    if family == "odd":     return digit % 2 == 1
    if family == "matches": return digit == target
    return digit != target                      # differs


def shares(slice_):
    counts = [0] * 10
    for d in slice_:
        counts[d] += 1
    total = len(slice_) or 1
    return [c / total * 100 for c in counts]


def entropy(percentages):
    h = 0.0
    for pct in percentages:
        p = pct / 100
        if p > 0:
            h -= p * math.log2(p)
    return h


def read_window(digits, size, family, target):
    slice_ = digits[-size:]
    hits = sum(1 for d in slice_ if wins(d, family, target))
    actual = hits / len(slice_) if slice_ else 0.0
    expected = FAIR[family](target)
    return {
        "size": size,
        "sample": len(slice_),
        "percentages": shares(slice_),
        "actual": actual,
        "expected": expected,
        "delta_pp": (actual - expected) * 100,
    }


def evaluate(digits, market, label, family, target,
             previous_micro_delta=None, tick_index=0, cooldown_until=0):
    windows = [
        {"layer": layer, "weight": weight,
         **read_window(digits, size, family, target)}
        for layer, size, weight in WINDOWS
    ]
    micro, mid, macro = windows
    complete = all(w["sample"] == w["size"] for w in windows)

    # Master Score = 0.50 micro + 0.30 mid + 0.20 macro
    master = sum(w["delta_pp"] * w["weight"] for w in windows)
    aligned = sum(1 for w in windows if w["delta_pp"] >= 1.0)

    spread = max(macro["percentages"]) - min(macro["percentages"])
    regime_broken = spread > 7.0 or entropy(macro["percentages"]) < 2.95

    flipped = (
        previous_micro_delta is not None
        and math.copysign(1, previous_micro_delta) != math.copysign(1, micro["delta_pp"])
        and abs(micro["delta_pp"] - previous_micro_delta) >= 6.0
    )
    next_cooldown = tick_index + 25 if flipped else cooldown_until
    cooling = tick_index < next_cooldown

    confidence = 100 * min(
        1.0, 0.65 * min(abs(master) / 12, 1.0) + 0.35 * aligned / 3
    )

    verdict, reason = "HOLD", "Windows conflict."
    if not complete:
        reason = f"Warming up: {macro['sample']}/500 ticks."
    elif regime_broken:
        reason = "Regime break: macro distribution is not digit-neutral."
    elif cooling:
        reason = "Auto-cooldown after a micro-window flip."
    elif abs(master) < 4.0:
        reason = "Master Score below the +4.0 pp entry floor."
    elif aligned == 3:
        verdict, reason = "EXECUTE", "All three windows agree."
    elif micro["delta_pp"] >= 4.0 and macro["delta_pp"] <= -1.0:
        verdict, reason = "FADE", "Micro burst contradicts the macro baseline."

    return {
        "market": market,
        "strategy": label,
        "verdict": verdict,
        "confidence": round(confidence, 1),
        "master_score": round(master, 2),
        "alignment": aligned,
        "reason": reason,
        "windows": windows,
        "cooldown_until": next_cooldown,
    }`,
        },
    },
    {
        id: 'blocks',
        kicker: '7. Blocks',
        title: 'Bot Builder equivalents',
        intro:
            'The same rules are readable from the Bot Builder without new code: three digit-frequency reads per layer, the weighted compare, and the existing risk and session blocks.',
        tables: [
            {
                title: 'Rule to block mapping',
                columns: ['Rule', 'Palette path', 'Block', 'Generated call'],
                minWidth: 900,
                rows: [
                    ['Micro share (25 ticks)', 'Digits', 'Digit frequency', 'Bot.getDigitFrequency(d, 25)'],
                    ['Mid share (100 ticks)', 'Digits', 'Digit frequency', 'Bot.getDigitFrequency(d, 100)'],
                    ['Macro share (500 ticks)', 'Digits', 'Digit frequency', 'Bot.getDigitFrequency(d, 500)'],
                    ['Losing digits stay cold', 'Digits', 'Two digits at or below a share', 'Bot.areDigitSharesAtOrBelow([0,1], 10.2, 500)'],
                    ['Hot / cold concentration', 'Digits', 'Hot / cold digit', 'Bot.getHotColdDigit("hottest", 500)'],
                    ['Streak / persistence', 'Digits', 'Digit streak', 'Bot.getDigitStreak()'],
                    ['High or low run', 'Digits', 'High run', "Bot.areLastDigitsHigh(7, 2, 'at_or_above')"],
                    ['Regime entropy', 'Observer', 'Entropy', 'Bot.observerValue(block_id, 0)'],
                    ['Data freshness', 'Observer control', 'Check market data freshness', 'Bot.observerCondition(block_id)'],
                    ['Minimum sample', 'Entry & monitoring', 'Require minimum sample size', 'Bot.observerCondition(block_id)'],
                    ['Cooldown after a flip', 'Entry & monitoring', 'Cool down after a loss', 'Bot.observerCondition(block_id)'],
                    ['Risk guard', 'Risk management', 'Risk guard allows trade', 'Bot.riskCanTrade()'],
                    ['Trade cap', 'Bot control', 'Trade limit reached', 'Bot.sessionTradeLimitReached(10)'],
                    ['Session stop', 'Bot control', 'Stop the bot', 'Bot.sessionStop(reason)'],
                ],
            },
        ],
        bullets: [
            'Observation first: run the bot on Demo with Observation mode on and confirm the journal explains every wait the page shows.',
            'The Free Bots templates already encode the 10.2% cold-digit pairs; this engine generalises them to a weighted three-window score.',
        ],
    },
];
