# Known limitations — Rise/Fall engine

Everything below is deliberately not done, gated, or unverified. Nothing here is described as working.

## Execution modes

| Mode | Status | What happens |
|---|---|---|
| **Virtual** | Implemented, tested | Simulated fills on genuine live ticks; `contractId` is always `null` and every P/L figure is `ESTIMATED` (95% payout assumption). |
| **Demo** | Implemented, unit-tested, **not verified live** | Real `proposal` → `buy` → `proposal_open_contract` on your own Demo account through the authenticated Deriv socket. Refused until an authorized Demo account is verified. |
| **Real** | Implemented, unit-tested, **not verified live** | Same path on a Real account, additionally gated by an explicit per-session **arm** and a per-entry confirmation card. Two separate deliberate actions are required before any real purchase is sent. |

The Demo/Real purchase path is covered by unit tests with a fake broker (accept, decline, timeout,
settlement, cancellation). It has **not** been exercised against a live Deriv account in this build:
Run and the authenticated socket need a signed-in Deriv account, and the preview was signed out while
this was built. Try it on a Demo account first.

## Verified vs unverified

Verified in this build: the eight strategies (84 unit tests), the risk engine, the regime classifier,
the journal's per-mode storage, the executor's full check order including Demo/Real dispatch with a
fake broker, the walk-forward runner and ranking, the runtime bridge's fail-closed behaviour, the
Rise/Fall tab rendering with ~1,000 genuine ticks, the live eight-strategy ranking, a real walk-forward
table, the honest DEMO "not verified" state, and the palette's eight blocks generating `Bot.rf*` code
in a scratch workspace.

Not verified: a live Demo or Real purchase and its settlement, the `rfEnter` block inside a running
bot, and the arm/confirmation flow against a real account.

## Not implemented

* **Automatic unknown-buy reconciliation.** A `buy` that times out halts the mode with an explicit
  UNKNOWN message and never resubmits; matching that order against the Deriv statement is manual.
* **Jurisdiction / eligibility notice** — no eligibility call is made.
* **Optimisation over parameters** — only the walk-forward ranking of the eight strategies exists; no
  parameter sweep, no out-of-sample split.
* **Rate-limit token bucket** — the broker refuses a second purchase while one is in flight, but there
  is no request throttle beyond Deriv's own limits.
* **Per-market exposure limit** — the session exposure limit covers the market traded.
* **Risk settings persistence** — limits reset to the mode defaults on reload; only the journal is
  persisted.
* **Strategy learning per strategy in the bot runtime** — the engine's own journal carries the numbers;
  the Bot Builder's Strategy Learning blocks measure the bot's contracts, not this engine's.

## Modelling limits that will remain true

* Virtual settlement uses **tick-count expiry**: a quiet feed delays settlement instead of inventing a
  price. Live contracts settle on Deriv's own expiry.
* Virtual and backtest payout is a **stated assumption** (95% of stake on a win). Deriv does not
  publish historical premiums or payouts, so no virtual or backtest financial figure is a real return.
  See `BACKTEST_METHODOLOGY.md`.
* Equality is a **loss**; the API surface examined exposes no allow-equals parameter
  (`REALITY_GATE.md` 0.9).
* A gap of more than 5 s between consecutive ticks blocks new entries for 30 s. There is no backfill
  path: the feed re-subscribes only when the market is re-selected.
* The backtest is **in-sample** on the ticks currently held; it compares strategies on one window and
  predicts nothing.
* Scores are **filter strengths**, never probabilities of winning. The house edge means expected value
  at typical stakes is negative; the risk limits cap losses, they do not create an edge.
