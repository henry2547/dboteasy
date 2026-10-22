# Base44 Setup Notes

## Project Type
Frontend-only Rsbuild + React Router SPA (Deriv Trading Bot / "dboteasy"). No backend, no database.
MobX stores, `@deriv-com/quill-ui` components, SCSS with CSS custom properties per theme.

## Running in the Sandbox
- `docker compose -f docker-compose.base44.yml up -d` starts the dev server.
- Node 22 base image; source is bind-mounted at `/app`; `node_modules` lives in an anonymous volume.
- Dev server listens on port 4003 inside the container, mapped to host port 3000.
- `npm ci --no-audit --no-fund` runs on container startup before `npm run dev`, using the committed `package-lock.json`.

### Sandbox-only dev override: eager compilation
Rsbuild turns on Rspack's lazy ("compile on demand") dev compilation by default. Here the browser
fetches each module separately, and if a hot update lands while such a fetch is in flight the
disposed module factory is required again — the browser console then shows
`RuntimeError: factory is undefined` (HMR `warnUnexpectedRequire`) and a chunk of the page can
fail to resolve. `rsbuild.config.ts` therefore sets `dev.lazyCompilation: false` when
`BASE44_PREVIEW_MODE === '1'`, which is only true inside the sandbox (`docker-compose.base44.yml`
passes the flag through, it is not hardcoded there). With the flag unset or any other value the
Rsbuild default (lazy on) stands, and production builds never read `dev` at all.
Effect: the first dev build compiles everything eagerly (~5 s here) instead of returning instantly
and compiling per request; hot updates after that are unchanged.

## Environment Variables
- `.env.production` (committed) is loaded by `loadEnv({ mode: 'production' })` in `rsbuild.config.ts` and injected via `source.define` at compile time. No `.env` file is needed for dev.
- `NEXT_PUBLIC_DERIV_APP_ID` is set in `.env.production` — required for OAuth login; without it Log in / Sign up stay disabled.
  This app id is **intentionally kept in `.env.production`** and is the single source for OAuth login/sign-up
  and the WebSocket client id. It is a public client id, not a credential: do not move it to Base44 secrets,
  do not hardcode a copy in `docker-compose.base44.yml`, and do not point the sandbox at a different app id.
  `loadEnv({ mode: 'production' })` + `source.define` in `rsbuild.config.ts` inject it at compile time, so
  editing the file is enough — restart the `web` service (`docker compose -f docker-compose.base44.yml restart web`)
  because a dev-server config change is not hot-reloaded.
- Google Drive credentials (`GD_CLIENT_ID`, `GD_APP_ID`, `GD_API_KEY`) are optional; blank disables the feature.
- No external service credentials are required for local development.

## Digits Analysis Lab
Read-only, public-market-data feature added as the 6th main tab (`#digits`). Lives entirely in `src/pages/digits/`:
- `deriv-public-ws.ts` — public WebSocket client. **Only public market-data messages are sent** (`active_symbols`, `ticks_history`, `ticks`, `ping`, `forget`). No login, no trading.
- `precision.ts`, `statistics.ts`, `strategies.ts`, `backtest.ts` — pure calculations, no network. Round only for display.
- `use-digits-lab.ts` — orchestration hook (market selection, 1000-tick FIFO, generation guards).
- `components/` — panel components; `digits-page.scss` holds all the styling.

### Public WebSocket endpoint (verified)
`wss://api.derivws.com/trading/v1/options/ws/public` speaks the classic v3 message shape
(`msg_type` / `req_id` / `echo_req`). Two behaviours differ from the older docs:
- **`ticks_history` requires `subscribe: 1`** — `subscribe: 0` is rejected with
  `InputValidationFailed: subscribe must be 1`. With `subscribe: 1` the single request returns
  `history` *and* then streams `tick` messages for the same subscription, so no separate
  `ticks` request is needed.
- `pip_size` on history/tick messages is a decimal-place count (R_100 -> 2 means `629.81`).
  On `active_symbols` the same field is a price increment (`0.01`). See `resolvePrecision`.

### Gotcha worth remembering
`DerivPublicWebSocketClient` emits a status update on heartbeat metadata too, not just on status
changes. React consumers must ignore non-transitions — otherwise every incoming message re-runs
the "connected" handler and re-selects the market, which invalidates the request in flight and
the lab sits on an empty feed. `use-digits-lab.ts` guards with `lastStatusRef`.

### Symbol preload failures are non-fatal
`api_base.init()` preloads `active_symbols` fire-and-forget (10 s timeout). A slow or failed fetch
must stay a `console.warn`, never an uncaught promise rejection: the promise is stored on
`api_base.active_symbols_promise`, so every assignment site attaches a rejection handler, and
`ActiveSymbols.retrieveActiveSymbols()` catches a rejected shared promise and falls through to its
single fresh-fetch retry. The dashboard and Digits page read the public feed independently and keep
working while the bot-side symbol list is empty.

## Branding: logo and splash
- `public/logo.png` is the brand mark. `brand.config.json` -> `platform.logo_path` must point at it
  (`"/logo.png"`); `getLogoCandidates()` returns nothing when `logo_path` is `null`, so dropping the
  file alone is not enough.
- The same image is the boot splash via `src/components/splash-screen/`, rendered wherever the app
  shows its startup loader (`src/app/app-content.jsx` `is_loading` branch and `src/app/app-root.tsx`).
- `scripts/generate-brand-css.js` regenerates `_themes.scss` from `brand.config.json` on dev/build.

## Layout notes
- `.main` in `src/pages/main/main.scss` is a fixed-height, `overflow: hidden` flex box, so a tab page
  must own its own scrolling. `.digits` uses a viewport-based height with `overflow-y: auto`.
- The main tab bar is made scrollable below desktop (`is_scrollable={!isDesktop}`) because seven tabs
  do not fit a narrow phone viewport.
- The digit-frequency grid (`.digits-grid`) is a fixed 5-column grid at every width — digits 0–4 on
  the first row, 5–9 on the second — so it never scrolls sideways on a phone; below the 768px
  breakpoint `.digit-bubble` / `.digits-badge` tighten their type and padding to keep five columns
  inside a narrow viewport.
- Digit frequency is drawn as circles (`.digit-bubble`, one SVG per digit in `digit-grid.tsx`), not
  cards: the coloured disc inside grows with the digit's share of the busiest digit, green
  (`--brand-success`) for the hottest digit, red (`--status-danger`) for the coldest, and a yellow
  (`--brand-warning`) cursor ring plus pin marks the digit the ticker is on right now. The grid takes
  `currentDigit` from the newest tick on the page — same value the distribution panel's cursor uses.

