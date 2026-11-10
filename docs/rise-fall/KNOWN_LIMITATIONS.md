# Known limitations — Rise/Fall engine (Phase A)

Everything below is deliberately not done, gated, or unverified. Nothing here is described as working.

## Execution modes

| Mode | Status | What happens if you try |
|---|---|---|
| **Virtual** | Implemented, tested | Simulated fills on genuine live ticks; `contractId` is always `null` and every P/L figure is `ESTIMATED` (95% payout assumption). |
| **Demo** | **Not wired (Phase B)** | The mode can be selected; every entry is refused with "Demo purchases are Phase B… no purchase was sent to Deriv." |
| **Real** | **Locked (Phase E)** | The mode can be selected; every entry is refused because the activation gates do not exist. No real purchase can be placed by this build. |

## Not implemented

* **Proposal → buy → monitor → settle** on an authenticated socket. The reusable pieces already exist
  in `src/features/ai-bot/` (`auth-ws.ts`, `execution-engine.ts`); they are not connected to this
  engine yet.
* **Uncertain-buy reconciliation** and its residual-risk statement (brief §7.2).
* **Account identity verification** from authenticated account data — there is no authenticated
  session in this build, so the Demo/Real gates refuse rather than assume.
* **Jurisdiction / eligibility notice** — no eligibility call is made.
* **Strategies 2–8** (Breakout, Pullback, Momentum, Reversal, Volatility Expansion, Confluence, Tick
  Sequence).
* **Blockly blocks** for market / strategy / signal / account / execution / risk (brief §14).
* **Backtester, optimisation and out-of-sample ranking** (brief §12–13). No backtest figure appears
  anywhere, so there is nothing to mislabel.
* **Rate-limit token bucket** — no `proposal`/`buy` request is sent in Phase A, so throttling would be
  untestable code. It belongs with Phase B.
* **Per-market exposure limit** — the session exposure limit covers the single market traded.
* **Risk settings persistence** — limits reset to the mode defaults on reload; only the journal is
  persisted.

## Modelling limits that will remain true

* Virtual settlement uses **tick-count expiry**: a quiet feed delays settlement instead of inventing a
  price. Real contracts settle on Deriv's own expiry.
* Virtual payout is a **stated assumption** (95% of stake on a win). Deriv does not publish historical
  premiums or payouts, so no virtual or backtest financial figure is a real return.
* Equality is a **loss**; the API surface examined exposes no allow-equals parameter
  (`REALITY_GATE.md` 0.9).
* A gap of more than 5 s between consecutive ticks blocks new entries for 30 s. There is no backfill
  path yet: the feed re-subscribes only when the market is re-selected.

## Artifacts not yet produced

`EXECUTION_SERVICE_SPEC.md` (its contract is in `ARCHITECTURE.md` for now), `BACKTEST_METHODOLOGY.md`
(no backtester exists), `TEST_PLAN.md` (the table below is the current record), `REGRESSION_CHECKLIST.md`
(existing Digit features were not re-run as a suite this turn) and the Blockly-block documentation.

## Test status

| Area | Status |
|---|---|
| Regime classifier | **Tested** — 5 unit tests |
| Trend Continuation | **Tested** — 9 unit tests (Rise, Fall, NO TRADE, short history, structure, threshold, fingerprints) |
| Risk engine | **Tested** — 14 unit tests (every limit, cool-down, flat stake, sanitisation) |
| Journal and per-mode separation | **Tested** — 10 unit tests |
| Central execution service | **Tested** — 18 unit tests (virtual open/settle, strict tie, duplicate, stale, unhealthy feed, risk refusal, phase gates, emergency stop, identity change, separation) |
| Panel renders and drives the engine in the preview | **Tested in the running app** (see the turn's report) |
| Demo purchase → contract id → settlement | **NOT TESTED — requires live credentials** |
| Real-money readiness and activation | **NOT TESTED — requires live credentials and explicit user activation** |
| Live `proposal`/`buy` error classification, rate limits, clock skew | **NOT TESTED** (no authenticated requests) |
