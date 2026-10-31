# Even/Odd strategy blocks

These twelve blocks live in the existing Bot Builder's **Digits** category, alongside **Use the best even/odd market**, which picks the market the strategy runs on. They do not add a tab or a separate trading interface.

## Connecting a strategy

1. Set the existing trade parameters to **Digits → Even/Odd**, with **Both** contracts if the strategy may buy either parity. Set the stake and duration using the existing trade options. Initialise any stake variable in **Run once at start**.
2. In **Run once at start**, connect **Configure Even/Odd strategy** (signal rule, window, percentage threshold, parity run and direction), **Monitor last N valid ticks**, and optionally **Allow one entry per signal**. Use the same window size in Configure and Monitor. With the rule set to **Reversal of the last N digits** the entry buys the opposite parity of a run — the last 2 digits both even → ODD, both odd → EVEN, a mixed pair is no entry — and the window/threshold apply to the **Threshold** rule only.
3. In the existing purchase conditions, use **Even/Odd window ready** and either **Even percentage meets threshold**, **Odd percentage meets threshold**, or a comparison against **Even/Odd signal direction**. Connect **Buy EVEN** or **Buy ODD** in the matching branch.
4. **Wait for next valid tick** can suspend a waiting branch until another genuine tick arrives; stopping the bot releases that wait. Preserve the existing after-purchase, restart and risk controls.

## Available blocks

| Block type | Behaviour |
| --- | --- |
| `eo_configure` | Sets the signal rule (`threshold` — the parity share of the window — or `reversal` — buy the opposite of the last N same-parity digits), the window (1–1000), threshold (>0–100%), parity run (2–100) and direction (even, odd or both). Invalid settings are reported and use defaults: threshold rule, 20 ticks, 65%, run 2, both. |
| `eo_monitor_ticks` | Arms a rolling window. Repeating the same size preserves collected ticks. Changing size clears it. |
| `eo_window_ready` | True only after the full window is collected on a connected feed. |
| `eo_even_percentage` | Even count × 100 / collected count. |
| `eo_odd_percentage` | Odd count × 100 / collected count. |
| `eo_even_meets` | Full-window even percentage is at least the supplied threshold. |
| `eo_odd_meets` | Full-window odd percentage is at least the supplied threshold. |
| `eo_signal_direction` | Returns `EVEN`, `ODD` or `NO SIGNAL` using the configured threshold and direction. |
| `eo_buy_even` | Requests `DIGITEVEN` through the existing purchase engine, only when the configured signal selects EVEN. |
| `eo_buy_odd` | Requests `DIGITODD` through the existing purchase engine, only when the configured signal selects ODD. |
| `eo_one_entry_per_signal` | Allows at most one confirmed entry for a particular tick/window/threshold/direction/market identifier; a new tick is a new signal. |
| `eo_wait_tick` | Waits asynchronously for the next accepted tick, or returns false when stopped. |

The threshold-reading blocks do not override the configured buy signal: a Buy block still checks the configured threshold and direction. When both parities qualify, the higher share wins; an exact tie selects EVEN. Percentages describe past ticks, not a guarantee about the next digit.

## Choosing the best Even/Odd market

| Block type | Behaviour |
| --- | --- |
| `switch_best_parity_market` | Scans every eligible volatility market, measures each one's own latest ticks, and moves the bot to the market whose even/odd split is the most lopsided. Generates `Bot.marketScanBestParity({ ticks })`; the number is the per-market sample (1–1000, default 100 when nothing is connected). |

Place it once, in the branch that runs before an entry (the shipped `even_odd_window` free bot runs it on the first trade loop of the run and remembers that it has scanned; a contract that settles as a loss clears that memory, so the next trade loop scans the pool again before it looks for an entry). The scan subscribes to each market through the trade engine's ordinary tick path, skips closed, suspended, cooling-down or contract-less markets with the reason in the run log, and journalling every measurement it made — so the market it kept can be checked against the ticks it was chosen on. It never places a trade and refuses to change the market while a contract is open; the entries, stake, risk limits and Demo/Real protections stay where they were. A split describes the ticks already seen, never the next digit, and stopping and starting the bot scans again.

## Recovery after a loss (Trade Over 1 / Under 8, recover on Even/Odd)

`digits_parity_recovery` holds both legs in one block, so no `purchase` block is needed:

- **First leg:** buys `DIGITOVER` (Over 1) or `DIGITUNDER` (Under 8) when the newest digit passes that barrier.
- **Second leg, only after a settled loss:** `Bot.eoParityReversal(run, direction)` reads the newest `RUN` digits of the market the bot is already trading — synchronously, on the same pass of the trade loop, with no market scan and no window to arm.
- **The rule:** the last `RUN` digits (default **2**) all **even → buy ODD**, all **odd → buy EVEN**. A mixed run is no entry. `PARITY` limits which reversal may be bought (`both`, `EVEN only`, `ODD only`).
- The digits come from the engine's own tick subscription (`trade/Ticks.js` → `eoFeedTick` → `recordReversalDigit`): a repeated tick is ignored, an out-of-order tick restarts the run, and a market change starts a fresh run, so the reversal is never read from another market's ticks.
- Both buys go through the engine's own purchase path, so the stake, risk limits, the selected contract and the Demo/Real protections are unchanged. Set the trade definition's contract type to **Both**, otherwise `canTradeContract` refuses the family the leg needs and the journal says why.
- The engine reports a settled contract as `win` or `loss`, so the loss branch compares against `'loss'`. A block that keeps its recovery behind a "Parity Switched" observer gate can never fire: that gate requires the newest two digits to have **different** parity, which is exactly what the reversal rule reads as "no entry". The shipped template ORs the gate with "last trade lost".
- **Keep that OR outside the observer block.** The observer runtime evaluates a condition only from observer blocks; an ordinary `logic_operation` connected into an `obs_and`/`obs_or` reads as Inconclusive, which `Bot.observerCondition` reports as `false`. The shipped gate groups its observer conditions in one `obs_and` and combines them with the "last trade lost" OR through an ordinary AND, so the generated entry reads
  `if (Bot.observerCondition('…and') && (Bot.observerCondition('…parity') || Bot.sessionLastResult() === 'loss'))`.

## Execution and safety

The window uses the trade engine's existing tick subscription, not the Digits dashboard feed or a second socket. Repeated ticks are ignored, out-of-order ticks invalidate the window, market changes restart it, and disconnected feeds cannot qualify. Buys also check the existing session state, stake, risk limits, selected contract and open contract. A signal is marked used only after the existing purchase path records a contract id.

## Verification

Run in the development container:

```sh
npx jest src/external/bot-skeleton/services/tradeEngine/utils/__tests__/even-odd.test.js src/external/bot-skeleton/services/tradeEngine/utils/__tests__/even-odd-runtime.test.js src/external/bot-skeleton/services/tradeEngine/utils/__tests__/market-parity-scan.test.js src/external/bot-skeleton/services/observer/__tests__/observer-generation.test.js --runInBand --coverage=false
npm run type-check
```

The runtime tests use a mocked purchase method: they verify routing, signal/risk/disconnection guards, duplicate prevention, unconfirmed purchases and tick waits, without placing orders. Browser verification confirms the existing builder opens and all twelve blocks generate their engine calls in an isolated workspace. A real Demo-account proposal → purchase → settlement has not been verified; test that separately with an authorised Demo account before considering real funds. The pre-existing `Failed to load image` console error is unrelated to these blocks.