## Verification
- `curl http://localhost:3000/` returns 200 with the app HTML; JS bundles are served live at `/static/js/index.js`.
- The Digits tab: open `#digits`, confirm markets load, ~1000 stored ticks, the digit grid, the
  distribution chart, the digit circle, barrier cards, six strategy cards and six backtest rows.

## Tabs added for digit trading
The main tab bar has eight tabs, in this order: Dashboard, **AI Builder**, Free Bots, Bot Builder,
Strategy Engine, Deriv Chart, Digits, Statistics.
Indices live in `DBOT_TABS` / `TAB_IDS` (`src/constants/bot-contents.ts`) and the `hash` array in
`src/pages/main/main.tsx` must stay in the same order. The Bots tab is gone; its block language now
ships in the Bot Builder palette (see "Observer blocks in the Bot Builder" below).
**Bot Builder is index 3** (AI Builder, then Free Bots, sit right after Dashboard; both hand a bot straight
to the builder). Code that switches on the active tab compares against `DBOT_TABS.BOT_BUILDER`, never a
literal — the vendored tours, save/load modals and `bot-builder.tsx` were all moved off `=== 1` when the
tabs were reordered.

### Floating market scanner (app-wide)
`ScanMarketsButton` (`digits/components/scan-markets-button.tsx`) is mounted ONCE in the app shell —
`GlobalScanButton` (`digits/components/global-scan-button.tsx`, lazy-loaded in `main.tsx` inside
`DigitsLabProvider`, after `</Tabs>`) — so the button is on every tab, not just Digits. It uses the
shared lab feed through `useDigitsLabContext()`, so it scans the same markets the Digits tab shows.
- It is a `position: fixed` pill that can be dragged anywhere in the viewport in any direction
  (pointer events, `touch-action: none`). Position is clamped to the viewport on drag and on resize;
  the results panel is `position: fixed` too and flips below the button when it sits in the top half,
  so it stays readable wherever the button is parked.
- A drag ends with a click on the same button, so `pointerup` after movement sets a one-shot flag that
  `click` swallows; `pointerdown` clears it, so the next tap always scans.
- Styles live in `digits/components/scan-markets-button.scss` (imported by the component, NOT by the
  Digits page — the button must be styled while other tabs are open).

- **Digits + Statistics share ONE feed.** `DigitsLabProvider`
  (`src/pages/digits/digits-lab-context.tsx`) is mounted around `<Tabs>` in `main.tsx`; both pages read
  it with `useDigitsLabContext()`. `useDigitsLab()` keeps the single public WebSocket, so the market
  picked on Digits is the market Statistics analyses. Children of the provider are passed as stable
  element props, so a tick does not re-render the whole shell.
- **Market filter:** `filterDigitMarkets` in `markets.ts` keeps only the `1-Second Volatility Indices`
  and `Volatility Indices` categories. The picker and the scanner both use it.
- **Scanner:** `scan-markets.ts` opens its OWN short-lived public WebSocket (never disturbs the live
  subscription) and ranks volatility markets. Remember `ticks_history` needs `subscribe: 1`; the scan
  sends `forget` straight after each request.
- **Scanner → Load Bot:** every ranked row renders
  `src/pages/free-bots/components/scanner-bot-result.tsx`. The row's own scanned digits pick the
  template through `matchFreeBotSetup` (`free-bots/scanner-match.ts`), so a row can only ever load the
  strategy it displayed; **Load Bot is disabled unless all three setup conditions hold** (an unconfirmed
  row keeps its conditions, reason, evidence and the disabled-reason visible instead of being forced
  onto a template by its score). Loading goes through
  `useFreeBotLoader().loadBot({ marketSource: 'scanner' })`, which re-targets the XML, waits for the
  live workspace, checks the market/contract/prediction **and block count** it reports, then switches to
  the Bot Builder tab — the panel closes only when that load reports `loaded`
  (`botLoaderStore.status`). `MarketScan` carries `scannedAt` so each row can show its scan time.
  Verify: press **Scan markets** (the floating button, visible on every tab), then **Load … bot** on a row whose conditions are
  all ✓ — expect the Bot Builder tab to open with that symbol in `trade_definition_market` and the
  matching `DIGITOVER`/`DIGITUNDER` + prediction; rows with ✗ conditions have the button disabled.
  `docker compose exec web npx jest src/pages/free-bots`.
- **Loaded-bot banner (Bot Builder):** `BotStatusBanner` (`free-bots/components/bot-status-banner.tsx`)
  renders as an overlay whenever the Bot Builder tab is active. It reads the live
  `botLoaderStore`, the header's authorized account (`useApiBase`) and `runPanel.is_running` — never a
  simulated message. Validate re-reads the **workspace** XML (so canvas edits are re-checked), requires
  the loaded/active account not to have changed, and Start stays disabled until validation passes.
  A real account needs a second, explicit **Confirm real-account start** click; Demo starts directly.
  The banner never claims "Running" until `runPanel.is_running` is true.
- **Block-count guard:** `inspectFreeBotXml().blockCount` is the number Blockly will hold on the canvas
  (`block` + `shadow` elements, minus a shadow replaced by a real block in the same `<value>`), currently
  **59** for the plain Over/Under and Even/Odd templates, **63** for every template with an extra digit
  filter (`over1_two_low_digits`, `under8_two_high_digits`, `under7_rare_nine`, `under5_nine_rare`,
  `over4_five_hot`) and **67** for `over2_three_low_digits`. `loadBot` compares it with `derivWorkspace.getAllBlocks(true).length`, so a
  canvas that kept blocks from a previous bot is reported as stale instead of being called valid. Keep
  that formula in sync if a template gains blocks (the unit test pins 59 for the first template only).
- **Free Bots library (fourteen templates).** `templates.ts` describes every asset in `src/xml/`; the first
  two are the uploaded files, the derived ones add variants (Over 2/3, Under 6/7, Even/Odd) and a second
  entry gate built from
  the observer blocks — `over1_two_low_digits` / `under8_two_high_digits` (`obs_ago` + `obs_compare_*` +
  `obs_number`), `over2_three_low_digits` (`obs_and` over two `obs_ago` compares), `under7_rare_nine` /
  `under5_nine_rare` (`obs_and` over `obs_min_sample` + `obs_freq_below`) and `over4_five_hot`
  (`obs_min_sample` + `obs_freq_above` on the digit the contract wins on). Those observer blocks sit NESTED inside the
  `before_purchase` `controls_if` → `purchase` stack, not as an `obs_entry` gate: the observer runtime
  then evaluates them through `Bot.observerCondition(...)` on the same tick, and there is no second
  gate/restart cycle competing with the template's own `after_purchase` martingale. `findEntryCondition`
  only finds a purchase that is a descendant of the `controls_if` whose `IF0` compares `last_digit`, so
  the observer `controls_if` must be nested INSIDE that DO0 (wrapping the purchase), never the other way
  round, or every observer-gated template fails the loader inspection.
