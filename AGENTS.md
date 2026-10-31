# Base44 Setup Notes

## Project Type
Frontend-only Rsbuild + React Router SPA (Deriv Trading Bot / "dboteasy"). No backend, no database.
MobX stores, `@deriv-com/quill-ui` components, SCSS with CSS custom properties per theme.

## Running in the Sandbox
- `docker compose -f docker-compose.base44.yml up -d` starts the dev server.
- Two services: the one-shot `install` service owns the `node_modules` volume, and `web` (the dev server) starts
  only after `install` exits 0 (`depends_on: condition: service_completed_successfully`). Node 22 base image;
  source is bind-mounted at `/app`; `node_modules` lives in the project's named `node_modules` volume, shared by
  both services.
- Dev server listens on port 4003 inside the container, mapped to host port 3000.
- `install` runs `npm ci --no-audit --no-fund` **only** when the volume has no
  `node_modules/.package-lock.json` or its recorded `node_modules/.base44-lock-hash` no longer matches
  `md5sum package-lock.json`; otherwise it prints `node_modules already matches package-lock.json` and exits 0.
  So a repeat `docker compose -f docker-compose.base44.yml up -d` costs one hash check, not an install.
- **Nothing installs inside the running `web` container, on purpose.** An install rewrites `node_modules` under
  the live dev server and Rsbuild then dies mid-request with
  `ERR_MODULE_NOT_FOUND: @rsbuild/core/dist/0~range-parser.js` (a lazily imported chunk that had vanished from
  disk) — which is exactly why the installer is a separate one-shot service, started before `web`.
- **Never run `npm ci` / `npm install` inside the running `web` container** — it rewrites `node_modules` under the
  live dev server and kills it. Run tooling with `exec` and no install step, e.g.
  `docker compose -f docker-compose.base44.yml exec web npx jest src/pages/free-bots`. If `web` is ever restarted
  mid-serve, `restart: on-failure` brings it back.
- After a `package-lock.json` change, run `docker compose -f docker-compose.base44.yml up -d`: `install` re-syncs
  the volume and `web` starts against the finished install.

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
- **Dashboard tiles** use `@deriv/quill-icons/Standalone` glyphs inside a tinted badge whose accent comes
  from `data-tile` (`dashboard.tsx` cards + `dashboard.scss`). The `Cards` `useMemo` deps must include
  `is_mobile` / `isDesktop`: they pick the tile wording ("Local" vs "My computer"), and without them the
  labels stay at their first-render value after the viewport is resized.
- The digit-frequency grid (`.digits-grid`) is a fixed 5-column grid at every width — digits 0–4 on
  the first row, 5–9 on the second — so it never scrolls sideways on a phone; below the 768px
  breakpoint `.digit-bubble` / `.digits-badge` tighten their type and padding to keep five columns
  inside a narrow viewport.
- Digit frequency is drawn as circles (`.digit-bubble`, one SVG per digit in `digit-grid.tsx`), not
  cards: the coloured disc inside grows with the digit's share of the busiest digit, green
  (`--brand-success`) for the hottest digit, red (`--status-danger`) for the coldest, and a yellow
  (`--brand-warning`) cursor ring plus pin marks the digit the ticker is on right now. The grid takes
  `currentDigit` from the newest tick on the page — same value the distribution panel's cursor uses.
- **Bot Builder below the desktop breakpoint: one collapsible menu.** `toolbox.tsx` renders the docked
  palette only on a desktop; on a phone it renders `toolbox/mobile-tools-menu.tsx` instead — the
  collapsible "Quick strategy & blocks" panel over the top-left of the canvas. Its "Quick strategy" row
  opens the guided form (so `toolbar.tsx` no longer renders a mobile Quick strategy button, and its top
  `.toolbar` row is desktop-only; the left icon strip comes from `WorkspaceGroup`), and its "Blocks"
  section expands `toolbox/blocks-palette.tsx` — the search box plus category rows extracted out of the
  old drawer, shared with the docked desktop palette. The palette list scrolls inside the menu (its
  `.db-toolbox__category-menu` height reset in `mobile-tools-menu.scss`), so the last category is
  reachable. The old floating "Blocks" drawer tab, its scrim and `.db-toolbox--mobile` slide-in were
  removed: do not reintroduce them, and keep the category-pick callback closing the menu so the flyout
  is not covered.

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
  **110** for the first (Under 8) template and **112** for `over1_entry_every_time` — the two
  `*_entry_every_time` templates carry one `digits_frequency` "losing digit stays cold" compare per losing
  digit (see "Researched entries" below) plus a `logic_compare` `OP=EQ` per entry digit — **114** for each
  `*_two_*_digits` template (their observer gate adds the blocks), **113** for `even_odd_window`, **90** for
  `over1_parity_recovery` and **163** for the two-leg `over1_under6_recovery`. Block ids inside one asset must be unique: Blockly silently drops a
  duplicate-id block on load, so the canvas came up short of the template count (the recovery asset had
  repeated `logic_boolean` / `math_number` ids and could never validate — they are now suffixed `-2`,
  `-3`, …). **A `controls_if` also drops its branch silently when its `<mutation>` does not declare it**:
  Blockly only creates the inputs the mutation asks for (`IF1`/`DO1` need `elseif="1"`, `ELSE` needs
  `else="1"`), logs `Ignoring non-existent input ELSE in block controls_if`, and skips the whole branch
  instead of failing. The recovery asset's `freebot-o1u6-session-guard` had an `ELSE` with
  `<mutation>` missing, so its "Waiting · session guard" notify never reached the canvas and every load
  ended in the block-count message (161 held vs 163 in the template) — the
  `declares every branch its IF blocks use` test now pins the mutation against the branches each asset
  uses. `loadBot` compares the block count with `derivWorkspace.getAllBlocks(true).length`, so a
  canvas that kept blocks from a previous bot is reported as stale instead of being called valid. Keep
  that formula in sync if a template gains blocks (the unit test pins 110 for the first template only).
