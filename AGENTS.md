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
Read-only, public-market-data feature added as the 5th main tab (`#digits`). Lives entirely in `src/pages/digits/`:
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
- The main tab bar is made scrollable below desktop (`is_scrollable={!isDesktop}`) because five tabs
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
The main tab bar has five tabs: Dashboard, Bot Builder, Charts, Digits, Statistics.
Indices live in `DBOT_TABS` / `TAB_IDS` (`src/constants/bot-contents.ts`) and the `hash` array in
`src/pages/main/main.tsx` must stay in the same order. The Bots tab is gone; its block language now
ships in the Bot Builder palette (see "Observer blocks in the Bot Builder" below).

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
  `digits_matches_differs`, `digits_frequency`, `digits_frequency_count`, `digits_hot_cold` and
  `digits_streak` live in `src/external/bot-skeleton/scratch/blocks/Digits/` and show up under the Bot
  Builder's "Digits" category (its Blocks-menu flyout lists them with an add button). Mind the import
  depth: those files sit one level under `blocks/`, so shared helpers come from `../../utils` —
  importing `modifyContextMenu` from `../../../utils` breaks the whole dev build.
- The count / hot-cold / streak blocks call `Bot.getDigitCount`, `Bot.getHotColdDigit(mode, sample)`
  and `Bot.getDigitStreak()`. Those helpers live in `services/tradeEngine/trade/Ticks.js` and are
  exposed through `services/tradeEngine/Interface/TicksInterface.js` — both files must be updated
  together, or the generated code calls an undefined function.
- **Digit blocks guide:** the toolbar's `?` icon (`#db-toolbar__digit-help-button` in
  `toolbar/workspace-group.tsx`) opens `toolbar/digit-blocks-help.tsx`, a step-by-step modal for the
  digit blocks. Its stylesheet widens the shared dialog (`dc-dialog__dialog`) and makes
  `dc-dialog__content` scroll. Note the flyout `+` buttons are hover-revealed
  (`flyout__button-add--hide`), so a scripted click reports `found: false` — hover first, or drive it
  by hand.

### Verifying these tabs
- The tab targets are the `<li>` elements `#id-digits`, `#id-statistics` — click these to
  switch; the URL hash only selects a tab on first load, not after mount.
- Digits: check the market-conditions panel, the chart cursor + ticker trail, the digit-circle marker
  and the floating "Scan markets" button.
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

## AI Bot tab (AI Market Scanner & Auto-Trading)
The sixth main tab, `#ai_bot`, lives entirely in `src/pages/ai-bot/` and is lazy-loaded from
`main.tsx` like the Digits/Statistics pages. `DBOT_TABS.AI_BOT = 5`, `TAB_IDS[5] = 'id-ai-bot'` and
the `hash` array in `main.tsx` all carry the new entry — keep the three in the same order (the tab
bar is scrollable below desktop, so six tabs still fit a phone).
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
- **Persistence.** Settings, strategies and scanner config are written to localStorage under
  `aibot_settings` / `aibot_strategies` / `aibot_scanner_config` (see `constants.ts`). Any UI check
  that toggles them leaves a stored list behind — remove the key afterwards to restore the defaults.
- **Strategy digit sentinel.** `StrategyConfig.digit === null` means "use the AI suggestion" (the
  hottest digit for Matches, the coldest for Differs) and `scanner.ts` resolves it with
  `strategy.digit ?? hottest?.digit`. The selector's "Auto" button must therefore write `null`, never
  a sentinel like `-1`, which would end up as an invalid `barrier: '-1'` in the proposal request.

### Verifying this tab
- Click the `#id-ai-bot` `<li>` (the URL hash becomes `#ai_bot`). Expect the hero title, the state
  chip "Stopped", and five panel headings: Live Market Scanner, Last Signal & Execution, Strategy
  Selection, Trading Settings and Trade Monitor. The Trade Monitor has three tabs (`.aibot-tab`:
  Summary / Transactions / Journal) that each render an empty state while logged out
  (`No open positions…`, `No positions yet…`, `No events yet.`).
- `trade-ledger.ts` is covered by `__tests__/trade-ledger.test.ts`:
  `docker compose exec web npx jest src/pages/ai-bot/__tests__/trade-ledger.test.ts`. The live
  position rows and their settlement results need a real account and are verified by hand.
- "Scan now" is the anonymous-safe check: within a few seconds ~13 ranked rows appear, each with a
  score, a Passed/Failed condition list and (for a qualifying setup) a `Strategy: …` line. No
  sideways scroll at 431px; the two-column grid collapses to one at ≤768px.
- `npm run type-check` (`docker compose exec web npx tsc --noEmit`) is clean and is the real gate
  here; the Rsbuild dev build strips types. `npx eslint` does **not** run in this sandbox —
  `eslint-plugin-react` is missing from the installed tree — so don't read its failure as a lint error.
- Run/Pause/Stop, the proposal → buy → settle path and the login redirect are all login-gated, so
  they are verified by hand against a real Deriv account, not in the preview.