- **The stake must be initialised in "Run once at start".** `Bot.start()` is called by
  `BinaryBotPrivateStart` (dbot.js) at the top of every trade loop, *before* `before_purchase` runs, and
  the generator reads the `AMOUNT` input into `amount` right there. Every template keeps its stake in the
  `freebot:stake` variable, so the `variables_set` chain that seeds stake/profit/stop lives in the trade
  definition's `INITIALIZATION` statement (id `<template>-init`). Putting that chain in `before_purchase`
  instead leaves `amount` `undefined` for the first quote — `Number(undefined)` → `NaN` → `null` on the
  wire — and Deriv answers the first proposal with `InputValidationFailed` / "Invalid input provided", so
  the bot stops before it ever trades. `inspectFreeBotXml`'s `stake-at-start` check now rejects a template
  that reads a variable in the trade options without setting it in `INITIALIZATION`; the unit test
  `only set inside before_purchase` pins it.
- Each card shows two plain-language lines above the numeric defaults — **Buys when** (`buyCondition`)
  and **Trades again when** (`restartCondition`), plus **Blocks used** (`blocksUsed`) — and the whole
  card is collapsed to just its name until the header toggle is pressed, so six bots fit on a phone.
- **Statistics from raw digits:** `calculateStatisticsFromDigits` in `statistics.ts` is the digits-only
  entry point; `calculateDigitStatistics` now delegates to it.
- **Crashes:** `src/components/error-boundary/` wraps `<Main>` in `app-content.jsx` and each new tab
  page in `main.tsx`, so a broken view shows a recoverable card instead of a blank app.
- **Hamburger help:** `src/components/layout/header/mobile-menu/digits-help-submenu.tsx`, opened by the
  `'help'` submenu in `use-mobile-menu-config.tsx` / `mobile-menu.tsx`.
- **Blocks guide (hamburger):** the `'blocks'` submenu ("Blocks help") renders
  `mobile-menu/blocks-help-submenu.tsx`, an accordion over the five Blocks-menu groups — Digits plus the
  four observer groups. Its content comes from `mobile-menu/blocks-help-data.ts`, which reads `GROUPS` /
  `blocksInGroup` from `observer-catalog.js`, so the block lists cannot drift from the palette; per block
  it shows only the observer `help` text that differs from the generic
  `<label>. Evaluated only on a real market event; missing data is Inconclusive.` sentence. Adding a
  group to `GROUPS` shows it here automatically, but its "what it is / how to use it" copy needs an entry
  in that file's `GROUP_TEXT`.
- **Blockly digit blocks:** implemented — `digits_over_under`, `digits_even_odd`,
  `digits_matches_differs`, `digits_frequency`, `digits_frequency_count`, `digits_hot_cold`,
  `digits_streak`, plus the digit-analysis set `digits_gap`, `digits_longest_run`,
  `digits_parity_share`, `digits_transition_count` and `digits_repeat_share`, live in
  `src/external/bot-skeleton/scratch/blocks/Digits/` and show up under the Bot Builder's "Digits"
  category (its Blocks-menu flyout lists them with an add button). Mind the import depth: those files
  sit one level under `blocks/`, so shared helpers come from `../../utils` — importing
  `modifyContextMenu` from `../../../utils` breaks the whole dev build.
- The count / hot-cold / streak blocks call `Bot.getDigitCount`, `Bot.getHotColdDigit(mode, sample)`
  and `Bot.getDigitStreak()`. Those helpers live in `services/tradeEngine/trade/Ticks.js` and are
  exposed through `services/tradeEngine/Interface/TicksInterface.js` — both files must be updated
  together, or the generated code calls an undefined function.
- **Digit analysis blocks** (`digits_gap`, `digits_longest_run`, `digits_parity_share`,
  `digits_transition_count`, `digits_repeat_share`) call `Bot.getDigitGap(digit)`,
  `Bot.getLongestDigitRun(digit, sample)`, `Bot.getDigitParityShare(parity, sample)`,
  `Bot.getDigitTransitionCount(from, to, sample)` and `Bot.getDigitRepeatShare(sample)`. The rules
  themselves are pure functions in `services/tradeEngine/utils/digit-analysis.js` (tested by
  `utils/__tests__/digit-analysis.test.js`); `Ticks.js` only slices the sample from the engine's own
  `getLastDigitList()` and wraps the result in a promise. A digit that never appeared reports gap
  `-1` (never `0`, which means "the newest tick"), and an empty window reports a 0 share rather than
  an invented one. `digits_gap` has no SAMPLE input on purpose: it reads the whole cached history, so
  a digit last seen 300 ticks ago is not reported as "never".
- **Digit blocks guide:** the toolbar's `?` icon (`#db-toolbar__digit-help-button` in
  `toolbar/workspace-group.tsx`) opens `toolbar/digit-blocks-help.tsx`, a step-by-step modal for the
  digit blocks. Its stylesheet widens the shared dialog (`dc-dialog__dialog`) and makes
  `dc-dialog__content` scroll. Note the flyout `+` buttons are hover-revealed
  (`flyout__button-add--hide`), so a scripted click reports `found: false` — hover first, or drive it
  by hand.

### Verifying these tabs
- The tab targets are the `<li>` elements `#id-digits`, `#id-statistics` — click these to
  switch; the URL hash only selects a tab on first load, not after mount.
- Digits: check the market-conditions panel, the chart cursor + ticker trail and the digit-circle marker.
  The floating "Scan markets" button is app-wide now — it is present on every tab and draggable.
- The scanner returns ~8 volatility markets; picking one switches the whole tab to that market.
- Known pre-existing console warning: `Failed to load image` (branding logo) — unrelated to this work.

## Observer blocks in the Bot Builder
The former "Bots" tab is gone: `src/pages/bots/`, the `/bot-lab.html` Rsbuild entry and the isolated
observer workspace were removed, and the observational block language now ships in the ordinary Bot
Builder palette. `rsbuild.config.ts` has a single `index` entry again.
- `src/external/bot-skeleton/scratch/blocks/Observer/observer-catalog.js` is the single source of
  truth — pure data, deliberately free of any `window.Blockly` access so React can read it while
  rendering the toolbox. It exports `CATEGORIES` (the 15 original observer categories), `BLOCKS` (one
  spec per block: `type: 'obs_<id>'`, `label`, `category`, `op`, `fields`, `inputs`, `body`,
  `output`), and `GROUPS` — the four palette groups below, each with a colour triple and the list of
  categories it owns.
- `Observer/index.js` walks `BLOCKS` and registers each spec as a real block (field types come from
  the spec, `inputs`/`body` become `input_value`/`input_statement` sockets; `op === 'if_else'` adds an
  `else` statement) and then imports `./generator`, so those two files are the only ones in that
  folder touching `window.Blockly`. The folder is picked up by `blocks/index.js`
  (`import './Observer'`), so no extra wiring is needed.