- **Never hang a block chain off `trade_again`'s `<next>`.** `trade_again` calls
  `setNextStatement(false)`, so it has no next connection at all. An asset that nests its
  `report_journal` chain as `trade_again`'s `<next>` loads as far as that block and then throws
  `Error: The text content is null.` from `FieldDropdown.render_` — the load aborts, the whole
  `after_purchase` stack stays unrendered, and the user sees the Bot Builder's
  "XML file contains unsupported elements. Please check or modify file." with no clue which block is
  wrong. `even_odd_window` and `over1_under6_recovery` both did this (the tail of `after_purchase`
  never reached the canvas, and the reports were dead code after `trade_again`'s `return true`); the
  report chain now sits BEFORE `trade_again` in the same `statement`, which is also the order the
  working templates use. Keep `trade_again` the last block of any stack, and reach for
  `python3 -c` / a scratch `Blockly.Workspace` check on `trade_again`'s `<next>` before shipping an
  asset: the unit tests read block TYPES and counts, so this shape loads "fine" on paper.
- **Free Bots library (seven templates).** `templates.ts` describes every asset in `src/xml/`; the first
  two are the uploaded files, and `over1_two_low_digits` / `under8_two_high_digits` derive from them by
  adding a second entry gate built from the observer blocks (`obs_ago` + `obs_compare_*` + `obs_number`,
  plus the three data-quality reads below). **Both of those gates draw on all four palette groups**: the
  digit/frequency condition (`obs_ago`, `obs_compare_*`, `obs_number`, `obs_min_sample`, `obs_freq_*`) is
  ANDed — through nested `obs_and` — with `obs_parity_switched` (Pattern detection & parity), `obs_fresh`
  (Observer control, market data within the 15 s freshness limit) and `obs_require_sample` N=100 (Entry &
  monitoring). The gate blocks therefore add six blocks per template (114 canvas count above), and
  `templates.test.ts` ("gates on all four block groups") maps every `obs_*` type in the asset through the
  catalogue's `GROUP_OF_CATEGORY` and fails unless all four `GROUPS` ids contribute — so a template cannot
  silently drop back to one group. The two `*_entry_every_time` bots carry no observer gate at all: their
  entry is the digits/frequencies/bars rule spelled out on the card (see "Researched entries" below), which
  the `$name draws on every palette group` test therefore only applies to the observer-gated templates.
  Those observer blocks sit NESTED inside the
  `before_purchase` `controls_if` → `purchase` stack, not as an `obs_entry` gate: the observer runtime
  then evaluates them through `Bot.observerCondition(...)` on the same tick, and there is no second
  gate/restart cycle competing with the template's own `after_purchase` martingale. `findEntryCondition`
  only finds a purchase that is a descendant of the `controls_if` whose `IF0` compares `last_digit`, so
  the observer `controls_if` must be nested INSIDE that DO0 (wrapping the purchase), never the other way
  round, or every observer-gated template fails the loader inspection.
- **`even_odd_window` re-scans the market after a loss.** The market-scan guard is the
  `freebot:market-scanned` variable, tested in `before_purchase` by `freebot-eo-market-pick`: when it is
  unset the loop runs `switch_best_parity_market` and then sets it, so the scan happens once. The
  `after_purchase` loss branch (`freebot-eo-rescan-after-loss`) sets it back to `FALSE`, so the next
  trade loop measures every market again and re-picks the best one before looking for an entry — a win
  leaves it set, so a winning run stays on the market it picked. Those two blocks are why the canvas
  count is 113 for this template (see the block-count note above).
- **The Even/Odd bot trades the reversal of the last 2 digits.** `eo_configure` carries the signal rule,
  so `even_odd_window` sets `RULE=reversal` and `RUN=2`: `Bot.eoSignalDirection()` then answers the parity
  the last two digits predict to break — both even → ODD, both odd → EVEN, a mixed pair → NO SIGNAL — and
  the existing `Buy EVEN` / `Buy ODD` branches buy exactly that. The window (`TICKS`) and `PERCENT` still
  gate readiness and only decide the signal under the `threshold` rule, which is what every other template
  and the Even/Odd strategy blocks use.
- **Two-leg bot (`over1_under6_recovery`):** the only template whose trade definition carries
  `contractType: 'both'`. Its `trade_definition_tradeoptions` PREDICTION input holds the
  `freebot:prediction` variable, so the primary branch sets it to 1 and buys `DIGITOVER` while the
  recovery branch sets it to 6 and buys `DIGITUNDER`; `inspectFreeBotXml`'s `recovery-leg` check fails
  unless both that purchase and the variable barrier exist. `settings.purchases` is read with
  `block[type="before_purchase"] block[type="purchase"]` — `before_purchase` is a block *type*, so a
  `before_purchase` tag selector matches nothing and silently reports zero purchases. Mind `logic_and`
  too: this builder registers `logic_operation` only, so an AND must be `logic_operation` with
  `OP=AND`, otherwise the load reports an unsupported block type.
- **`over1_parity_recovery` (the last card) keeps every number in a variable seeded by "Run once at start".** `INITIALIZATION` sets
  `freebot:over` 1, `freebot:under-prediction` 6, `freebot:loss-count` 0, `freebot:take-profit` 20,
  `freebot:stop-loss` −50 and `freebot:runs` 3 (plus a stake of 20/profit/stop/trades/initialised), and the
  blocks call those variables instead of repeating literals. Only the digit gates keep literal numbers
  (10.3% share, 1000/100-tick samples, entry digits 5/6), because their block inputs read the number
  straight from the shadow.
  - **The prediction gate sits OUTSIDE the `not initialised` guard**, chained as its `<next>`: the guard
    seeds once, while the gate must run on every trade loop — `Bot.start()` reads the trade options
    (amount *and* barrier) at the top of each loop, so `freebot:prediction` has to be current there.
    It reads `freebot:loss-count`: `EQ 0` sets prediction ← `freebot:over`, `ELSEIF GTE 1` sets it ←
    `freebot:under-prediction`.
  - **Purchase conditions branch on the loss count, not on a flag.** `before_purchase` is one
    `controls_if` with `elseif="1"`: `IF0` `freebot:loss-count EQ 0` → the Over 1 leg, `IF1`
    `freebot:loss-count GTE 1` → the Under 6 recovery. The Over 1 leg needs the newest digit to be 5 or
    6 (two nested compares, `last digit ≥ 5` then `last digit ≤ 6` — the entry inspector reads the first
    `last_digit` compare, so that one must stay the outer one and the loss-count compare above it must
    stay `last_digit`-free) with digit 0 and digit 1 both under 10.3% of the last 1000 ticks and
    `digits_bar_neutral` on digit 5 AND digit 6 (one `logic_operation` with `OP=AND` over two neutral
    reads, sample 100). The recovery leg only needs `digits_high_run` (`above` 6, COUNT ←
    `freebot:runs`): three ticks in a row above 6 — 7, 8 or 9 — where a 9 counts like 7 and 8 and a 9 on the
    newest tick never stops the wait, then it buys
    `DIGITUNDER`. Keeping the two legs as IF/ELSE-IF branches is what lets a 7, 8 or 9 reach the
    recovery — as a trailing step with the Over gate's ELSE it could never run on those digits.
  - **Both legs journal what they skip.** The recovery's `ELSE` logs `Recovery waiting · last digit N`
    (warn, silent), the Over 1 leg's `ELSE` logs `Waiting · last digit N` (info, silent), both through
    `text_join` into `freebot:notice`.
  - **`after_purchase`**: result + profit first, then `profit >= freebot:take-profit` and
    `profit <= freebot:stop-loss` both set `freebot:stop`; a win resets the stake to 10 and the loss
    count to 0, a loss lifts the stake ×2 and adds 1 to the loss count; `trade_again` runs while the stop
    is not set. The session therefore keeps trading through losses until the take profit (or the stop
    loss) is hit — there is no run cap and no digit-9 exit any more, and `freebot:recovery`/`freebot:run`
    are gone.
  - `inspectFreeBotXml`'s `findThreshold` resolves a compare whose `B` input is a `variables_get` to the
    number the run-once block seeds for it, so the validation checklist still reports take profit 20 and
    stop loss −50 for this template.
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
- **Every template journals the ticks it skips.** Each `before_purchase` entry gate carries an `ELSE`
  that builds `Waiting · last digit N` with `text_join` into `freebot:notice` and logs it through
  `notify` (info, silent); the observer-gated templates carry the same `ELSE` on their inner gate too, so
  a failing digit filter and a failing observer filter both show up. Every template therefore declares
  the `freebot:notice` variable, and `over1_under6_recovery` carries one `ELSE` per leg (Over 1 and the
  Under 6 recovery) so a waiting leg is always visible in the journal.
- Each card shows two plain-language lines above the numeric defaults — **Buys when** (`buyCondition`)
  and **Trades again when** (`restartCondition`), plus **Blocks used** (`blocksUsed`) — and the whole
  card is collapsed to just its name until the header toggle is pressed, so six bots fit on a phone.
- **Statistics from raw digits:** `calculateStatisticsFromDigits` in `statistics.ts` is the digits-only
  entry point; `calculateDigitStatistics` now delegates to it.
- **Crashes:** `src/components/error-boundary/` wraps `<Main>` in `app-content.jsx` and each new tab
  page in `main.tsx`, so a broken view shows a recoverable card instead of a blank app.
- **Hamburger help:** the `'help'` submenu ("App guide") renders
  `mobile-menu/app-guide-submenu.tsx`, the app's navigation map: one row per tab (Dashboard →
  Statistics) with a one-line purpose and a tap that calls `dashboard.setActiveTab` and closes the
  drawer, plus a short "Getting around" list. It replaced the old Digits-only help content — keep it a
  map of the app, and keep `DESTINATIONS` in the `DBOT_TABS` / `TAB_IDS` order.
