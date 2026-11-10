# Strategy specification

Every strategy returns the same structured signal. `direction: 'none'` with `suitable: false` is the
**NO TRADE** output and is a first-class result — no strategy forces a trade.

```ts
interface RiseFallSignal {
    strategyId: string;
    symbol: string;
    direction: 'rise' | 'fall' | 'none';
    riseScore: number;       // 0..100
    fallScore: number;       // 0..100
    confidence: number;      // 0..1, the winning score
    contributions: SignalContribution[];
    explanation: string;     // human-readable, names the numbers behind it
    regime: RegimeId;
    suitable: boolean;
    ticksAnalysed: number;
    evaluatedAt: number;
    fingerprint: string;     // one entry per symbol:direction:tick
}
```

A score is a **filter strength**, not a probability of winning, and the UI says so.

## Regime detection (`regime.ts`)

Reads at most the last 200 genuine ticks and needs 30 before it will name a regime. Trend strength is
the Kaufman **efficiency ratio** (net move ÷ total distance travelled), rescaled to 0..1; expansion /
contraction compare the mean absolute move of the recent third against the earlier window.

Outputs: `strong_uptrend`, `weak_uptrend`, `strong_downtrend`, `weak_downtrend`, `sideways`,
`high_volatility`, `low_volatility`, `volatility_expansion`, `possible_reversal`, `uncertain`.
`uncertain` is returned instead of a guess when there is not enough data.

## 1. Trend Continuation — implemented

Required confirmation beyond a bare MA crossover: **EMA alignment + market structure + momentum +
tick-direction consistency**, inside a regime the strategy declares suitable.

| Component | Weight | Reads |
|---|---|---|
| EMA alignment | 30 | fast > medium > slow (Rise) or the reverse (Fall); a mixed stack scores 0 |
| Market structure | 20 | higher highs **and** higher lows (Rise) / lower highs **and** lower lows (Fall) over two windows of `slowPeriod/3` |
| Trend strength | 20 | regime efficiency ratio, in the regime's direction |
| Momentum | 15 | fast EMA movement over `confirmationTicks`, normalised by the mean absolute tick |
| Tick consistency | 15 | share of the last `confirmationTicks` deltas in the dominant direction |

Default parameters (`DEFAULT_TREND_CONTINUATION`): fast 5, medium 13, slow 34, entry score 60,
confirmation 10 ticks, minimum 60 ticks, structure confirmation required. All editable in the panel.

Suitable regimes: strong/weak up and down trends, plus low volatility — and only when the regime's
direction agrees with the signal. Sideways, high volatility, volatility expansion, possible reversal
and uncertain are NO TRADE.

The explanation names the components that contributed, e.g.
`Rise 78/100 — ema alignment 28/30, market structure 20/20, trend strength 18/20, … . Regime: Strong
uptrend. The score is a filter strength, not a probability of winning.`

## 2. Breakout (`strategies/breakout.ts`)

The range is every quote except the newest block (`slowPeriod / 3` ticks), so the break is measured
against a level that existed **before** the current move.

| Component | Weight | Reads |
|---|---|---|
| Range break | 30 | distance past the range high/low, in mean raw tick moves (3 mean moves = full weight) |
| Volatility expansion | 20 | the regime classifier's expansion ratio |
| Follow-through | 20 | net move of the last `confirmationTicks`, same normalisation |
| Breakout structure | 15 | higher highs **and** higher lows (Rise) or the mirror image (Fall) |
| Regime | 15 | regime in `BREAKOUT_REGIMES` (expansion, high volatility, strong trends) |

Suitable only when the regime is a breakout regime, the follow-through points the same way, and (with
structure confirmation on) structure agrees. A stalled break scores nothing.

## 3. Pullback (`strategies/pullback.ts`)

Trades **with** an established trend after the market pulled back toward its own average and turned.

| Component | Weight | Reads |
|---|---|---|
| Trend | 30 | fast > medium > slow (Rise) or the reverse (Fall) |
| Pullback depth | 25 | distance of the pullback extreme from the medium EMA, in mean moves; peaks at 1 mean move, tolerance ±2 |
| Recovery tick | 25 | the newest tick moved back in the trend's direction |
| Momentum turn | 20 | net move across the confirmation window, in the trend's direction |