- `Observer/generator.js` registers one JavaScript generator per observer block, and every generated
  call is a hand-back to the observer runtime (`services/observer/`) rather than a second
  implementation of the language: a condition emits `Bot.observerCondition(block_id)`, any other
  value block emits `Bot.observerValue(block_id, neutral)`, and a statement block emits
  `Bot.observerStatement(block_id)`. An event block ("When …") and any block that belongs to a
  canvas-driven observer program (its stack root is an observer block) emit a comment instead — the
  runtime dispatches those from the tick stream, so generating them would run them twice.
  `BotInterface.js` exposes those three calls next to `observerEntryPassed`. Without a generator for
  a block type `Run` failed with
  `JavaScript generator does not know how to generate code for block type "obs_…"`.
- The palette entry point is `src/pages/bot-builder/toolbox/toolbox-items.tsx`: right after the
  legacy `digits` category it maps `GROUPS` to four `<Category>` elements and lists each group's
  blocks with their default field values. The legacy trading categories are untouched.

| Group id | Palette name | Observer categories inside |
| --- | --- | --- |
| `observer_digit_frequency` | Digit & frequency | Digits, Digit Conditions, Frequency & Stability, Matches & Differs, Over & Under, Even & Odd, Digit Statistics |
| `observer_pattern_parity` | Pattern detection & parity | Pattern Detector, Pattern State, Even/Odd Patterns, Streaks & Transitions |
| `observer_control` | Observer control | Bot Control, Market Selection, Logic & Comparison, Variables |
| `observer_entry_monitoring` | Entry & monitoring | Entry Conditions, Restart & Cooldown, Stop & Safety, Learning & Observation, Notifications, Observational Controls, Strategy Comparison |

- Field names that must stay whole numbers (`PERCENT`, `TOLERANCE`, `VALUE`, `LOW`, `HIGH`) are pinned
  to `precision: 0` in `Observer/index.js`; every other number field keeps one decimal. A block's
  colour comes from its group, and `meta()` returns the localised label/description used by search.
- Verify by opening `#bot-builder`: each of the four groups expands in the palette, and dragging one
  of its blocks onto the canvas places it with its default field values preserved. To check
  generation without a logged-in account (Run is login-gated), load a workspace XML of observer
  blocks into a scratch workspace and call
  `window.Blockly.JavaScript.javascriptGenerator.workspaceToCode(workspace)`: it must not throw; an
  observer block sitting inside an ordinary trading block must emit
  `Bot.observerCondition(…)` / `Bot.observerValue(…)` / `Bot.observerStatement(…)`, and an event hat
  or a free-standing observer program must emit a comment only.
- Note: adding a category to `CATEGORIES` without listing it in one of `GROUPS` makes its blocks
  invisible in the palette, since `toolbox-items.tsx` renders groups, not categories.
- Production build verification can use a temporary Rsbuild config in `/tmp` overriding only
  `output.distPath.root`, avoiding churn of tracked `dist/` assets (do not commit such a config).

### What the observer blocks actually do at run time
`src/external/bot-skeleton/services/observer/` is a bounded, deterministic reader of the canvas: it
reads blocks off the workspace (`observer-program.js`), walks them with an operation budget
(`observer-engine.js`), and uses `eval`/generated JS nowhere — that is why the palette's generators
stay inert placeholders. `index.js` exposes the whole thing as the `observerRuntime` singleton.
- **One tick stream.** `trade/Ticks.js` hands every genuine tick to `observerRuntime.feedTick()` from
  inside the existing subscription, so the observer never opens a second WebSocket and never invents
  data: a missing value is `Inconclusive`, which never signals.
- **Two ways a block runs.** An event hat, and a free-standing observer statement dragged straight
  onto the canvas (`program.roots`), are driven by that tick stream. A block the generated program
  reaches instead runs where the program reaches it, through
  `observerRuntime.valueOfBlock()` / `conditionOfBlock()` / `runStatement()`. Both paths share one
  evaluation cache, cleared once per tick, so a value the program reads always belongs to the tick it
  trades on.
- **The trade gate.** `dbot.js` starts the session before generating code and asks
  `observerRuntime.gateEnabled()`; only a canvas carrying observer *entry* blocks gets
  `if (!Bot.observerEntryPassed()) { sleep(1); continue; }` injected into the generated loop.
  `Bot.observerEntryPassed()` (`BotInterface.js`) consumes the signal exactly once per entry, so the
  existing trade setup — amount, contract, duration — is untouched and starts a trade only when the
  observed conditions pass. A canvas with no observer entry blocks generates the loop it had before.
- Stop paths (`stopBot`, `terminateBot`) call `observerRuntime.detach()`, so a stopped bot feeds no
  more ticks; without that the session would outlive the bot.
- **The canvas is validated before a session starts.** `observer-validate.js` checks every block
  `readProgram` returned: a block with no evaluator, an `obs_…` type this version no longer defines
  (recorded as `program.unknown`), or a "When …" hat whose event the tick stream never raises
  (`DISPATCH_EVENTS` in `observer-engine.js`) is written to the journal and the observer session is
  not started at all — the bot then runs the plain trading program it had before those blocks. An
  unconnected socket or an empty field is a warning only, and the block stays Inconclusive. Adding a
  "When …" hat means adding its event to `DISPATCH_EVENTS` and raising it from the engine (a hat with
  no matching `dispatch('…')` call would never run).
