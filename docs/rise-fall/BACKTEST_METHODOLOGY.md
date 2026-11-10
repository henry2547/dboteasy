# Backtest & ranking methodology

`backtest.ts` runs one walk-forward pass per ranking request over the ticks the feed already holds
(1,000 genuine ticks, newest last). It is a **measurement of one fixed assumption**, never a forecast
and never a real return.

## The rules, exactly as implemented

- **Zero lookahead, structurally.** At index `i` the runner builds `ticks.slice(0, i + 1)` and evaluates
  the strategies on that slice only. The outcome is read from `ticks[i + durationTicks]`. No code path
  in the runner can hand a strategy a tick after `i`.
- **One position per strategy.** A strategy that is holding a contract is skipped until it settles, so
  trades never overlap and the equity curve is a real sequence.
- **Flat stake, 1 unit.** There is no Martingale and no stake escalation anywhere in the engine.
- **Payout is a stated assumption:** `BACKTEST_PAYOUT_RATE = 0.95`, the same figure the virtual ledger
  uses. Deriv does not publish historical premiums, so a win is +0.95 and a loss is −1.00.
- **Break-even win rate** is therefore `1 / 1.95 = 51.28%` (`BREAK_EVEN_WIN_RATE`). The ranking's
  `edge` is `winRate − breakEvenWinRate`, in probability points.
- **Ties count as losses** (exit quote equals entry quote), matching the execution rules — no
  allow-equals parameter exists in the API surface this engine uses.
- **Warm-up:** the runner starts at `max(minTicks, slowPeriod × 2) + 2` so every strategy has the
  history its own filters require. `decisions` reports how many ticks were actually examined.
- **Qualification:** fewer than `MIN_BACKTEST_TRADES = 5` settled trades means `qualified: false`
  (score forced to 0) — a 1-of-1 result is noise. Unqualified results are still listed, last.
- **Score:** `edge × √trades`, i.e. an edge weighted by how much evidence produced it. Ranking sorts
  qualified results by score, then unqualified ones.

## What the numbers cannot tell you

- **In-sample only.** The ranking measures the same ticks it is shown on. It is a *comparison between
  strategies on one window*, not evidence that the winner will keep winning. A different window can
  reorder the table completely.
- **One payout assumption.** Deriv's real payout varies with market, duration and stake. A different
  payout moves the break-even rate and therefore every edge figure.
- **Tick-count settlement.** The virtual/backtest settle after `durationTicks` genuine ticks, while a
  real contract settles on Deriv's own expiry; a quiet feed delays the simulated exit rather than
  inventing a price.
- **No costs beyond the payout.** Spread is inside the payout; there are no commission, swap or
  slippage terms because a binary option has none — but the house edge is exactly what the break-even
  rate names.
- **No position sizing, no compounding.** Every trade risks one flat unit.

## Reading the table

| Column | Meaning |
|---|---|
| Trades | Contracts the strategy would have opened in the window |
| Wins / losses | Settled outcomes (ties are losses) |
| Win rate | `wins / trades`; needs > 51.3% to break even at this payout |
| Edge | win rate − break-even rate, in probability points |
| Net | Sum of +0.95 / −1.00 outcomes, in stake units |
| Drawdown | Largest peak-to-trough fall of that equity curve |

A positive `Net` with an `Edge` under zero is impossible at this payout; if the two ever disagree the
bug is in the runner, not the market.
