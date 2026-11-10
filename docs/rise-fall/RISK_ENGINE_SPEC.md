# Risk engine specification

`evaluateRisk(config, context)` is called by the execution service on **every** entry, in code — the
panel edits the config, but the panel cannot approve an entry.

## Limits (per mode, all editable in the panel)

| Limit | Check | Virtual default | Demo default | Real default |
|---|---|---|---|---|
| Stake per trade | `0 < stake ≤ maxStake` | 1 | 0.35 | 0.35 |
| Market minimum | `stake ≥ 0.35` | 0.35 | 0.35 | 0.35 |
| Maximum stake | config ceiling | 10 | 2 | 1 |
| Maximum daily loss | `sessionPnl > −limit` | 50 | 20 | 5 |
| Maximum consecutive losses | `streak < limit` | 3 | 2 | 1 |
| Maximum trades per session | `trades < limit` | 20 | 10 | 5 |
| Maximum open contracts | `open < limit` | 1 | 1 | 1 |
| Maximum exposure | `exposure + stake ≤ limit` | 10 | 5 | 2 |
| Maximum session drawdown | `peak − pnl < limit` | 30 | 10 | 3 |
| Cool-down after a loss | `now − lastLoss ≥ limit` | 0 ms | 30 s | 60 s |

A limit of `0` means "not set" for the loss/trade/count limits; the stake and minimum-stake checks are
always enforced. Every check returns a label, a pass/fail and a human-readable detail, and the first
failure's detail is the rejection reason shown in the panel.

## Enforcement points

1. **Execution service** (`RiseFallExecutionService.enter`) — the only path to an entry; runs the
   whole config before anything is opened.
2. **Executor state** — emergency stop, halt reason, engine state and one-open-contract rule are
   checked before the risk config.
3. **Settlement** — the journal's trailing loss streak and P/L feed the next risk context; a loss can
   only ever *reduce* what the next entry may do.

## No Martingale

The stake is a flat configured value. Nothing in the module derives a stake from a previous loss, and
there is no escalation path to bypass. `STAKING_RULE` is rendered in the panel next to the limits.

## Cool-down and halts

* A loss sets `lastLossAt`; the cool-down check blocks entries until it expires.
* The consecutive-loss, daily-loss and drawdown limits block entries for the session.
* Emergency stop halts new entries **and keeps monitoring the open contract** so a position is never
  abandoned.
* Changing the authorized account identity sets a halt reason that requires explicit re-verification.

## Known gap

Nothing enforces a per-market exposure split yet (the brief's "maximum exposure per market" collapses
to total session exposure because the engine trades one market at a time). Listed in
`KNOWN_LIMITATIONS.md`.