- Unit coverage lives in `services/observer/__tests__/` — `observer-engine.test.js` (runtime),
  `observer-generation.test.js` (one generator per palette block, plus every block in
  `scratch/blocks` has a `forBlock` registration) and `observer-validation.test.js` (validation,
  every "When …" hat's event is raised, ops kept for renamed blocks). Run them with
  `docker compose exec web npx jest src/external/bot-skeleton/services/observer`. Run is
  login-gated, so the trade itself is verified by hand; the engine logic is covered by the tests.

## Strategy Learning blocks (Bot Builder)
The "Strategy Learning" palette category (`strategy_learning`) measures how each **named** strategy
actually performed, from contracts the engine really settled. It never simulates or predicts.
- Blocks live in `src/external/bot-skeleton/scratch/blocks/Strategy Learning/` (note the space in the
  folder name) and are imported by `blocks/index.js`. Category constant:
  `window.Blockly.Categories.Strategy_Learning` in `scratch/hooks/constant.js`; palette entry:
  `toolbox-items.tsx`.
- The eight blocks are `learn_set_strategy` (statement: label following trades), `learn_hit_rate`,
  `learn_sample_size`, `learn_streak` (wins/losses), `learn_best_strategy`, `learn_compare`,
  `learn_report` and `learn_reset`. A **blank name field** means "the strategy currently being
  learned"; `learn_compare` needs both names.
- Rules are pure functions in `services/tradeEngine/utils/strategy-learning.js` (tested by
  `utils/__tests__/strategy-learning.test.js`). A settlement counts as a win only when
  `profit > 0` — the same rule as the statistics panel, so a flat contract is a loss. The streak is
  signed internally (+ wins, − losses) and `learn_streak` reports 0 for the kind that is not running.
- `trade/StrategyLearning.js` is a trade-engine mixin (outermost wrapper in `trade/index.js`). It
  records from the existing settlement hook in `Total.js` — `recordLearningSettlement({ profit })`
  runs next to `recordRiskSettlement` — and is exposed through
  `Interface/LearningInterface.js`, spread into the bot interface in `Interface/index.js`. Every read
  is synchronous, so the blocks work inside ordinary IF/AND/OR conditions.
- **Fails closed:** `learn_best_strategy` answers an empty text and `learn_compare` answers false
  when a strategy has fewer than the minimum settled trades. `statistics.clear` resets the learning
  memory, matching the session semantics of the other engine blocks.
- Verify: `npx jest src/external/bot-skeleton/services/tradeEngine/utils/__tests__` (66 tests) and
  `npx jest src/external/bot-skeleton/services/observer/__tests__/observer-generation.test.js`
  (every block tree type has a generator). In the Bot Builder palette the "Strategy Learning"
  category lists the eight blocks; a scratch workspace containing them generates
  `Bot.learnSetStrategy("…")`, `Bot.learnHitRate(…)`, `Bot.learnSampleSize(…)`,
  `Bot.learnStreak(…, "losses")`, `Bot.learnBestStrategy("hit_rate", 10)`,
  `Bot.learnCompare("a", "b", 5)`, `Bot.learnReport()` and `Bot.learnReset()` without console
  errors. Real per-strategy numbers need settled contracts, so they are verified by hand with a Demo
  account (Run is login-gated).

## Trading & Execution, Bot Control and Reporting blocks (Bot Builder)
The last three engine-backed palette categories. They read what the trade engine already did and
never trade, size a stake or stop a session on their own initiative.
- Blocks: `scratch/blocks/Trading Execution/`, `scratch/blocks/Bot Control/` and
  `scratch/blocks/Reporting/` (folder names carry the space, like the other engine folders), imported
  by `blocks/index.js`. Category constants: `window.Blockly.Categories.Trading_Execution` /
  `Bot_Control` / `Session_Reporting` in `scratch/hooks/constant.js`; palette entries in
  `toolbox-items.tsx` (`trading_execution`, `bot_control`, `session_reporting`).
- Eleven blocks: `exec_last_result`, `exec_last_profit`, `exec_session_profit`, `exec_session_trades`,
  `exec_open_contracts`, `exec_has_open_contract`, `exec_wait_settlement` (the only statement with a
  promise), `bot_stop`, `bot_trade_limit_reached`, `report_session` and `report_journal`.
- Rules are pure functions in `services/tradeEngine/utils/session-control.js` (tested by
  `utils/__tests__/session-control.test.js`). A contract is counted when the engine bought it; a
  result exists only after settlement, and flat contracts (`profit === 0`) count as losses — the same
  rule as the statistics panel. `exec_last_result` answers `''` before the first settlement, and
  `sessionSummary` says "no contracts taken yet" instead of printing zeros as a measured result.
- `trade/SessionControl.js` is the outermost trade-engine mixin in `trade/index.js`. It records from
  the existing hooks — `recordSessionEntry()` next to `recordRiskEntry` in `Purchase.js`,
  `recordSessionSettlement({ profit, stake })` next to `recordLearningSettlement` in `Total.js` — and
  `statistics.clear` resets it.
- **It does not keep its own open-contract counter.** `sessionOpenContracts()` reads `this.contractId`,
  the id the engine is actually holding, so a settled or abandoned contract can never leave a phantom
  blocking position. `exec_wait_settlement` resolves on the engine's own settlement (`contractId`
  cleared or scope `STOP`), never on a timer, and resolves `false` immediately when nothing is open.
- **Stopping goes through the existing path.** `stopBotWithReason` emits `bot.stop_button_click` — the
  same event the run panel's Stop button emits — so the open contract is still allowed to settle, the
  subscriptions are cleared and the UI reports a normal stop. It is one-shot per session, and the
  reason is journalled through `ui.log.notify`.
- Interface split: the synchronous reads live in `Interface/SessionControlInterface.js` (spread into
  `getInterface()` like the risk surface); the one promise is exported as
  `getSessionControlAsyncInterface` and wrapped with `createAsync` in `utils/interpreter.js` — mixing
  a sync value into that promise map would suspend the interpreter on a non-promise.
- A trade limit of `0` or less means "not set" and never stops a session; `report_journal` writes text
  verbatim at info/warn/error, and an unknown level falls back to info.
- Verify: `docker compose exec web npx jest src/external/bot-skeleton/services/tradeEngine/utils/__tests__`
  (79 tests) plus
  `npx jest src/external/bot-skeleton/services/observer/__tests__/observer-generation.test.js`
  (every block in the tree has a generator). In the palette the three categories list the eleven blocks;
  a scratch workspace containing them generates `Bot.sessionWaitForSettlement()`,
  `Bot.sessionStop(…)`, `Bot.sessionJournal(…, "warn")`, `Bot.sessionLastResult()`,
  `Bot.sessionLastProfit()`, `Bot.sessionProfit()`, `Bot.sessionTradesTaken()`,
  `Bot.sessionOpenContracts()`, `Bot.sessionHasOpenContract()`, `Bot.sessionTradeLimitReached(3)` and
  `Bot.sessionReport()` without console errors. Real settlement numbers need a logged-in account, so
  the live path is verified by hand with a Demo account (Run is login-gated).

## AI Bot module (tab removed — code unused but kept)
The AI Bot tab (`#ai_bot`) was removed from the app: `main.tsx` no longer wraps `<Tabs>` in
`AiBotProvider` or lazy-loads `AiBotPage`, and `DBOT_TABS` / `TAB_IDS` / the `hash` array in
`main.tsx` no longer carry an entry for it. `src/pages/ai-bot/` is unused but kept (same as
`src/pages/dtrader/`), so the notes below still describe how it works; restoring the tab means
putting those four places back, in the same tab order.
- **Provider placement.** `AiBotProvider` wraps `<Tabs>` in `main.tsx` (inside `DigitsLabProvider`),
  so the engine — and a running session — survives tab switches. `useAiBot` seeds its state from
  `createBotEngineState()` exported by `bot-engine.ts`: the component tree renders once *before* the
  mount effect creates the engine, and an empty `{}` state made `DashboardPanel` throw on
  `session.realizedProfit`. Any new field on `BotEngineState` belongs in that factory too.
