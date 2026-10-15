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
- **Blockly digit blocks:** implemented — `digits_over_under`, `digits_even_odd`,
  `digits_matches_differs` and `digits_frequency` live in
  `src/external/bot-skeleton/scratch/blocks/Digits/` and show up under the Bot Builder's "Digits"
  category (its Blocks-menu flyout lists them with an add button). Mind the import depth: those files
  sit one level under `blocks/`, so shared helpers come from `../../utils` — importing
  `modifyContextMenu` from `../../../utils` breaks the whole dev build.

### Verifying these tabs
- The tab targets are the `<li>` elements `#id-digits`, `#id-bots`, `#id-statistics` — click these to
  switch; the URL hash only selects a tab on first load, not after mount.
- Digits: check the market-conditions panel, the chart cursor + ticker trail, the digit-circle marker
  and the floating "Scan markets" button.
- The scanner returns ~8 volatility markets; picking one switches the whole tab to that market.
- Known pre-existing console warning: `Failed to load image` (branding logo) — unrelated to this work.

## Isolated observational bot workspace
- The Bots tab embeds `/bot-lab.html`, a second Rsbuild entry, not a React Router path. Keep it in a separate document: the legacy trading builder patches Blockly globals/prototypes and must not share the observer's stock Blockly instance. The static preview prefix is `/bot/preview/bot-lab.html`.
- `src/pages/bots/pattern-program.ts` compiles connected declarations; `pattern-engine.ts` is the single chronological state machine used by live monitoring, replay, and comparison. No generated JavaScript, account API, or trade messages are used by this lab.
- A pattern row begins at the qualifying adjacent run. Only a later confirmation creates the setup; only the next genuine tick creates the outcome. Timeout 0 means unlimited. Stop/pause/gaps invalidate incomplete patterns; restored journals retain completion watermarks to prevent re-evaluation.
- History seeds statistics, not live detector adjacency. Reconnect, stale data, malformed data, precision changes, and missing tick epochs require history synchronisation. The supported cadences are 1 second for the 1-second group and 2 seconds for classic Volatility; transitions do not bridge missing epochs.
- Pattern stage is distinct from session state. `Setup detected` is exposed before `Evaluation pending`; the live session's existing timer advances the label without manufacturing a tick. Replay advances only when a genuine historical tick is stepped.
- Configurations, bounded journals, and traces are browser-local under `dboteasy.observational-bots.v1`. JSON import is local parsing, not a server upload. CSV includes pair/confirmation/outcome timestamps, config version, lifecycle, and interruptions.
- Verify with `docker compose -f docker-compose.base44.yml exec -T web npm test -- --runInBand src/pages/bots --coverage=false` and `npm run type-check` inside the web container. Deterministic fixture ticks exist only in tests; live/replay UI always uses the public provider.
- Production build verification can use a temporary Rsbuild config in `/tmp` overriding only `output.distPath.root`, avoiding churn of tracked `dist/` assets. Both `index.html` and `bot-lab.html` must be produced.
