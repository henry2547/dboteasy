# Base44 Setup Notes

## Project Type
Frontend-only Rsbuild + React Router SPA (Deriv Trading Bot / "dboteasy"). No backend, no database.
MobX stores, `@deriv-com/quill-ui` components, SCSS with CSS custom properties per theme.

## Running in the Sandbox
- `docker compose -f docker-compose.base44.yml up -d` starts the dev server.
- Node 22 base image; source is bind-mounted at `/app`; `node_modules` lives in an anonymous volume.
- Dev server listens on port 4003 inside the container, mapped to host port 3000.
- `npm install` runs on container startup before `npm run dev`. There is no lockfile in the repo.

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
  breakpoint `.digits-card` / `.digits-badge` tighten their type and padding to keep five columns
  inside a narrow viewport.

## Verification
- `curl http://localhost:3000/` returns 200 with the app HTML; JS bundles are served live at `/static/js/index.js`.
- The Digits tab: open `#digits`, confirm markets load, ~1000 stored ticks, the digit grid, the
  distribution chart, the digit circle, barrier cards, six strategy cards and six backtest rows.
