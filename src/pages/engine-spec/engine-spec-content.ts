/**
 * Written specification for the multi-window confluence engine.
 *
 * This file is content only. The live verdict, tables and charts render from
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
    { label: 'Micro window', value: '25', hint: 'ticks · default weight 0.50 · momentum' },
    { label: 'Mid window', value: '100', hint: 'ticks · default weight 0.30 · validation' },
    { label: 'Macro window', value: '500', hint: 'ticks · default weight 0.20 · baseline' },
    { label: 'Entry floor', value: '±4.0 pp', hint: 'Master Score, configurable' },
    { label: 'Alignment', value: 'Strong', hint: 'all three windows on side' },
    { label: 'Cooldown', value: '25 ticks', hint: 'after a micro flip, configurable' },
];

export const SPEC_SECTIONS: SpecSectionData[] = [
    {
        id: 'windows',
        kicker: '1. Architecture',
        title: 'One stream, three simultaneous windows',
        intro:
            'The engine reads the market already selected on the Digits tab through the shared public feed. There is no second socket and no fabricated data: last digits come from the quote precision the market data supplies, and the three windows slide over the same validated tick array. None of them resets; they all advance together.',
        tables: [
            {
                title: 'The three windows',
                columns: ['Layer', 'Window', 'Default weight', 'Job in the decision', 'Evidence it contributes'],
                minWidth: 900,
                rows: [
                    [
                        'Micro',
                        'Last 25 ticks',
                        '0.50',
                        'Immediate momentum: is the strategy’s winning share above its fair baseline right now?',
                        'share, delta, z-score, short-term digit drift',
                    ],
                    [
                        'Mid',
                        'Last 100 ticks',
                        '0.30',
                        'Validation: does short-term behaviour survive a longer window, or is it a burst?',
                        'share, delta, confidence interval, digit trend',
                    ],
                    [
                        'Macro',
                        'Last 500 ticks',
                        '0.20',
                        'Baseline: what has the index actually been paying, and is it still digit-neutral?',
                        'share, delta, entropy, max-min spread',
                    ],
                ],
            },
        ],
        formulas: [
            {
                label: 'Window share',
                expression: 'share_w = winning ticks_w / ticks_w',
                note: 'Fraction of that window landing on the selected contract’s winning digits.',
            },
            {
                label: 'Window delta',
                expression: 'delta_w = (share_w - baseline) x 100',
                note: 'Percentage points above or below the mathematical fair share.',
            },
            {
                label: 'Observation counts',
                expression: 'micro 25 · mid 100 · macro 500',
                note: 'Every panel shows how many observations each window really holds. No verdict is issued until all three are full.',
            },
        ],
        bullets: [
            'The windows overlap: micro is contained in mid, mid in macro. They are evidence at three horizons, not three independent confirmations.',
            'A market switch clears every window-derived value and re-initialises from the new market’s genuine history.',
            'The page consumes digits already extracted upstream, so the last digit always respects the instrument’s real decimal precision.',
            'The verdict is HOLD — BLOCKED while the stream is disconnected, the quote precision is unresolved, or a tick gap has left the windows unhealed.',
        ],
    },
    {
        id: 'scoring',
        kicker: '2. Scoring',
        title: 'Fair baselines and the Master Score',
        intro:
            'Every contract has a mathematical fair share. The engine measures the selected strategy against that share independently in each window, then blends the three deviations with configurable weights. The Master Score is a weighted deviation in percentage points — it is never a probability of winning.',
        tables: [
            {
                title: 'Winning digits and fair baselines',
                columns: ['Strategy', 'Winning digits', 'Expected probability'],
                minWidth: 620,
                rows: [
                    ['Under 1', '0', '10%'],
                    ['Under 2', '0–1', '20%'],
                    ['Under 3', '0–2', '30%'],
                    ['Under 4', '0–3', '40%'],
                    ['Under 5', '0–4', '50%'],
                    ['Under 6', '0–5', '60%'],
                    ['Under 7', '0–6', '70%'],
                    ['Under 8', '0–7', '80%'],
                    ['Under 9', '0–8', '90%'],
                    ['Over 1', '2–9', '80%'],
                    ['Over 2', '3–9', '70%'],
                    ['Over 3', '4–9', '60%'],
                    ['Over 4', '5–9', '50%'],
                    ['Over 5', '6–9', '40%'],
                    ['Over 6', '7–9', '30%'],
                    ['Over 7', '8–9', '20%'],
                    ['Over 8', '9', '10%'],
                    ['Even', '0,2,4,6,8', '50%'],
                    ['Odd', '1,3,5,7,9', '50%'],
                    ['Matches d', 'selected digit d', '10%'],
                    ['Differs d', 'all except d', '90%'],
                ],
            },
            {
                title: 'Default Master Score weights',
                columns: ['Window', 'Default', 'Effect'],
                minWidth: 560,
                rows: [
                    ['Micro (25)', '50%', 'Largest say: rewards immediate momentum.'],
                    ['Mid (100)', '30%', 'Confirms the move is not a three-tick burst.'],
                    ['Macro (500)', '20%', 'Anchors the score to the long-run baseline.'],
                ],
            },
        ],
        formulas: [
            {
                label: 'Master Score',
                expression: 'Master = micro x w_micro + mid x w_mid + macro x w_macro',
                note: 'Defaults 0.50 / 0.30 / 0.20. Positive favours the strategy; negative leans against it.',
            },
            {
                label: 'Worked example',
                expression: '(10.0 x 0.50) + (6.0 x 0.30) + (2.0 x 0.20) = +7.2 pp',
                note: 'Every panel shows the same calculation with the live values, so the total can be recomputed by hand.',
            },
            {
                label: 'Digit baseline',
                expression: 'expected share of one digit = 10%',
                note: 'Used by the digit table for every digit 0–9, independent of the selected contract.',
            },
        ],
        bullets: [
            'Weights are configurable; they are normalised so they always sum to 100%.',
            'Under N and Over N read the same distribution from opposite sides: Under 7 wins on 0–6, Over 6 wins on 7–9.',
            'The score is explicitly not a win probability, a payout estimate or a profit forecast.',
        ],
    },
    {
        id: 'alignment',
        kicker: '3. Alignment',
        title: 'Window alignment and confluence validation',
        intro:
            'A large Master Score is not enough. A separate validator asks whether the three horizons actually agree with the selected strategy, and refuses a loud micro window that the longer windows contradict.',
        tables: [
            {
                title: 'Alignment classifications',
                columns: ['Classification', 'Condition', 'Meaning'],
                minWidth: 820,
                rows: [
                    [
                        'Strong',
                        'All three windows at or above the alignment floor',
                        'Every horizon supports the strategy; the strongest case for eligibility.',
                    ],
                    [
                        'Moderate',
                        'Micro and mid aligned, macro within the floor of neutral',
                        'Short and medium horizons agree but the baseline has not confirmed.',
                    ],
                    [
                        'Conflict',
                        'Any window materially on the opposite side',
                        'The horizons disagree; a burst against the baseline is not an entry.',
                    ],
                    [
                        'None',
                        'No window clears the alignment floor',
                        'The market is close to fair value; nothing to act on.',
                    ],
                ],
            },
        ],
        bullets: [
            'The alignment floor defaults to 1.0 pp and the opposing floor to 3.0 pp; both are configurable.',
            'EXECUTE requires the alignment requirement chosen in settings: Strong by default, Moderate optionally.',
            'The three windows share ticks, so alignment is a consistency check, not independent statistical proof.',
        ],
    },
    {
        id: 'reliability',
        kicker: '4. Reliability',
        title: 'Statistical reliability engine',
        intro:
            'The same deviation in 25 ticks and in 500 ticks does not carry the same weight of evidence. Each window publishes its sample size, a binomial standard error, a two-sided confidence interval and a z-score, and the engine classifies what that evidence can support.',
        formulas: [
            {
                label: 'Standard error',
                expression: 'SE = sqrt(p x (1 - p) / n)',
                note: 'p is the fair baseline, n the observations in that window. Reported in percentage points.',
            },
            {
                label: 'Confidence interval',
                expression: 'share ± z x SE',
                note: 'z = 1.96 for a two-sided 95% interval. Clamped to 0–100%.',
            },
            {
                label: 'Significance',
                expression: 'z-score = (share - baseline) / SE',
                note: 'A window is significant when |z| >= 1.96 and complete.',
            },
        ],
        tables: [
            {
                title: 'Reliability classifications',
                columns: ['Classification', 'Per window', 'Overall verdict gate'],
                minWidth: 760,
                rows: [
                    ['Reliable', '|z| >= 1.96, window complete', 'Two or more windows significant.'],
                    ['Limited', '|z| >= 1.0 but below 1.96', 'Two or more windows carry usable evidence.'],
                    ['Insufficient', 'Window incomplete or |z| < 1.0', 'Fewer than two usable windows: no signal.'],
                ],
            },
        ],
        bullets: [
            'The binomial approximation assumes independent ticks. Genuine tick streams can be serially dependent, so intervals are indicative, not exact.',
            'Reliability is disclosed, never oversold: statistical significance is not proof of profitability.',
            'A high frequency deviation does not guarantee the next tick; only out-of-sample evidence could test that, and this page does not claim it.',
        ],
    },
    {
        id: 'verdicts',
        kicker: '5. Verdict',
        title: 'One consolidated verdict',
        intro:
            'Every window, validator and gate collapses into exactly one of five outputs. The verdict explains itself with the calculated values that produced it.',
        tables: [
            {
                title: 'Verdict gate stack (evaluated in order)',
                columns: ['Order', 'Condition', 'Result'],
                minWidth: 820,
                rows: [
                    ['1', 'Any window incomplete', 'HOLD — BLOCKED'],
                    ['2', 'Stream down, precision unresolved or unhealed tick gap', 'HOLD — BLOCKED'],
                    ['3', 'Macro spread > 7 pp or entropy < 2.95 bits', 'HOLD — BLOCKED (regime)'],
                    ['4', 'Cooldown active', 'HOLD — BLOCKED'],
                    ['5', 'Statistical reliability insufficient', 'HOLD — BLOCKED'],
                    ['6', 'A window materially opposes the strategy', 'HOLD — CONFLICT'],
                    ['7', '|Master Score| below the entry floor', 'HOLD — NEUTRAL'],
                    ['8', 'Master >= floor and the alignment requirement passes', 'EXECUTE TRADE'],
                    ['9', 'Master <= -floor and the opposite setup independently qualifies', 'FADE'],
                    ['10', 'Score clears the floor but alignment or the opposite leg fails', 'HOLD — CONFLICT'],
                ],
            },
            {
                title: 'Output contract',
                columns: ['Field', 'Content', 'Example'],
                minWidth: 760,
                rows: [
                    ['Target market', 'Selected volatility index', 'Volatility 75 (1s)'],
                    ['Selected strategy', 'Family plus barrier or prediction digit', 'Under 7'],
                    ['Final verdict', 'EXECUTE TRADE · FADE · HOLD — NEUTRAL · HOLD — CONFLICT · HOLD — BLOCKED', 'HOLD — NEUTRAL'],
                    ['Master Score', 'Weighted deviation in percentage points', '+7.2 pp'],
                    ['Alignment', 'Strong · Moderate · Conflict · None', 'Strong'],
                    ['Reliability', 'Reliable · Limited · Insufficient', 'Limited'],
                    ['Cooldown', 'Active with ticks remaining, or inactive', 'Inactive'],
                    ['Summary', 'A sentence naming the values behind the decision', 'All three windows clear the alignment floor…'],
                ],
            },
        ],
        bullets: [
            'EXECUTE TRADE means the setup is eligible for further evaluation. It does not mean an order has been placed.',
            'FADE names the opposite contract only after that opposite setup passes its own alignment and reliability checks. A negative score alone is never an opposite trade.',
            'No risk rule, account permission or execution path is bypassed by a verdict.',
        ],
    },
    {
        id: 'cooldown',
        kicker: '6. Cooldown',
        title: 'Micro-window shift and auto-cooldown',
        intro:
            'The engine watches how quickly the micro window’s delta moves. A sharp reversal, or a previously aligned set of windows flipping into conflict, suspends new signals until stability returns.',
        formulas: [
            {
                label: 'Micro delta change',
                expression: 'change = micro_delta_now - micro_delta_previous',
                note: 'Measured between consecutive evaluations of the same market and strategy.',
            },
            {
                label: 'Micro delta velocity',
                expression: 'velocity = change / ticks elapsed',
                note: 'Percentage points per tick; reported next to the verdict.',
            },
            {
                label: 'Cooldown clock',
                expression: 'cooldown_until = tick_index + cooldown_ticks',
                note: 'Counted in ticks, never seconds, so every index cools over the same amount of market data.',
            },
        ],
        bullets: [
            'A direction change with a swing at or above the flip threshold (default 6.0 pp) arms the cooldown and marks the signal CONFLUENCE_BROKEN.',
            'A previously aligned set of windows that flips into conflict also arms it, even without a large single-tick move.',
            'Cooldown duration and the flip threshold are configurable.',
            'A market-data interruption is handled separately: the block lasts until the 500-tick macro window has refilled with genuine post-gap ticks, so a timer alone can never clear it.',
            'Genuine ticks keep arriving and all windows keep recalculating during cooldown; only new signals are suspended.',
        ],
    },
    {
        id: 'digits',
        kicker: '7. Digits',
        title: 'Individual digit distribution',
        intro:
            'Strategy analysis is only half the picture. The digit table exposes all ten digits in all three windows so the user can see which digits are actually driving the strategy result.',
        tables: [
            {
                title: 'What each digit column means',
                columns: ['Column', 'Reading'],
                minWidth: 620,
                rows: [
                    ['Micro / Mid / Macro', 'That digit’s share of the window, in percent.'],
                    ['Baseline', '10% — the fair share of one digit on a ten-digit wheel.'],
                    ['vs 10%', 'Macro share minus 10%, in percentage points.'],
                    ['Trend', 'Micro share minus macro share: rising, falling or flat.'],
                    ['● marker', 'The digit is in the selected contract’s winning set.'],
                ],
            },
        ],
        bullets: [
            'The chart mirrors the table: three bars per digit, one per window, against the 10% baseline.',
            'A digit can be hot in micro and cold in macro; the trend column is where that divergence shows.',
            'Shares describe ticks already observed. They do not predict the next digit.',
        ],
    },
    {
        id: 'limits',
        kicker: '8. Scope',
        title: 'What this tab does and does not do',
        intro:
            'This tab is the analysis and evidence layer. It is deliberately separate from execution so a verdict can never buy a contract on its own.',
        bullets: [
            'Read-only: it opens no authenticated socket, places no order, sizes no stake and never switches account mode.',
            'The signal journal is a virtual observer for this session: it records qualifying verdicts and checks the next genuine tick. It is kept apart from any purchased-contract result.',
            'No backtesting or parameter optimisation is run here, and no threshold is presented as proven profitable.',
            'Blockly bots keep their existing digit and observer blocks; this engine does not add or replace Bot Builder blocks.',
            'All numbers come from genuine Deriv public market data — never random, simulated or interpolated ticks.',
        ],
    },
];
