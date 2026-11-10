# Rise/Fall engine — architecture

The engine is its **own tab**, `#rise_fall`, fifth in the main tab bar (right after the Bot Builder).
It lives in `src/features/rise-fall/` and is lazy-loaded from `src/app/main/main.tsx`; the Bot Builder
no longer mounts any part of it, so one browser tab runs exactly one engine instance, one public feed
socket and one journal per mode.

## Module boundaries

```
src/features/rise-fall/
├─ types.ts                  shared contracts (modes, signals, contracts, broker, journal, risk)
├─ regime.ts                 market-regime classifier (pure)
├─ strategies/
│  ├─ shared.ts              math helpers, StrategyConfig, assembleSignal
│  ├─ trend-continuation.ts  strategy 1
│  ├─ breakout.ts            strategy 2
│  ├─ pullback.ts            strategy 3
│  ├─ momentum.ts            strategy 4
│  ├─ reversal.ts            strategy 5
│  ├─ volatility-expansion.ts strategy 6
│  ├─ confluence.ts          strategy 7 (reads the other seven)
│  ├─ tick-sequence.ts       strategy 8
│  └─ index.ts               the registry: ids, labels, evaluateAllStrategies
├─ risk-engine.ts            every limit + the flat-staking rule (pure)
├─ journal.ts                per-mode journal + summarisation (pure + storage)
├─ execution-service.ts      THE central, account-aware execution service
├─ live-broker.ts            proposal → buy → proposal_open_contract over the auth socket
├─ backtest.ts               walk-forward runner + ranking (pure)
├─ use-tick-feed.ts          one public WebSocket, 1000 ticks + live, integrity checks
├─ use-rise-fall-engine.ts   React orchestration (one service, one tick pass, the live socket)
├─ components/               the page and its focused panels
├─ rise-fall-page.scss       styling (shared theme tokens only)
└─ __tests__/                unit tests for every pure layer and the service
```

Pure logic never imports React and never opens a socket. The React layer feeds it genuine ticks. No
feature reaches into another feature's internals except for the two public-feed pieces the Digits lab
already owns (`digits/deriv-public-ws`, `digits/markets`) and the authenticated socket the app already
has (`features/ai-bot/auth-ws`).

## Connection topology

| Connection | Purpose | Opened by |
|---|---|---|
| Public market-data WebSocket | 1,000 historical ticks + live stream for the selected symbol | `use-tick-feed.ts`, while the tab is mounted |
| Authenticated OTP WebSocket | `proposal`, `buy`, `proposal_open_contract`, `balance` — **Demo/Real modes only** | `use-rise-fall-engine.ts` → `live-broker.ts`, only while Demo/Real is selected **and** the header session is authorized |

A market change reuses the public connection. The authenticated socket is opened lazily (a dynamic
import) so a visitor who only uses the virtual ledger never loads it, and it is torn down when the mode
returns to Virtual, the account changes or the tab unmounts.

## Execution-service contract

`RiseFallExecutionService.enter(request)` is the only path to an entry, from the page or a Blockly
block. Checks run in this fixed order:

1. **Engine state** — emergency stop, halt reason, `running`, no open contract, no pending confirmation.
2. **Signal** — direction is Rise/Fall, the strategy marked it suitable, age ≤ 10 s.
3. **Duplicate guard** — one entry per `symbol:strategy:direction:tick` fingerprint, ever.
4. **Market-data integrity** — connected, fresh, no recent gap.
5. **Risk engine** — the active mode's own limits (see `RISK_ENGINE_SPEC.md`).
6. **Account verification** — virtual: the simulated ledger. Demo/Real: a **verified account of that
   exact type** (`demo` needs Deriv's virtual account, `real` needs a real one), `tradePermitted`, an
   open broker, and balance ≥ stake. Real additionally needs the mode **armed** for the session.
7. **Contract validation** — direction, stake bounds, duration 1–300 ticks, usable entry tick,
   account currency present. Structured fields only; no contract description is ever parsed.
8. **Entry** — virtual creates the simulated contract and its journal line immediately. Demo sends the
   purchase and writes the journal line when Deriv acknowledges it. Real first returns
   `confirmation-required`; `confirmEntry()` sends it after the user's explicit confirmation.

### Live purchases (`live-broker.ts`)

`DerivRiseFallBroker.buy()` requests a proposal (`CALL`/`PUT`, `duration_unit: 't'`), rejects an
unusable one, buys exactly the returned `ask_price`, and subscribes to `proposal_open_contract`. Every
update is handed to `service.onContractUpdate()`, which settles the contract and the journal entry on
Deriv's report — a tick never settles a live contract.

The broker never retries. A `buy` that times out returns `unknown: true`; the executor then halts the
mode with an explicit **UNKNOWN** message, clears the open contract and never resubmits. Reconciling
that order against the Deriv statement is a manual step (see `KNOWN_LIMITATIONS.md`).

## Backtesting and ranking

`backtest.ts` walks the ticks the feed already holds. For index `i` it evaluates all eight strategies
on `ticks[0..i]` only, so the decision can never see the future; the outcome is read from tick
`i + durationTicks`. Each strategy holds at most one position, stake is flat, payout is the same stated
95% used by the virtual ledger, and results with fewer than 5 trades are reported as unqualified. See
`BACKTEST_METHODOLOGY.md`.

## Bot Builder bridge

`src/utils/rise-fall-runtime.ts` holds the provider the page registers while it is mounted. The
generated program reaches it through `Bot.rf*` (`Interface/RiseFallInterface.js`). It fails closed: with
the tab closed, reads answer neutral values and `rfEnter` refuses with the reason, which the interface
journals. `rf_enter` requests an entry from the same executor — it never buys anything itself.

## Mode separation

Each mode owns its own `ModeBook`: state, emergency flag, real-armed flag, halt reason, account
verification, risk config, open contract, pending confirmation, used fingerprints and id counter; plus
its own journal storage key (`rise-fall.journal.v1.<mode>`). A mode switch is refused while a contract
is open or a real entry is pending, and the engine never promotes Demo → Real by itself.

## UI

A single page of focused panels: hero (mode, market, state), execution mode + run controls, account
(verification, live connection, arming, real-entry confirmation), market & feed integrity, the selected
strategy with its per-component detail and parameters, the live eight-strategy ranking, the walk-forward
ranking table, risk limits, and the active mode's open contract, session figures and journal. Every
mode-sensitive figure carries its mode label (VIRTUAL / DEMO / REAL) and virtual P/L is marked
**ESTIMATED**.
