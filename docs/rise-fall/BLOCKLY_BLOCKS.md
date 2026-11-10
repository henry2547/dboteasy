# Rise/Fall Blockly blocks (Bot Builder → Rise/Fall)

Eight blocks in `src/external/bot-skeleton/scratch/blocks/RiseFall/`, imported by
`scratch/blocks/index.js`. Category: `window.Blockly.Categories.Rise_Fall = 'rise_fall'`, palette entry
in `src/features/bot-builder/toolbox/palette/trading-categories.tsx`.

| Block | Type | Generates | Reads |
|---|---|---|---|
| Rise/Fall connected | Boolean value | `Bot.rfConnected()` | true while the Rise/Fall tab's engine is mounted |
| Rise/Fall signal | String value | `Bot.rfSignal()` | `"rise"`, `"fall"` or `"none"` (NO TRADE) |
| Rise/Fall score | Number value (Rise/Fall dropdown) | `Bot.rfScore("rise")` | 0–100 filter strength of that side |
| Market regime | String value | `Bot.rfRegime()` | the classifier's regime id |
| Best backtested strategy | String value | `Bot.rfBestStrategy()` | top qualifying strategy of the last ranking, or `""` |
| Rise/Fall session stat | Number value (trades/wins/losses/net/open) | `Bot.rfStat("wins")` | the active mode's own journal |
| Enter through Rise/Fall engine | statement (stake + duration inputs) | `Bot.rfEnter(0.35, 5);` | requests one entry from the central executor |
| Rise/Fall report | String value | `Bot.rfReport()` | multi-line report: mode, every strategy, backtest best |

## How they reach the engine

The engine is React state on the Rise/Fall tab; the interpreter is plain JS. They meet in exactly one
module, `src/utils/rise-fall-runtime.ts`: the page registers a provider while it is mounted and the
program's `Bot.rf*` calls (`Interface/RiseFallInterface.js`, spread into `getInterface()`) read it.

That means:

- There is **one** implementation of every strategy, the risk engine and the journal — the one the tab
  is running. A block never re-computes a signal from its own copy of the data.
- The bridge **fails closed**. With the tab closed, `rfSignal` answers `"none"`, scores answer 0,
  `rfConnected` answers false, and `rfEnter` refuses with
  "The Rise/Fall engine is not open — open the Rise/Fall tab so the entry can pass its checks."
  `RiseFallInterface.js` writes that reason into the run journal at `warn`.
- `rfEnter` is **not a purchase block**. It asks `RiseFallExecutionService.enter()`, which still runs
  the engine state, signal age, duplicate fingerprint, feed integrity, risk limits, account
  verification and contract validation. A stopped engine, a NO TRADE signal, a stale feed or an
  unverified account all refuse it. `rfEnter` returns a Boolean (true only when the executor opened
  the contract), so a canvas can branch on it.
- A real-money entry needs the armed mode **and** the confirmation card on the tab; `rfEnter` returns
  false with that reason instead of buying, so an unattended bot can never place a real trade by
  itself.

## Verifying without a login

Run is login-gated, but the blocks can be checked in a scratch workspace:

```js
const B = window.Blockly;
const xml = `<xml xmlns="https://developers.google.com/blockly/xml"><block type="rf_enter">
  <value name="STAKE"><shadow type="math_number"><field name="NUM">0.35</field></shadow></value>
  <value name="DURATION"><shadow type="math_number"><field name="NUM">5</field></shadow></value>
</block></xml>`;
const ws = new B.Workspace();
B.Xml.domToWorkspace(B.utils.xml.textToDom(xml), ws);
B.JavaScript.javascriptGenerator.workspaceToCode(ws); // → "Bot.rfEnter(0.35, 5);"
```

`Blockly.Categories.Rise_Fall` must be `rise_fall`, all eight types must be in `Blockly.Blocks`, and
`forBlock.rf_score({ getFieldValue: () => 'fall' })` must answer `Bot.rfScore("fall")`. The observer
generator-coverage test also fails if a block in `scratch/blocks` has no `forBlock` registration.