- **Blocks guide (hamburger):** the `'blocks'` submenu ("Blocks help") renders
  `mobile-menu/blocks-help-submenu.tsx`, an accordion over the five Blocks-menu groups — Digits plus the
  four observer groups. Its content comes from `mobile-menu/blocks-help-data.ts`, which reads `GROUPS` /
  `blocksInGroup` from `observer-catalog.js`, so the block lists cannot drift from the palette; per block
  it shows only the observer `help` text that differs from the generic
  `<label>. Evaluated only on a real market event; missing data is Inconclusive.` sentence. Adding a
  group to `GROUPS` shows it here automatically, but its "what it is / how to use it" copy needs an entry
  in that file's `GROUP_TEXT`.
- **Blockly digit blocks (nine, in palette order):** `digits_over_under`, `digits_even_odd`,
  `digits_matches_differs`, `digits_high_run`, `digits_shares_below`, `digits_frequency`,
  `digits_hot_cold`, `digits_bar_neutral`, `digits_streak`, plus `switch_active_market` at the end.
  The first five are the Boolean entry gates, the next three are the frequency readings they are
  built on. They live in `src/external/bot-skeleton/scratch/blocks/Digits/` and show up under the
  Bot Builder's "Digits" category (its Blocks-menu flyout lists them with an add button). Mind the
  import depth: those files sit one level under `blocks/`, so shared helpers come from `../../utils`
  — importing `modifyContextMenu` from `../../../utils` breaks the whole dev build.