- **The scanner owns its socket.** `scan.ts`/`scanner.ts` opens one short-lived
  `DerivPublicWebSocketClient` per scan (`src/pages/digits/deriv-public-ws.ts`) over
  `filterDigitMarkets`, requests `ticks_history` with **`subscribe: 1`** and sends `forget`
  immediately (same v3 quirks as the Digits lab). It sends no authenticated messages and can be run
  while logged out. One scan returns ~13 volatility markets and takes a few seconds.
- **Two sockets, deliberately separate.** `auth-ws.ts` is the authenticated socket (authorize,
  balance, proposal, buy, `proposal_open_contract`); `AuthTradingWebSocket` never connects in its
  constructor, so merely mounting the provider opens nothing. Execution is login-gated: Start Bot
  stays disabled until `state.auth.status === 'authorized'`, and real mode needs the explicit
  confirmation modal in `auth-panel.tsx` before it can be switched on.
- **One login for the whole app.** The AI Bot has no login button of its own — it rides the header's
  Deriv login (the same `auth_info` token `generateOAuthURL` writes), so a logged-in header session is
  all the scanners and execution need. `use-ai-bot.ts` connects the auth socket when that session
  exists and drops it when the session ends, keyed on `activeLoginid` **and `isAuthorized`** from
  `useApiBase()` (same-tab login/logout — note `client.logout()` does NOT reload the page, so the
  `storage` event alone would miss it; `isAuthorized` catches the header finishing authorization a
  moment after the account id appears, and re-running the effect is harmless because `connect()`
  reuses an open socket) plus the `storage` event for other tabs. `auth-panel.tsx` therefore renders only a pointer
  to the top-right Log in, and a Reconnect button once a token exists. OAuth login is a full-page
  redirect, so the mount run of that effect is what picks up a fresh login.
- **Trade ledger.** `BotEngineState.positions` (`trade-ledger.ts`, pure functions) is the single
  record of every contract the bot bought in the session: one `TradePosition` per contract, created
  on the buy acknowledgement, refreshed from each `proposal_open_contract` message, and completed by
  `applySettlement` with the settlement result — so a closed position keeps its final contract status
  (e.g. `sold`) and its won/lost result instead of vanishing from the UI. The ledger is reset when a
  session starts, and `openPositions()` is what the risk manager counts for `maxConcurrentContracts`
  (this replaced the older parallel `openContracts` array). `components/trade-monitor.tsx` renders it
  as the Trade Monitor's **Summary** (open positions with live contract status / profit, plus session
  totals), **Transactions** (every position with status + settlement result) and **Journal** views;
  the journal gets one line when a position opens and one when it closes (settlement + contract
  status).
