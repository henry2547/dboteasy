# Base44 Setup Notes

## Project Type
Frontend-only Rsbuild + React Router SPA (Deriv Trading Bot). No backend, no database.

## Running in the Sandbox
- `docker compose -f docker-compose.base44.yml up -d` starts the dev server.
- Node 22 base image; source is bind-mounted at `/app`; `node_modules` lives in an anonymous volume.
- Dev server listens on port 4003 inside the container, mapped to host port 3000.
- `npm install` runs on container startup before `npm run dev`.

## Environment Variables
- `.env.production` (committed) is loaded by `loadEnv({ mode: 'production' })` in `rsbuild.config.ts` and injected via `source.define` at compile time. No `.env` file is needed for dev.
- `NEXT_PUBLIC_DERIV_APP_ID` is already set in `.env.production` — required for OAuth/WebSocket; without it login stays disabled.
- Google Drive credentials (`GD_CLIENT_ID`, `GD_APP_ID`, `GD_API_KEY`) are optional; left blank they disable the feature.

## No External Secrets Required
The app boots with the committed `.env.production` values. No external service credentials are needed for local development.

## Build Artifacts
- `scripts/generate-brand-css.js` runs automatically on `npm install`, `npm run dev`, and `npm run build` (via `prebuild`), baking `brand.config.json` values into `_themes.scss`.
- SmartCharts engine assets are copied into `dist/js/smartcharts/` during build (not relevant for dev server).

## Verification
- `curl http://localhost:3000/` returns 200 with the app HTML.
- JS bundles served at `/static/js/index.js` (live webpack modules, not prebuilt).