- **One helper for the boilerplate:** `Digits/digit-block.js` exports `digitBlock({message, args,
  output, tooltip, displayName, description, keyWords})`, `digitGenerator(buildCall)` and
  `sampleCode(block, socket, fallback)`. Each block file keeps its own literal
  `window.Blockly.Blocks.<type> =` / `...forBlock.<type> =` assignment — the observer generator
  coverage test scans for those literals, so a helper that hides the assignment would blind it.
  Registering a new digit block therefore means: the file, its `import` in `Digits/index.js`, its
  palette `<Block>` in `toolbox-items.tsx`, and (if the AI architect may place it) an entry in
  `ai-architect/registry.ts`.
- **Removed from the palette** (kept in the engine, no block): `digits_frequency_count`, `digits_gap`,
  `digits_longest_run`, `digits_parity_share`, `digits_transition_count`, `digits_repeat_share`. Their
  rules still live as pure functions in `services/tradeEngine/utils/digit-analysis.js` (tested by
  `utils/__tests__/digit-analysis.test.js`) and their `Bot.*` reads still sit in `Ticks.js` /
  `TicksInterface.js`; only the blocks and their registry entries are gone, so a saved workspace that
  still contains one is reported as an unknown block instead of running.
- The remaining blocks call `Bot.isLastDigitOver/Under/Matches/Differs/Parity`,
  `Bot.getDigitFrequency(digit, sample)`, `Bot.getHotColdDigit(mode, sample)`,
  `Bot.getDigitStreak()`, `Bot.areLastDigitsHigh(digit, count, mode)`,
  `Bot.areDigitSharesBelow([first, second], percent, sample)` and
  `Bot.isDigitBarNeutral(digit, sample)`. Those helpers live in
  `services/tradeEngine/trade/Ticks.js` and are exposed through
  `services/tradeEngine/Interface/TicksInterface.js` — both files must be updated together, or the
  generated code calls an undefined function.
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
  legacy `digits` category it maps `GROUPS` to four `<Category>` elements — **each group holds one
  nested `<Category>` per catalogue category** (`subcategoriesInGroup(group)`), so a group of
  forty-odd blocks is browsed a handful at a time instead of one long flyout. Nested category ids
  are `<group id>__<slug of the category>`, which keeps them from colliding with the legacy
  categories (`digits`, `variables`, `notifications`, …); the toolbox store already handled nested
  categories for `analysis`/`utility`, so its expand rows and its search both pick these up. The
  legacy trading categories are untouched.
- **Superseded blocks: registered but not listed.** The catalogue marks a duplicate with
  `hidden: true` from the `SUPERSEDED` list at the bottom of `observer-catalog.js` (one line per
  block, naming the block that replaces it), and `blocksInGroup(group)` skips it — the palette and
  the Blocks help both read that helper, so they cannot disagree. A hidden block keeps its
  `window.Blockly.Blocks` registration, its generator and its op, so a saved workspace that still
  carries one validates and runs exactly as it did; that is the same convention the renamed ops
  follow (`observer-validation.test.js`, "older saved configurations"). Never remove a block from
  `BLOCKS` to prune the palette — hide it, or `observer-validate.js` starts refusing the run for
  every workspace that used it.
