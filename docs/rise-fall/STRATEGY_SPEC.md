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

## 2–8 — not implemented yet (Phase C)

Breakout, Pullback, Momentum, Reversal, Volatility Expansion, Multi-Indicator Confluence and Tick
Sequence are **not** in this build. Their required parameters, entry conditions and explanations are
in the brief (§10); each must return the same signal object above and pass through the same execution
service. No placeholder strategy pretends to exist.
