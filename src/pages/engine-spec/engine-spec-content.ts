/**
 * Written specification for the multi-window digit engine.
 *
 * This file is content only: the tab renders it, nothing here trades or
 * evaluates a market. Every rule is stated once so the page, and anyone
 * building the equivalent Bot Builder blocks, read the same numbers.
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
    { label: 'Micro window', value: '30', hint: 'ticks - momentum and clustering' },
    { label: 'Macro window', value: '750', hint: 'ticks - long-run distribution' },
    { label: 'Deviation trigger', value: '3.5 pp', hint: 'from the 10% baseline' },
    { label: 'Minimum z-score', value: '1.5', hint: 'one-sided significance' },
    { label: 'Cooldown', value: '3 / 9 / 21', hint: 'ticks after win / loss / 2 losses' },
];

export const SPEC_SECTIONS: SpecSectionData[] = [
    {
        id: 'windows',
        kicker: '1. Architecture',
        title: 'Dual-window architecture',
        intro:
            'Two rolling windows are read on every tick: a fast window for the move that is happening now, and a slow window for what the market has actually been paying. A trade needs both to agree - the fast window supplies the dislocation, the slow window vetoes it when the long-run distribution has drifted away from fair.',
        tables: [
            {
                title: 'The two windows',
                columns: ['Layer', 'Window', 'Refresh', 'Job in the decision', 'Reads'],
                minWidth: 860,
                rows: [
                    [
                        'Micro (fast)',
                        'Last 30 ticks',
                        'Every tick',
                        'Detect the immediate dislocation, clustering and short-term skew that creates the edge',
                        'p_m(d), delta(d), gamma(d), z(d), digit streak, parity share',
                    ],
                    [
                        'Macro (baseline)',
                        'Last 750 ticks',
                        'Every tick (rolling)',
                        'Establish the true distribution and refuse a trade when the market is not behaving like a 10% digit market',
                        'p_M(d), entropy H, chi-square band, max-min share spread',
                    ],
                ],
            },
        ],
        formulas: [
            {
                label: 'Micro share',
                expression: 'p_m(d) = n_m(d) / 30',
                note: 'Share of the last 30 ticks that ended in digit d.',
            },
            {
                label: 'Macro share',
                expression: 'p_M(d) = n_M(d) / 750',
                note: 'Share of the last 750 ticks. A fair market holds every digit near 10%.',
            },
            {
                label: 'Baseline deviation',
                expression: 'delta(d) = (p_m(d) - 0.10) x 100',
                note: 'Percentage points away from the 10% baseline. The entry threshold is |delta| >= 3.5.',
            },
            {
                label: 'Macro-relative deviation',
                expression: 'gamma(d) = (p_m(d) - p_M(d)) x 100',
                note: 'Percentage points away from what this market has actually been paying, not from theory.',
            },
            {
                label: 'Significance',
                expression: 'z(d) = (p_m(d) - p_M(d)) / sqrt( p_M(d) x (1 - p_M(d)) / 30 )',
                note: 'How large the micro move is compared with binomial noise. A 30-tick window needs z >= 1.5.',
            },
            {
                label: 'Macro entropy',
                expression: 'H = -sum p_M(d) x log2 p_M(d)',
                note: 'Uniformity of the baseline in bits. Ceiling log2(10) = 3.3219; below 2.95 bits the market is structurally clustered, not digit-neutral.',
            },
            {
                label: 'Micro uniformity',
                expression: 'chi2_m = sum (n_m(d) - 3)^2 / 3',
                note: 'Expected count per digit in 30 ticks is 3, with 9 degrees of freedom. Large values mean a real skew, not sampling noise.',
            },
        ],
    },
    {
        id: 'confluence',
        kicker: '2. Confluence',
        title: 'Filtering rules - when a trade may fire',
        intro:
            'Every gate below must pass on the same tick. A gate that fails does not degrade the entry, it cancels it: the engine waits, journals the reason, and re-reads the windows on the next tick.',
        tables: [
            {
                title: 'Gate stack (all ANDed)',
                columns: ['Gate', 'Condition', 'If it fails'],
                minWidth: 820,
                rows: [
                    ['G1 Sample integrity', 'n_m = 30, n_M = 750, newest tick age <= 2 s, no gap > 5 s', 'Wait for data'],
                    ['G2 Regime intact', 'Every p_M(d) in [7.0%, 13.0%] and H >= 2.95 bits', 'Skip - regime break'],
                    ['G3 Baseline agreement', '|p_M(target) - 10| <= 2.5 pp', 'Skip - market already biased'],
                    ['G4 Micro dislocation', 'delta(target) >= +3.5 pp (hot) or <= -3.5 pp (cold)', 'Wait - no edge'],
                    ['G5 Significance', 'z(target) >= 1.5 in the traded direction', 'Wait - noise'],
                    ['G6 Persistence', 'Same-sign gamma in both 15-tick halves, or digit streak >= 2', 'Wait - no persistence'],
                    ['G7 Non-conflict', 'No second digit within 0.5 pp of the target in the same direction', 'Wait - ambiguous'],
                    ['G8 Execution clearance', 'No open contract, risk guard true, trade count below cap', 'Wait - blocked'],
                    ['G9 Cooldown clear', 'Ticks since settlement >= 3 (win) / 9 (loss) / 21 (two losses)', 'Wait - cooling'],
                ],
            },
        ],
        bullets: [
            'Noise veto: |delta| > 8 pp on the target with z < 1.5 is a single cluster, not a distribution - wait 5 ticks before reading again.',
            'Parity veto: an even/odd split between 45% and 55% on the micro window is a coin flip - no Even/Odd contract may fire.',
            'Ambiguity veto: two digits within 0.5 pp in the same direction means the market has not chosen a skew - skip the tick.',
            'Regime veto: a macro max-min share spread above 7 pp means the index is no longer paying anything close to 10% a digit - no digit contract at all.',
            'Directional veto: the micro window must deviate in the same direction as the contract loses to. A hot losing digit blocks an Over/Under entry even when the entry digit itself looks good.',
        ],
    },
    {
        id: 'triggers',
        kicker: '3. Confirmation',
        title: 'Strategy confirmation triggers',
        intro:
            'Each contract family has its own confirmation, but they share the same gate stack. The trigger decides which contract is bought; the gates decide whether it may be bought at all.',
        tables: [
            {
                title: 'Per-strategy entry rules',
                columns: ['Strategy', 'Contract', 'Share condition', 'Confirmation', 'Veto'],
                minWidth: 900,
                rows: [
                    [
                        'Over 2 bias',
                        'DIGITOVER 2',
                        'Losing digits 0,1,2 take <= 6 of 30 micro ticks and each macro share <= 10.5%',
                        'Last 2 ticks both > 2',
                        'A 0/1/2 streak of 2+, or the micro losing share >= 26.7%',
                    ],
                    [
                        'Under 7 bias',
                        'DIGITUNDER 7',
                        'Losing digits 7,8,9 take <= 6 of 30 micro ticks and each macro share <= 10.5%',
                        'Last 2 ticks both < 7',
                        'A high run of 3+ digits at or above 7',
                    ],
                    [
                        'Even/Odd dominance',
                        'DIGITEVEN / DIGITODD',
                        'Parity share delta >= +5.0 pp on the micro window; macro parity between 45% and 55%',
                        'Two digits of the opposite parity, then a switch - buy the reversal',
                        'Micro parity between 45% and 55%, or a mixed pair (no signal)',
                    ],
                    [
                        'Matches continuation',
                        'DIGITMATCHES d',
                        'p_m(d) >= 16.7% (5 of 30) with a macro share between 9% and 12%',
                        'The same digit twice within the last 3 ticks',
                        'p_m(d) > 25% - chasing an exhausted cluster',
                    ],
                    [
                        'Differs exhaustion',
                        'DIGITDIFFERS d',
                        'p_m(d) = 0 of 30 and macro share <= 8%',
                        '10 ticks with no d, z >= 1.5 against the macro share',
                        'Macro share > 12% - the digit is not genuinely cold',
                    ],
                ],
            },
        ],
    },
    {
        id: 'timing',
        kicker: '4. Timing',
        title: 'Dynamic entry, streaks and cooldowns',
        intro:
            'Thresholds are fixed per engine run, not tuned mid-session. Cooldowns scale with the outcome so a losing stretch cannot turn into a rate race, and every wait is measured in ticks rather than seconds so a 1s index behaves like a 1s index.',
        tables: [
            {
                title: 'Entry and timing parameters',
                columns: ['Parameter', 'Default', 'Rule'],
                minWidth: 720,
                rows: [
                    ['MICRO_WINDOW', '30 ticks', 'Fast window. Never shortened to force an entry.'],
                    ['MACRO_WINDOW', '750 ticks', 'Baseline window. A full 750-tick history is required before any entry.'],
                    ['DELTA_TRIGGER', '3.5 pp', 'Minimum deviation of the target digit from 10% on the micro window.'],
                    ['PARITY_TRIGGER', '5.0 pp', 'Minimum micro deviation for an Even/Odd contract.'],
                    ['Z_MIN', '1.5', 'One-sided significance of the micro move against the macro share.'],
                    ['PERSISTENCE', '2 of 2 halves', 'Both 15-tick halves must deviate in the same direction, or streak >= 2.'],
                    ['TICK_GAP_MAX', '5 s', 'A longer gap suspends entries until the windows refill.'],
                    ['SETTLE_BLACKOUT', '2 ticks', 'No entry in the two ticks after a contract settles.'],
                    ['MAX_ENTRIES_100', '10', 'Hard cap on entries per rolling 100 ticks, whatever the gates say.'],
                ],
            },
            {
                title: 'Outcome, stake and cooldown',
                columns: ['Last outcome', 'Next stake', 'Cooldown', 'Re-entry requires'],
                minWidth: 700,
                rows: [
                    ['Win', 'Base stake', '3 ticks', 'The full gate stack, re-confirmed'],
                    ['1 loss', 'Base x 1.25', '9 ticks', 'The full gate stack plus a fresh confirmation'],
                    ['2 losses', 'Base x 1.5625', '21 ticks', 'The full gate stack plus a fresh confirmation'],
                    ['3 losses', 'Stopped', 'Session end', 'Manual restart - the session does not resume itself'],
                ],
            },
        ],
    },
    {
        id: 'risk',
        kicker: '5. Execution',
        title: 'Risk management and volatility filtering',
        intro:
            'Position size is a share of the balance, never a fixed number, and the loss step is capped. Volatility indices are filtered before any contract is considered: a 1s index that is too choppy is skipped rather than traded harder.',
        tables: [
            {
                title: 'Session risk controls',
                columns: ['Control', 'Default', 'Detail'],
                minWidth: 720,
                rows: [
                    ['Base stake', '1.0% of balance', 'Recomputed when the session starts, held flat for the run.'],
                    ['Loss step', 'x1.25, max 2 steps', 'Never above 1.5625x the base stake. No unbounded martingale.'],
                    ['Per-trade exposure', '<= 1.5% of balance', 'A trade is skipped when the stepped stake breaches it.'],
                    ['Session take profit', '+2.5% of start balance', 'Stops the run and announces the target.'],
                    ['Session stop loss', '-4.0% of start balance', 'Stops the run and announces the stop.'],
                    ['Open contracts', '1 maximum', 'No averaging into a losing position.'],
                    ['Trade cap', '250 contracts per run', 'Bot control limit; the run stops at the cap.'],
                    ['Daily loss stop', '-8.0% of balance', 'Across sessions; requires a manual resumption.'],
                ],
            },
            {
                title: 'Index filter - when a market is tradable',
                columns: ['Index', 'Macro spread', 'Entropy floor', 'Choppiness ceiling', 'Extra condition'],
                minWidth: 860,
                rows: [
                    ['Volatility 10 / 25', '<= 4.0 pp', '>= 3.05 bits', 'CHOP <= 61.8', 'Symmetric digit shares'],
                    ['Volatility 50 / 75', '<= 5.5 pp', '>= 3.00 bits', 'CHOP <= 65', 'No single digit above 13%'],
                    ['Volatility 100', '<= 6.0 pp', '>= 2.95 bits', 'CHOP <= 68', 'No single digit above 13%'],
                    ['1s Volatility indices', '<= 4.0 pp', '>= 3.05 bits', 'CHOP <= 61.8', 'Tick-interval coefficient of variation <= 25%'],
                    ['Any index in a crisis', '> 7.0 pp', 'any', 'CHOP > 70', 'Skip all digit contracts'],
                ],
            },
        ],
        formulas: [
            {
                label: 'Choppiness index',
                expression: 'CHOP = 100 x log10( sum TR(1..n) / (maxHigh - minLow) ) / log10(n)',
                note: 'Above 70 the index is choppy; below 61.8 it is directional enough for a digit edge to persist.',
            },
        ],
    },
    {
        id: 'pseudocode',
        kicker: '6. Logic',
        title: 'Gate pseudo-code',
        intro:
            'The evaluation is a pure function of the two windows: same ticks in, same decision out. It returns a plan or a wait reason, never a position size of its own.',
        code: {
            language: 'pseudo-code',
            text: `features = readWindows()            // 30 micro + 750 macro ticks

if !features.complete:                 return WAIT("sample")
if features.macroSpread > 7.0:         return SKIP("regime bias")
if features.entropy < H_FLOOR:         return SKIP("structural cluster")

candidates = []
for d in 0..9:
    delta = (features.micro[d] - 0.10) * 100
    gamma = (features.micro[d] - features.macro[d]) * 100
    z     = gamma / (100 * sqrt(features.macro[d] * (1 - features.macro[d]) / 30))
    if abs(delta) >= 3.5 and abs(z) >= 1.5 and persists(d, features):
        candidates.push({ d, delta, gamma, z })

if candidates.length == 0:             return WAIT("no dislocation")
if crowded(candidates, 0.5):           return WAIT("ambiguous")

plan = pickStrategy(candidates, features)   // Over/Under, Even/Odd, Matches/Differs
if plan == null:                       return WAIT("no contract edge")
if !risk.allows(plan):                 return WAIT("risk guard")
if ticksSinceSettle < cooldown(lastOutcome):
                                       return WAIT("cooldown")

return ENTER(plan)`,
        },
    },
    {
        id: 'blocks',
        kicker: '7. Blocks',
        title: 'Bot Builder equivalents',
        intro:
            'Every rule above already has a block in the Bot Builder palette, so the specification can be built without new code. The last column is the generated engine call.',
        tables: [
            {
                title: 'Rule to block mapping',
                columns: ['Rule', 'Palette path', 'Block', 'Generated call'],
                minWidth: 900,
                rows: [
                    ['Micro share (30 ticks)', 'Digits', 'Digit frequency', 'Bot.getDigitFrequency(d, 30)'],
                    ['Macro share (750 ticks)', 'Digits', 'Digit frequency', 'Bot.getDigitFrequency(d, 750)'],
                    ['Cold losing digits at or below a ceiling', 'Digits', 'Two digits at or below a share', 'Bot.areDigitSharesAtOrBelow([0,1], 10.2, 1000)'],
                    ['Streak / persistence', 'Digits', 'Digit streak', 'Bot.getDigitStreak()'],
                    ['High or low run', 'Digits', 'High run', "Bot.areLastDigitsHigh(7, 2, 'at_or_above')"],
                    ['Data freshness', 'Observer control', 'Check market data freshness', 'Bot.observerCondition(block_id)'],
                    ['Minimum sample', 'Entry & monitoring', 'Require minimum sample size', 'Bot.observerCondition(block_id)'],
                    ['After-loss cooldown', 'Entry & monitoring', 'Cool down after a loss', 'Bot.observerCondition(block_id)'],
                    ['Market ranking', 'Market intelligence', 'Rank markets', 'Bot.rankMarkets()'],
                    ['Risk guard', 'Risk management', 'Risk guard allows trade', 'Bot.riskCanTrade()'],
                    ['Trade cap', 'Bot control', 'Trade limit reached', 'Bot.sessionTradeLimitReached(250)'],
                    ['Entry check log', 'Bot control', 'Entry check', 'Bot.entryCheckFailed(reason)'],
                    ['Session stop', 'Bot control', 'Stop the bot', 'Bot.sessionStop(reason)'],
                ],
            },
        ],
        bullets: [
            'Observation first: load a bot, run it on Demo with Observation mode on, and confirm the journal shows the same reason this page lists for a wait.',
            'The Free Bots templates already encode the Over 1 / Under 8 share gate at 10.2% and below; this page generalises the same gate to the two-window framework.',
        ],
    },
];