- **Consolidated families:** one parameterised block replaced each family of one-choice copies —
  `obs_pattern_stage_is` (was five "Is Waiting For …" blocks), `obs_detect_run` (was
  `obs_identical` + `obs_even_run` + `obs_odd_run`), `obs_check_parity_frequency` (was the two
  parities' blocks) and `obs_research_candidate` (was the six "Compare … Pattern" blocks). The
  older types stay defined and hidden.
- **Advanced window reads** (`observer-values.js` holds the maths, `observer-evaluators.js` the
  ops): `obs_digit_gap` (`adv_gap`), `obs_frequency_rank` (`adv_frequency_rank`, ranks only digits
  the window really holds, ties to the lower digit), `obs_entropy` / `obs_entropy_state`
  (`adv_entropy`, `adv_entropy_state`; `STRUCTURAL_CLUSTER_BITS = 2.95` is the same boundary the
  Digits page's entropy engine uses), `obs_parity_run` (`adv_parity_run`), `obs_parity_switches`
  (`adv_parity_switches`) and `obs_repeat_rate` (`adv_repeat_rate`). A size field of `0` means "the
  whole observed window". All of them answer Inconclusive rather than a fabricated zero.
- Coverage for the pruning, the consolidations and the advanced reads lives in
  `services/observer/__tests__/observer-advanced-blocks.test.js`, which also pins that every
  observer block the free-bot XML uses stays in the palette.

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

## Even/Odd strategy blocks
- The twelve `eo_*` blocks are registered in `Digits/index.js` and the existing Digits toolbox category. Usage and targeted checks: `docs/even-odd-blocks.md`.
- Engine entry regression coverage is in `utils/__tests__/even-odd-runtime.test.js`: the pure-rule tests alone cannot catch missing imports in `trade/EvenOdd.js`. Run with `--runInBand --coverage=false` to avoid rewriting tracked coverage output.
- Browser generation can be checked in an isolated `Blockly.Workspace` without replacing the user's canvas or placing a trade. Live Demo purchases/settlements remain unverified.

### Contract families: one bot, Over/Under + Even/Odd
`services/tradeEngine/utils/contract-families.js` is the single rule book for the digit contract
families (`over_under`, `even_odd`, `matches_differs`), and `trade/ContractFamily.js` is the mixin
that applies it (wrapped just inside `EvenOdd` in `trade/index.js`).
- **A buy carries its own family.** `purchase(contract_type, { barrier })` resolves the trade options
  through the mixin: Over/Under and Matches/Differs get the barrier (the explicit one, else the
  definition's prediction, validated as a whole digit 0–9), while an Even/Odd buy has `prediction`
  stripped. `tradeOptionToBuy` / `tradeOptionToProposal` skip `barrier`/`selected_tick` for a family
  that reads none — without that, an Even/Odd buy from an Over/Under definition sent
  `barrier: 1` and Deriv rejected it. Non-digit types (`CALL`, `TICKLOW`, …) keep their old
  behaviour.
- **The definition still gates it.** `canTradeContract` allows a requested contract when the
  definition's `TYPE_LIST` is `both` (or names that contract) and the trade type is a digit trade type
  (`overunder` / `evenodd` / `matchesdiffers`). A definition pinned to one contract still refuses
  every other contract, with the reason in the journal.
- **Proposals follow the family.** With a payout block on the canvas the engine quotes contracts
  before buying; `Proposal.ensureContractProposals` requests the missing contract's own proposal and
  the purchase waits for it, so `selectProposal` never throws `SelectedProposalNotExist` when a leg
  switches family.
- **`Bot.purchase(contract, { barrier })`** is the block-facing form (`Interface/BotInterface.js`
  forwards the second argument). `digits_parity_recovery` uses it for BOTH of its legs — the Over 1 /
  Under 8 leg carries the barrier, the Even/Odd leg carries none — so the stake, risk limits, session
  ledger and martingale stay on one path.
- **The recovery leg is a synchronous parity REVERSAL.** The generated block is
  `if (!Bot.sessionHasOpenContract()) { if (Bot.sessionLastResult() === 'loss') { …eoParityReversal… }
  else if (last digit passes the barrier && Bot.riskCanTrade()) { Bot.purchase(primary) } }`.
  Two things there are load-bearing:
  - **The comparison is `'loss'`.** `sessionLastResult()` returns `'win'` / `'loss'` / `''`
    (`utils/session-control.js` `lastTradeResult`). The block compared against `'lost'` for a while,
    so the recovery branch never ran at all — the Even/Odd leg was dead code.
  - **The reversal is read, not scanned.** `Bot.eoParityReversal(run, direction)` (sync,
    `trade/EvenOdd.js`) reads `this.eo_digits`, the newest digits of the market being traded, fed from
    the engine's own tick callback (`recordReversalDigit`); the rule is `resolveReversalSignal`
    (`utils/even-odd.js`) — the last N digits all **even → buy ODD**, all **odd → buy EVEN**, a mixed
    run is no entry, and `direction` limits which side may be bought. Do **not** reintroduce
    `marketScanBestParity` / `eoRecoveryPrepare` into this path: the scan re-subscribed every market,
    each switch invalidated the Even/Odd window (`Ticks.js` `eoInvalidate`), and a parity read from a
    market other than the one being traded is meaningless anyway. `config.rule` (`threshold` |
    `reversal`) still drives the Even/Odd STRATEGY blocks (`evenOddSnapshot`), which are unchanged.
  - **The XML gate must let a loss through.** The shipped template's observer gate is
    `… AND (Parity Switched OR last trade result = "loss")`. A gate that only accepts `Parity
    Switched` requires the newest two digits to have DIFFERENT parity — exactly what the reversal
    reads as "no entry" — so the recovery could never fire. `templates.test.ts` ("lets a settled loss
    reach its Even/Odd leg") pins the OR.
  - **That OR must NOT be an operand of an `obs_…` condition.** The observer runtime evaluates a
    condition only from blocks its own catalogue knows (`observer-program.js` `readProgram` keeps
    just those); any ordinary block reached through a `value` socket answers
    `Inconclusive: the connected block is no longer on the canvas`, `observer-evaluators.js` `and`
    turns that into Inconclusive, and `Bot.observerCondition` reports Inconclusive as `false`. The gate
    therefore never passed and the `digits_parity_recovery` block inside it never ran — the whole bot
    traded nothing, which is why the recovery looked dead even after the `'loss'` comparison was
    fixed. The observer conditions are now ONE `obs_and` tree, and the settled-loss OR is combined
    with it by an ordinary `logic_operation` AND (`freebot-pr-observer-gate-and`) that the generated
    program evaluates itself. `templates.test.ts` ("never nests an ordinary block inside an observer
    condition") walks every template and fails if any `obs_…` block has a non-`obs_…` value operand —
    keep that rule when editing a gate.
- **The mandatory-block gate has to accept it.** `PURCHASE_BLOCK_TYPES` in `scratch/utils/index.js`
  is the list of block types that buy through the engine's own purchase path, and `getMissingBlocks`
  treats `purchase` as satisfied when the canvas holds any of them. The two-market
  "Trade Over 1 / Under 8, recover on Even/Odd" block buys **both** of its legs itself, so such a
  canvas carries no `purchase` block at all and was refused with "The Purchase block is mandatory and
  cannot be deleted/disabled" (`isAllRequiredBlocksEnabled` → `getMissingBlocks`) the moment Run was
  pressed. Keep that list complete when a buying block is added to the palette —
  `scratch/utils/__tests__/required-blocks.test.js` pins one case per buy path.
- Coverage: `utils/__tests__/contract-families.test.js` (rules), `contract-family-engine.test.js`
  (mixin + request builders), `utils/__tests__/even-odd.test.js` ("the parity-reversal rule") and
  `scratch/blocks/Digits/__tests__/digits-parity-recovery.test.js` (the generated call carries the
  barrier and the reversal buy, and compares the settled result against `'loss'`), plus
  `utils/__tests__/even-odd-runtime.test.js` ("Even/Odd recovery leg after a loss": the reversal read
  per digit run, a mixed run and a market change). A live two-leg purchase needs a logged-in Demo
  account, so the settlement path stays manual.

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
  `docker compose exec web npx jest src/pages/ai-architect` (116 tests); `npx tsc --noEmit` is clean.

### Every condition the prompt states (planner + builder)
The deterministic planner reads all of a request, not just the first match of each concept:
- `filters.frequencies` is a **list** of digit-frequency filters ("digits 8 and 9 should have at least
  10.3%"), one block per digit, all ANDed. The old single `filters.frequency` is still read —
  `normalizeSpec` in `spec-model.ts` upgrades a saved spec in `assemble`, so a bot saved before the
  change still opens. Keep that upgrade when adding fields.
- `filters.barNeutral` holds the digits that must carry neither the green nor the red bar, built with
  `digits_bar_neutral` (registry entry added with the block; it reads the same grid the Digits page
  draws). The parser binds the digit list nearest *before* the bar rule ("digits 5 and 6 should not
  have the green or red bar").
- `entry.digits` holds the digits the user listed for the entry ("entry is 5 and 6", "entry digits
  7, 8 or 9", "any 2 digits above or equal 7"). The builder then makes the entry an OR of
  `last_digit == d` compares instead of the barrier comparison; the contract barrier is unchanged.
- `PlanResult.requirements` is one entry per clause (split on `, ; . and or then also but`, never
  inside a decimal), each `applied` / `unsupported` / `unapplied`. The page renders it as
  **Everything you asked for**, so a clause the planner could not build is visible instead of being
  silently dropped — do not add a concept reader without a matching entry in `CLAUSE_CONCEPTS`, or
  its clauses will show as unapplied.
- `spec-model.ts` must not be named `spec.ts`: the jest config treats `*.spec.ts` as a test file.

### Blocks menu alignment (the Architect picks from the menu the user sees)
`block-menu.ts` reads the Bot Builder's Blocks menu as data. `ToolboxItems()` renders the palette to
static markup — the same value the toolbox mounts — and `parseBlocksMenu` turns it into one entry per
block: the name the menu shows (the registry display name, or the observer catalogue label), the menu
category it is listed under and, for the four observer groups, the group it is browsed in (`group` is
only set for the categories whose id starts with `observer_`, so a nested legacy category is not
mistaken for a group). `readPalette()` falls back to the registry's own catalogue view of the palette
only when that markup cannot be parsed — jest maps `react-dom/server` to a stub, so the tests exercise
`parseBlocksMenu` against palette-shaped markup and the index against the names/categories/groups.
- The planner asks the menu which blocks a prompt names (`menuBlockNamedIn` per clause). A clause that
  names a menu block is answered with **that** block instead of a concept of the planner's own, and
  naming `switch_active_market` / `market_discover_eligible` (`SCAN_BLOCKS`) is what makes the request
  a multi-market scan even when the prompt never says "scan all markets".
- The alignment is decided in the pipeline against the workspace that was really built, never claimed
  by the planner: `alignWithBlocksMenu` marks the requirement `applied` (detail carries the menu label
  and category) when the generated bot holds that block, and `unsupported` — "the generated bot does
  not place it" — when it does not, plus one `Blocks menu:` reasoning line per named block. The
  Requirements panel shows both as they are, so "Cool down market" or "Wait for settlement" is
  reported instead of silently ignored.
- `EXAMPLE_PROMPTS` ends with a prompt that names menu blocks, so the behaviour is reachable from the
  tab without knowing the menu by heart.
- Verify: `docker compose exec web npx jest src/pages/ai-architect` and, on the tab, generate
  "Find eligible markets, then trade Over 1 when the last digit is over 1" — the request row reads
  "Blocks menu · Find eligible markets (Market Intelligence) — the generated bot uses this block."

### "Add this bot to another" (combine)
`combine.ts` `combineSpecs(target, addition)` puts the added bot in `spec.secondLeg`. The engine
reads the trade options (amount **and** barrier) at the top of every loop, so a bot cannot pick its
contract from the tick it trades: the two rules alternate like the shipped two-leg recovery template.
The target trades while it is winning, the added bot takes over after a loss, and `after_purchase`
writes `architect:leg` + `architect:prediction` before `trade_again` so the next loop's
`Bot.start` carries the right barrier (which is why the two-leg form uses a `variables_get` in
`PREDICTION` and `contracttype = both`). The combination is refused, with the reason, when the two
bots are not both Demo trading, do not share the market selection, or need different Trade types
(different contract families) — never silently drop half a bot.
- `validator.ts` therefore allows one Purchase **per leg**, requires **every** `if` that directly
  holds a Purchase to check `risk_can_trade`, and lets the market-consistency check match an OR scan
  condition operand by operand.
- The UI entry point is the "Add this bot to…" `<select>` on each saved-bot card
  (`library-panel.tsx`); the page saves the combination as its own library entry, so neither
  original bot changes.
- **"Add a bot to this one" (`components/add-bot-panel.tsx`)** is the same combine, started from the
  bot on screen: `use-architect.ts`'s `addBot({ savedId | prompt })` plans a described addition (or
  reads a saved bot), runs `combineSpecs(currentSpec, addition)`, assembles and puts the combined
  bot on screen. It is only rendered once a bot exists, and a combination is refused with the
  reason when `combineSpecs` refuses it. Nothing is loaded or run by this action.

### Two rules from one prompt
A prompt that names two contracts of the same Trade type ("Over 1 ... recovery with Under 6") is
planned as ONE two-rule bot instead of asking which contract to drop: `contractMentions` returns
every contract with its offset, `distinctMentions` keeps the first mention of each, and the prompt is
split at the second contract's offset so each rule keeps the entry digits, frequency filters and bar
rules written beside it (the second rule's window is its own when it states one). The two rules may
belong to **different contract families** — the two-market engine buys each leg's own family in one
session (`services/tradeEngine/utils/contract-families.js`; the builder sets
`trade_definition_contracttype` to `both` and carries the barrier in a variable), so "Over 1, recover
with Even after a loss" builds ONE bot instead of asking `contract_conflict`. Only three or more named
contracts still ask. A second rule is only attached to a Demo-trading bot — an observation- or
signal-only request reports it under "Not built". `combine.ts` follows the same rule: a different
family is no longer refused, only a different market selection. Keep `maskNonContractPhrases` **length-preserving**
(blank/padding replacements): the offsets it produces are what splits the prompt, and
`readFrequencies` never lets a digit sit between a digit list and its own operator, so a filter
written after an entry list binds to the list nearest the operator.

### Custom indicators, analysis tools and session realism
Three spec sections the planner fills and the builder turns into real blocks. All of them are inert
by default (`analyze`/`realism` are zeroed by `normalizeSpec`), so a bot saved before this exists
builds exactly the workspace it did.
- **`spec.indicators` / `StrategyLeg.indicators`** — `IndicatorPlan[]`, ANDed into the leg's entry by
  `indicatorConditions` inside `filterConditions`, so the SAME rule gates the market scan and the
  buy. Two kinds, each a real block: `high_run` → `digits_high_run` ("last 3 digits above 6", also
  "three ticks in a row at or above 7") and `hot_cold` → `digits_hot_cold` compared to the digit
  ("hottest digit is 5"). `maskNonContractPhrases` blanks the WHOLE indicator phrase before contract
  parsing — masking only "last 3 digits" left "above 6" and the planner read it as a second Over 6
  contract.
- **`spec.analysis`** — `rankMarkets` places `market_rank` after `market_discover_eligible`;
  `bestParityMarket` replaces discovery+scan with `switch_best_parity_market` (and makes the request
  multi-market); `strategyReport` places `learn_set_strategy` before each leg's Purchase (so the
  engine measures each named rule) and `learn_report` (a String value) into a `report_journal` when
  the stop flag is set. `learn_report` must stay a **value** entry in the registry or the socket
  check refuses it.
- **`spec.realism`** — pacing that keeps the bot off a fixed per-tick cadence: `entryDelaySeconds` +
  `entryJitterSeconds` wrap the Purchase in a `timeout` (`sleep(base + Math.random() * jitter)`);
  `lossCooldownSeconds` wraps `trade_again` in the loss branch only; `stakeJitterPercent` writes
  `architect:live:stake` from `round(stake * (1 ± share))` before each buy and the trade options read
  that variable instead of `architect:stake`. The `:stake` suffix on the name is deliberate — the
  validator's "stake is seeded at start" check reads it. Phrases: "realistic", "less likely to be
  flagged", "random/jitter", "wait N seconds", "cool down N seconds after a loss", "vary the stake by
  N%"; `refineSpec` accepts the same ones.
- `validator.ts` finds a Purchase in an `if` branch **directly or one `timeout` level inside**
  (`holdsAction`) — searching the whole subtree made the outer stop-flag guard look like a
  confirmation and failed the risk-guard check. A `switch_best_parity_market` gets its own
  `parity-scan` check (one scan, a 1–1000 tick window, no competing market selector).
- The result UI shows all of it in `components/strategy-plan-panel.tsx` ("Strategies, indicators &
  analysis"): each rule's family, entry digits, filters and indicators, then the analysis tools and
  the pacing.
- Verify: `docker compose exec web npx jest src/pages/ai-architect` (133 tests) and
  `npx tsc --noEmit`. In the preview browser a scratch `Blockly.Workspace` loading
  `timeout → purchase` generates `sleep((2 + Math.random())); Bot.purchase('DIGITEVEN');` and
  `report_journal(learn_report)` generates `Bot.sessionJournal(Bot.learnReport(), "info")`.

### Researched entries (every Free Bots template)
Every bot in the Free Bots tab — the seven XML templates and the nine multi-market presets — carries an
entry rule taken from the published Deriv digit setups, not a bare "trade on this digit" trigger:
- **Over/Under** (Over 1 and Under 8 plus the presets): the digits the contract *loses to* have to stay
  cold — below the fair 10.3% share of the last 100 ticks. **Under 8 (bot 1)** takes the entry digits
  4, 7 and 9 and needs digits 8 and 9 to carry neither the green (hottest) nor the red (coldest) bar;
  **Over 1 (bot 2)** takes 2, 5 and 6, needs digits 0 and 1 below 10.3%, and requires one of digits 0/1 to
  carry the green or the red bar (`digits_bar_neutral` read through `logic_negate`). Both gates are an OR of
  `logic_compare` `OP=EQ` on `last_digit`, which is what `entryDigits` / `entryOperator: 'EQ'` describe.
- **Even/Odd**: the shipped Even/Odd bot uses the **reversal** rule — the last 2 digits both even → buy
  ODD, both odd → buy EVEN, a mixed pair is no entry (`eo_configure` `RULE=reversal`, `RUN=2`). The
  presets still use the published hot-parity rule (three of the parity's own digits above 10.3%:
  `even` → 0/2/4, `odd` → 1/3/5).
- **Matches/Differs**: Matches buys its target while it is hot (≥ 10.3%), Differs buys the same target while
  it is cold (< 10.3%) — the 90%/10% split of the two contracts in one observation.
- **Two-leg / parity-recovery bots** keep their own gates (cold losing digits, `digits_high_run`, parity
  switch), which already follow the same "barrier/frequency/parity" pattern.

Where it lives: `MultiMarketConfig.maxFrequencyDigits` adds the "stays below 10.3%" compares to the
generated switch + purchase condition (alongside `minFrequencyDigits` for the hot rules);
`entryConditionText` writes the same rule into the card copy, so a card never shows a rule the XML does not
carry. The four static Over/Under XML assets — the two `*_entry_every_time` ones plus
`over1_two_low_digits` and `under8_two_high_digits` — add one `logic_compare` (`OP=LT`, 10.3, sample 100)
around a `digits_frequency` block per losing digit, ANDed with the existing bar/parity/freshness guards
(the derived two keep their `freebot-o1two` / `freebot-u8two` block-id prefixes so every id stays unique
inside one asset). Tests: `templates.test.ts` ("every Over/Under template keeps the losing digits cold",
"the two entry-every-time bots gate exactly as their cards say", "the Even/Odd bot reverses the last two
digits") and `multi-market-xml.test.ts` ("gives every preset an entry rule, not just a contract").

## Multi-Market Digit Entry Hunter (Free Bots, section 3)
`src/pages/free-bots/multi-market.ts` generates the workspace from a `MultiMarketConfig`;
`MULTI_MARKET_PRESETS` holds the nine shipped variants, and every one carries an entry rule:
- **Over 1** — entry digits 5/6 · bar-neutral 5/6 · digits 0/1 below 10.3%
- **Over 2** — entry digits 0/2 · bar-neutral 0/1/2 · digits 0/1/2 below 10.3%
- **Under 8** — entry digits 7/4/8 · bar-neutral 7/4/8 · digits 8/9 below 10.3%
- **Under 7** — `digits_high_run` at_or_above 7 ×2 · bar-neutral 7/8/9 · frequency 7/8/9
- **Over 7** — `digits_high_run` at_or_below 2 ×2 · bar-neutral 0/1/2 · frequency 0/1/2
- **Even / Odd** — parity · three of the parity's digits at or above 10.3% (0/2/4 · 1/3/5)
- **Matches** — target digit 5 at or above 10.3% · **Differs** — target digit 4 below 10.3%

The whole rule (trigger AND every frequency/bar filter) is written into BOTH the `switch_active_market`
CONDITION and the `if` that holds the `purchase`, so the scan only stops on a market whose own ticks pass
it and the buy re-checks it on the frozen market. `MarketScan.marketScanBegin` puts `this.symbol` first in
`scan.eligible`, so the market the bot is already on is analysed before any switch; `marketScanNext`
marks it analysed and moves on to the next market (`market-scan-engine.test.js` pins this order).
`inspectFreeBotXml` recognises the two generated entry shapes through the template's `entryDigits` /
`entryRun` fields (set by `multiMarketTemplate`; `entryOperator`/`triggerDigit` are then `null`): a gate of
`last digit = d` compares (digits deduped — the rule appears in both the scan and the purchase copy) and a
`digits_high_run` gate. Its purchase lookup walks up to the closest `controls_if` that really holds a
`purchase`, so a gate nested under AND/OR filters still validates. A template that adds one of these shapes
without the matching field fails the loader with "Entry condition mismatch". The preset count (9) and the
per-preset rules are pinned by `multi-market-xml.test.ts`.