- **Real-money confirmation gate.** A real-money entry is never submitted straight from the scanner:
  `processRankings` stops at `ExecutionEngine.prepare()`, which quotes the order on the authenticated
  socket and holds it, and publishes `state.pendingTrade` (order details + the live Deriv quote) with
  `botState: 'Awaiting Confirmation'`. `components/trade-confirmation.tsx` renders that as a modal
  dialog (market, contract, prediction, stake, duration, account, price, payout and Deriv's own
  contract description) and nothing is bought until `confirmPendingTrade()` runs — `buyPrepared()` —
  which re-quotes the exact same contract when the approved quote went stale (`onQuoteRefreshed` logs
  it in the journal). `cancelPendingTrade()` (the dialog's Cancel, plus Stop Bot and Pause) forgets
  the proposal, places no order and logs it; the scan loop refuses a second entry while one is
  pending (`pendingEntry` guard, and `isBotBusy()` keeps the scan tick from clobbering the state).
  Demo-mode entries still execute in one step — `execute()` is now just `prepare()` + `buyPrepared()`.
  The dialog needs a real authorized account, so its live path is verified by hand; the gate itself
  (quote-then-buy, cancel places nothing, stale re-quote, over-stake rejection) is unit-tested.
- **Persistence.** Settings, strategies and scanner config are written to localStorage under
  `aibot_settings` / `aibot_strategies` / `aibot_scanner_config` (see `constants.ts`). Any UI check
  that toggles them leaves a stored list behind — remove the key afterwards to restore the defaults.
  The trade ledger has its own key (`aibot_ledger`) — see "Trade sync" below.
- **Trade sync (the ledger survives reloads and both accounts).** `trade-sync.ts` persists
  `BotEngineState.positions` + `journal` to localStorage under `aibot_ledger`. Both trading accounts
  share the one ledger, and every position (`trade-ledger.ts` `createPosition`) and journal line
  (`BotEngine.log()`) is tagged with its `accountMode` + `loginid`, so the Transactions list and the
  Journal keep Demo and Real apart. Wiring: `createBotEngineState()` seeds itself from
  `loadLedger()`, and `BotEngine.update()` calls `saveLedger()` whenever the positions or journal
  array identity changes (so contract updates persist, unrelated updates do not).
  - **Only settled positions are restored.** An open contract's socket subscription is gone after a
    reload, so restoring it as `status: 'open'` would leave a phantom position that counts against
    `maxConcurrentContracts` and blocks new entries. `loadLedger()` therefore filters to
    `status === 'settled'`, and `start()`/`quickTrade()` clear the session with
    `settledPositions(...)` instead of `positions: []` so history is kept but stale opens are dropped.
  - Covered by `__tests__/trade-sync.test.ts` (round-trip of both accounts, settled-only, cap, empty/
    corrupt storage); `trade-ledger.ts` adds the `settledPositions()` helper next to `openPositions()`.
  - `trade-monitor.tsx`'s Transactions view has an All / Demo / Real filter; `journal-panel.tsx`
    renders a DEMO/REAL tag per line.
- **Account switcher + the running lock.** `auth-panel.tsx` owns the "Trading account" Demo/Real
  toggle and the authorized-account `<select>`. Both (and Disconnect) are **disabled while a session
  is running** — `isRunning = botState !== 'Stopped' && botState !== 'Error'`, which covers Scanning,
  Setup Detected, Risk Check, Executing, Contract Open, Cooldown, Paused and Data Interrupted. The
  toggle only sets `settings.accountMode`; the engine swaps the authorized account on
  `start()`/`quickTrade()` via `ensureMatchingAccount()`, which is why switching mid-session is
  blocked rather than applied.
- **Verifying localStorage in the Base44 preview.** Seeding `aibot_ledger` from a script and then
  reloading does NOT work here: the platform replays the user's own pane storage on every fresh load
  and drops the seeded key (verified — the key came back `null` after a reload). The ledger render
  path is therefore covered by the unit tests above; drive the live path by hand with a logged-in
  account.
- **Strategy digit sentinel.** `StrategyConfig.digit === null` means "use the AI suggestion" (the
  hottest digit for Matches, the coldest for Differs) and `scanner.ts` resolves it with
  `strategy.digit ?? hottest?.digit`. The selector's "Auto" button must therefore write `null`, never
  a sentinel like `-1`, which would end up as an invalid `barrier: '-1'` in the proposal request.

### Verifying this tab
- **The tab is gone from the UI**, so there is no `#id-ai-bot` `<li>` to click and the page is
  unreachable through the app. When the tab is restored, clicking it (URL hash `#ai_bot`) should
  show the hero title, the state
  chip "Stopped", and five panel headings: Live Market Scanner, Last Signal & Execution, Strategy
  Selection, Trading Settings and Trade Monitor. The Trade Monitor has four tabs (`.aibot-tab`:
  Summary / Transactions / Analysis / Journal) that each render an empty state while logged out
  (`No open positions…`, `No positions yet…`, `No events yet.`).
- `trade-ledger.ts` is covered by `__tests__/trade-ledger.test.ts`, the confirmation gate by
  `__tests__/execution-engine.test.ts` (quote-then-buy, cancel places nothing, stale re-quote,
  over-stake rejection — a fake message bus, no network) and the dialog's contents and buttons by
  `__tests__/trade-confirmation.test.tsx`: `docker compose exec web npx jest src/pages/ai-bot`. The
  live position rows, their settlement results and the real-money dialog (it renders only for a real
  authorized account) are verified by hand.
- "Scan now" is the anonymous-safe check: within a few seconds ~13 ranked rows appear, each with a
  score, a Passed/Failed condition list and (for a qualifying setup) a `Strategy: …` line. No
  sideways scroll at 431px; the two-column grid collapses to one at ≤768px.
- `npm run type-check` (`docker compose exec web npx tsc --noEmit`) is clean and is the real gate
  here; the Rsbuild dev build strips types. `npx eslint` does **not** run in this sandbox —
  `eslint-plugin-react` is missing from the installed tree — so don't read its failure as a lint error.
- Run/Pause/Stop, the proposal → buy → settle path and the login redirect are all login-gated, so
  they are verified by hand against a real Deriv account, not in the preview.

### Auth WebSocket fix ("Request timed out: balance")
The `AuthTradingWebSocket` in `auth-ws.ts` was timing out on the `balance` request after the OTP
WebSocket connected. Root causes and fixes:
- **Missing `Deriv-App-ID` header**: `DerivWSAccountsService` (the service that fetches the accounts
  list and the OTP URL) omitted the `Deriv-App-ID` header that the vendored `deriv-core/auth/accounts.ts`
  reference includes on every authenticated REST call. Without it the OTP fetch can fail silently. Both
  `fetchAccountsList` and `fetchOTPWebSocketURL` now send the header from `process.env.NEXT_PUBLIC_DERIV_APP_ID`.
- **Silent fallback to the public WS**: `resolveWsUrl` used to catch OTP-fetch failures and fall back
  to `getPublicWsUrl()`. The public market-data WebSocket ignores `balance` (it's for public data only),
  so the request timed out instead of reporting a clear auth error. The fallback is removed — the error
  is thrown and surfaced as `authPhase: 'failed'`.
- **`sendAndWait` matched by `req_id` only**: the working `DerivAPIBasic` library matches responses by
  `msg_type`; if the Options API omits `req_id` in a response, the old `req_id`-only match never resolved.
  `sendAndWait` now uses a pending-requests map: it matches by `req_id` when present, falls back to
  `msg_type` otherwise (same strategy as `DerivAPIBasic`). A `connectionId` epoch discards stale
  responses from a previous connection, and all pending requests are rejected on close.
- **Auth and balance conflated**: a balance timeout was reported as "authorization failed" even though
  the OTP `onopen` event already proved the connection is authenticated. The state machine now has
  distinct phases: `connecting` → `authenticated` (socket open) → `loading_balance` → `ready` (balance
  received). A balance failure sets `authPhase: 'balance_error'` with a "Balance retrieval failed"
  message, not `failed` — so the diagnostics panel distinguishes a balance problem from an auth problem.
- **OTP cache**: `fetchOTPWebSocketURL` cached the OTP URL promise for 100ms. An OTP is single-use
  (120s, one connection), so a cached URL could be handed to a second consumer that the first already
  consumed. The cache is now cleared immediately after the promise settles.
- The `auth-ws.test.ts` mock `WebSocket` now uses numeric `readyState` values (`OPEN = 1`, etc.)
  matching the real spec, so `AuthTradingWebSocket.send()` actually sends in tests. Seven tests cover
  the balance-verify flow, the no-token case, the no-fallback-to-public-WS case, `msg_type` fallback
  matching, and subscription cleanup.

## Demo/Real auto-switch, Quick Trade, Analysis tab, Deriv Chart rename

### Demo & Real both work (auto-switch)
`bot-engine.ts` `start()` used to hard-error when the authorized account type
(demo/real) did not match `settings.accountMode` — so a user logged into a real
account could not start in demo mode (and vice versa). It now calls
`ensureMatchingAccount()`, which finds the matching account in
`state.auth.accounts` and calls `selectAccount()` (disconnect + reconnect on the
matching loginid) before proceeding. It only errors when no matching account
exists in the authorized list. The auth-panel mode-mismatch banner is now
informational (it tells the user the bot will auto-switch), not an error.
- `quickTrade()` (new) reuses the same `ensureMatchingAccount()` guard, so a
  one-shot Quick Trade also works in whichever mode is selected.
- The `singleTrade` flag makes the bot stop after one trade settles (the
  `onSettled` callback checks it before the auto-restart/cooldown branch).
  `stop()` and `cancelPendingTrade()` reset it.

### Quick Trade (automation tool)
`quickTrade()` on `BotEngine` (exposed via `use-ai-bot.ts` as `quickTrade`):
scans once, evaluates strategies, runs risk checks, and executes a single
entry on the best qualifying market — then stops after it settles. Real mode
still goes through the confirmation gate. It refuses to run while the bot is
already auto-running. `components/automation-panel.tsx` renders the button
alongside the Start/Stop auto-trading controls.

### Analysis tab (analysis tool)
`components/analysis-view.tsx` renders inside the Trade Monitor as a fourth tab
(Summary / Transactions / **Analysis** / Journal). It reads the top-ranked
market's `MarketAnalysis` from `state.rankings[0].analysis` and shows per-digit
frequency bars (hot/cold/over/under coloured), even/odd and high/low split bars,
the current streak, sample size and feed freshness. Empty state prompts to
"Scan now" when no rankings exist.

### DTrader → Deriv Chart
The third tab (index 2, `#id-charts`) no longer embeds the DTrader iframe
(`src/pages/dtrader/dtrader-tab.tsx` is unused but kept). It now renders the
app's own SmartChart via `ChartWrapper` (`src/pages/chart/chart-wrapper.tsx`)
with `show_digits_stats={false}`. The tab label, loading message and
ErrorBoundary label all say "Deriv Chart". The `derivDtrader` service domain in
`routes.ts` is untouched — it powers standalone links (cashier, reports, etc.),
not the tab.

## Strategy Engine tab (reactive digit-market evaluation)
The seventh main tab, `#strategy_engine`, lives in `src/pages/strategy-engine/`
and is lazy-loaded from `main.tsx` like the other pages. It sits **right after
Bot Builder** (index 2), so `DBOT_TABS` / `TAB_IDS` / the `hash` array in
`main.tsx` are now: Dashboard, Bot Builder, **Strategy Engine**, Deriv Chart,
Digits, Statistics — keep the three in the same order. It reuses the
shared public feed (`useDigitsLabContext` from the Digits lab), so it opens no
second WebSocket and reads the same market the Digits/Statistics tabs show.
- **Pure engine** (`strategy-engine-core.ts`): eight strategy modules
  (OVER_1, OVER_2, UNDER_7, UNDER_8, EVEN, ODD, MATCHES, DIFFERS) over a
  20/50/100-tick window. Digit parsing is never done here — it consumes digits
  already extracted string-safe upstream by `digits/precision.ts`. Every
  conditional filter is documented inline with its probability reasoning.
  `resolveOutcome` simulates a win/loss on the *next* tick for the circuit
  breaker; flat staking (`FLAT_STAKE`) is hardcoded — there is no Martingale
  path anywhere.
- **Reactive layer** (`use-strategy-engine.ts`): drives evaluation from the live
  tick stream, throttled to one dispatch per `EVAL_THROTTLE_MS` (100ms) so the UI
  never locks. Owns per-strategy runtime: pending outcomes, the circuit breaker
  (3 consecutive losses → OFF + 5-min cool-down, then auto-rearm), and the flash
  event the dashboard animates on a threshold breach.
- **Dashboard** (`strategy-engine-page.tsx` + `.scss`): hero, market selector
  (reused from Digits), window toggle, flash banner, overview (latest digit /
  sample / window / active count / recent-digit trail), an 8-card grid where
  each card flashes (`se-card--flash`) the instant its entry fires, and a
  recent-outcomes log. `StrategyCard` shows the contract type, target digit, a
  mini frequency bar, W/L/win-rate/loss-streak, and Pause/Reset controls.
- **Verifying:** click `#id-strategy-engine`; expect the hero, the flash banner,
  8 strategy cards, and the window toggle. With a live feed (Volatility 100),
  a card flashes green + the banner shows "Entry signal — <strategy> on
  <market> · digit N" when a threshold breaches. No sideways scroll at 431px
  (the grid collapses to one column below 640px). `npx tsc --noEmit` is clean.

## Advanced analytics engines (Digits tab)
Five quantitative engines render inside the Digits tab, after the existing walk-forward
backtest panel, via `components/lab-engines-section.tsx`. They read the ONE shared public
feed through `useLabEngines()` (`src/pages/digits/use-lab-engines.ts`) — no second WebSocket.
Pure modules live in `src/pages/digits/engines/` with no React/network coupling, so they are
unit-tested in isolation (`engines/__tests__/lab-engines.test.ts`, 21 tests).
- **Engine A** `velocity-matrix.ts` — Frequency % = Count / WindowSize × 100 over five
  concentric windows (20/50/100/500/1000). A digit is flagged PEAK/EXHAUSTED only when *every*
  window that has data agrees it sits outside the 8–12% band (8/12 are inclusive; use
  `CONVERGENCE_LOW_PERCENT` / `CONVERGENCE_HIGH_PERCENT`, not literals).
- **Engine B** `entropy-tracker.ts` — H(X) = −Σ P·log₂P. Ceiling `MAX_ENTROPY` = log₂(10)
  ≈ 3.3219; `STRUCTURAL_CLUSTER` below 2.95 bits, `PURE_NOISE` at or above. The state is
  binary per the agreed contract; `purityRatio` is published alongside so the UI can show how
  near the ceiling a reading actually is. Uses the page's selected analysis window.
- **Engine C** `latency-guard.ts` — `isExecutionSafe` is false when the round-trip exceeds 40%
  of the average tick interval (`PING_BUDGET_SHARE`), and **fails closed** when either
  measurement is missing (an unmeasured guard shows "Guard measuring", not a false warning).
  The Digits tab owns no execution button, so the flag is surfaced as a warning only.
- **Engine D** `scattergram.ts` — `{ tickIndex, digit, epoch }` traced back from the live frame
  (0) to −100, plus a per-digit gap coefficient of variation (clustered vs rhythmic).
- **Engine E** `walk-forward.ts` — index-by-index walk; `shouldEnter` receives ONLY the trailing
  20-tick state window ending at `i`, and the outcome reads strictly `digits[i + 1]`. The
  enforcement is structural (the runner never builds a slice reaching past `i`), and
  `lookaheadViolations` stays 0.
- `sanity.ts` shapes all five into the `MarketSanityMetrics` broadcast contract; unknown
  measurements broadcast as 0 while `isExecutionSafe` stays false so "unmeasured" is never
  mistaken for "safe".
- **Verifying:** open `#id-digits`; below the walk-forward backtest panel expect the
  "Advanced analytics engines" heading and five panels (matrix, entropy gauge, latency guard,
  scattergram, zero-lookahead walk-forward). Out-of-band matrix cells are tinted red (>12%) /
  blue (<8%). Run `docker compose exec web npx jest src/pages/digits/engines`.
  `npx tsc --noEmit` clean. No sideways scroll at 431px (the matrix scrolls inside its own panel).

## AI Builder tab (AI Bot Architect)
Second tab (`#ai_architect`, `#id-ai-architect`, `DBOT_TABS.AI_ARCHITECT = 1`), lazy-loaded from
`main.tsx` like the other pages. `DBOT_TABS`, `TAB_IDS` and the `hash` array must stay in the same order.
The page is `src/pages/ai-architect/ai-architect-page.tsx` (+ `ai-architect.scss`, all `aa-*` classes).
- It only ever uses blocks the capability registry says are registered; **Load into Bot Builder** goes through
  `use-architect-loader.ts`, which snapshots the canvas, loads, reads the live workspace back and restores the
  snapshot on any mismatch. Loading never starts the bot, and is refused while one is running.
- The tab icon is `LabelPairedLightbulbCaptionRegularIcon` (quill-icons has no Brain/Robot icon; a missing
  export breaks the whole dev build).
- Verify: open the tab, press Generate on an example prompt (expect a "Validation Passed" card), then Load —
  the app switches to `#bot_builder` and the canvas holds the generated blocks.
  `docker compose exec web npx jest src/pages/ai-architect` (83 tests); `npx tsc --noEmit` is clean.