Suitable only with a trend, a recovery tick, a trend-suitable regime that is not pointing the other
way, and (with structure confirmation on) structure agreement.

## 4. Momentum (`strategies/momentum.ts`)

| Component | Weight | Reads |
|---|---|---|
| Move efficiency | 35 | `|net| / Σ|delta|` over `confirmationTicks` — most of the distance travelled is net |
| Acceleration | 25 | mean absolute move of the newer half ÷ the older half |
| Tick consistency | 20 | share of the window's deltas in the dominant direction |
| Regime agreement | 20 | the regime's own direction equals the move's |

Suitable only with efficiency ≥ 0.35, no `possible_reversal` regime, and no regime or tick-direction
contradiction. A choppy grind scores low by construction.

## 5. Reversal (`strategies/reversal.ts`)

Only an **exhausted** move is traded against: a real prior move, a swing back of at least 35% of it
(`MIN_REVERSAL_SHARE`), a tick-direction flip, and either the classifier's `possible_reversal` marker
or a price stretched from its slow average.

| Component | Weight | Reads |
|---|---|---|
| Prior move | 20 | net move before the confirmation window, for context |
| Reversal size | 30 | share of the prior move given back |
| Tick flip | 25 | share of recent ticks moving against the prior move |
| Stretch from average | 15 | distance from the slow EMA, in mean moves |
| Regime marker | 10 | `possible_reversal` |

## 6. Volatility Expansion (`strategies/volatility-expansion.ts`)

| Component | Weight | Reads |
|---|---|---|
| Range expansion | 35 | recent third's mean absolute move ÷ the earlier window's (over `max(40, slowPeriod×2)` deltas, so the quiet stretch is still inside the window) |
| Directional bias | 30 | net move of the widened section, in mean moves |
| Deviation | 20 | standard deviation of the window's deltas |
| Regime | 15 | `EXPANSION_REGIMES` |

Suitable when the range really widened (≥ 0.3) **and** the widened section has a side that matches the
signal — a widening market with no direction is NO TRADE.

## 7. Confluence (`strategies/confluence.ts`)

Owns no rule: it reads the other seven signals **for the same tick** and votes.

- Only signals with `direction !== 'none'` **and** `suitable: true` are voters.
- The side with more voters wins; a tie goes to the higher summed score.
- The score is the **average of the agreeing strategies' own scores** (contributions carry
  `weight = 100 / agreeing`), so two voters at 80/100 read as 80/100.
- `CONFLUENCE_MIN_AGREEMENT = 2`: one voter is never enough, however strong.
- `CONFLUENCE_DISSENT_SCORE = 80`: another strategy scoring 80+ on the other side refuses the entry.

## 8. Tick Sequence (`strategies/tick-sequence.ts`)

| Component | Weight | Reads |
|---|---|---|
| Sequence length | 40 | trailing run of same-direction ticks (`MIN_RUN = 3`; 7+ ticks = full weight) |
| Sequence purity | 20 | share of the confirmation window's deltas moving with the run |
| Net move | 25 | net move across the window, in mean moves |
| Regime agreement | 20 | the regime's direction equals the run's |

Suitable only with a run of at least three ticks, a net move that agrees, no `possible_reversal`
regime and no regime contradiction. An alternating tape is NO TRADE — it is what a coin flip looks
like.

## Shared assembly (`strategies/shared.ts`)

`assembleSignal` turns a strategy's components into the signal object: it sums each side's
contributions into `riseScore`/`fallScore`, sets `direction` only when the winning side reaches
`minScore`, lets the strategy's own `suitableWhen` veto it (reported as NO TRADE with the reason), and
writes the explanation including the regime label and the "filter strength, not a probability"
sentence. All eight strategies share `StrategyConfig` (fast 5, medium 13, slow 34, entry score 60,
confirmation 10, minimum 60 ticks, structure on) — the panel edits one set of numbers for every
strategy, and the backtester reads the same object.
