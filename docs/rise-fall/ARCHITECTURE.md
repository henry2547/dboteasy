# Rise/Fall engine — architecture (Phase A)

The engine is an **expansion of the Blockly Bot Builder**, not a new tab. It lives in
`src/features/rise-fall/` and is mounted by `src/features/bot-builder/bot-builder.tsx` while the
Bot Builder tab is active.

## Module boundaries

```
src/features/rise-fall/
├─ types.ts                  shared contracts (modes, signals, contracts, journal, risk)
├─ regime.ts                 market-regime classifier (pure)
├─ strategies/trend-continuation.ts   strategy #1 (pure)
├─ risk-engine.ts            every limit + the flat-staking rule (pure)
├─ journal.ts                per-mode journal + summarisation (pure + storage)
├─ execution-service.ts      THE central, account-aware execution service
├─ use-tick-feed.ts          one public WebSocket, 1000 ticks + live, integrity checks
├─ use-rise-fall-engine.ts   React orchestration (one service instance, one tick pass)
├─ components/               the panel, its risk editor and its journal list
├─ rise-fall-panel.scss      panel styling (shared theme tokens only)
└─ __tests__/                unit tests for every pure layer and the service
```

Pure logic never imports React or opens a socket; the hook feeds it genuine ticks. No feature
reaches into another feature's internals except for the two public-feed pieces the Digits lab already
owns (`digits/deriv-public-ws`, `digits/markets`), which the app shell imports the same way.

## Connection topology

| Connection | Purpose | Opened by |
|---|---|---|
| Public market-data WebSocket | 1,000 historical ticks + live stream for the one selected symbol | `use-tick-feed.ts`, only while the panel is open |
| Authenticated OTP WebSocket | **not opened in Phase A.** Phase B will reuse `src/features/ai-bot/auth-ws.ts` | — |

One subscription per selected symbol serves every strategy that will run on it. A second socket is
never opened to "refresh" data; a market change reuses the same connection.

## Execution-service contract

`RiseFallExecutionService.enter(request)` is the only path to an entry. Nothing else may open a
contract — not the panel, not a future Blockly block. Checks run in this fixed order:

1. **Engine state** — emergency stop, halt reason, `running`, no open contract on this mode.
2. **Signal** — direction is Rise/Fall, the strategy marked it suitable, age ≤ 10 s.
3. **Duplicate guard** — one entry per `symbol:direction:tick` fingerprint, ever.
4. **Market-data integrity** — connected, fresh, no recent gap.
5. **Risk engine** — the active mode's own limits (see `RISK_ENGINE_SPEC.md`).
6. **Account verification** — virtual: the simulated ledger; demo/real: the account must be verified
   *and* the phase must be implemented, otherwise the entry is refused with the reason.
7. **Contract validation** — direction, stake bounds, duration 1–300 ticks, usable entry tick,
   currency match. Structured fields only; no contract description is ever parsed.
8. **Entry** — a `VirtualContract` is created and one journal line is written.

`RiseFallExecutionService.onTick(tick)` counts genuine ticks one at a time. A replayed tick is ignored
(`lastAppliedEpoch`), settlement waits for the promised number of ticks even if the feed goes quiet,
and strict prices decide the result (equal = loss).

### Uncertain entries

Virtual mode has no `buy` request, so it cannot be half-accepted. When Demo/Real are wired in Phase B
they must follow the reconciliation design in the brief (§7.2): idempotency key in `passthrough`,
never resubmit blindly, adopt a matching open contract or mark the attempt `UNKNOWN` and halt the
account. That path is **not implemented** and is listed in `KNOWN_LIMITATIONS.md`.

## Mode separation

Each mode owns its own `ModeBook`: state, emergency flag, halt reason, account verification, risk
config, open contract, used fingerprints and id counter; and its own journal storage key
(`rise-fall.journal.v1.<mode>`). A mode switch is refused while a contract is open, and the engine
never promotes Demo → Real by itself.

## UI

A launcher pill in the Bot Builder opens a panel over the canvas: mode selector, account facts,
market + feed integrity, live Rise/Fall scores with per-component contributions and the signal
explanation, strategy parameters, risk limits, Start/Pause/Stop/Emergency controls, the open contract,
session statistics and the active mode's journal. Every mode-sensitive figure carries its mode label
(VIRTUAL / DEMO / REAL) and simulated P/L is marked **ESTIMATED**.

## Deliberately absent in Phase A

Demo/Real purchase loops, the authenticated socket, `proposal`/`buy`/`proposal_open_contract`
monitoring, backtesting, optimisation/ranking, the Blockly blocks and the remaining seven strategies.
See `KNOWN_LIMITATIONS.md` for the phase each belongs to.
