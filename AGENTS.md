# Base44 Development Setup

## Overview

This is the Deriv Bot Builder (dboteasy) — a React + TypeScript app using rsbuild (Rspack-based), MobX, and SCSS. It includes a Deriv Digits Analysis Lab at `/digits-lab`.

## Running the app

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

The dev server runs on host port 3000 (mapped to container port 4003).

## Key details

- **Package manager**: npm (no lockfile; `npm install` on container startup)
- **Dev server**: rsbuild dev on port 4003, bound to 0.0.0.0
- **Env vars**: `.env.production` is loaded by rsbuild's `loadEnv({ mode: 'production' })` for both dev and build. A `.env` file also exists for local dev.
- **Deriv App ID**: `NEXT_PUBLIC_DERIV_APP_ID=34nLjEhE1953XqMLVUwLf`
- **Digits Lab route**: `/digits-lab` — standalone public-data analysis tool, no auth required

## Digits Analysis Lab

Located in `src/digits-lab/`. Connects to Deriv's public WebSocket for market data:
- Active symbol discovery
- Historical tick retrieval (1000 ticks)
- Live tick subscriptions
- Digit statistics, frequency, distribution charts
- Strategy learning: Over 1/2, Under 7/8, Even/Odd
- Barrier observation
- Env code viewer (PIN-gated)

## Testing

```bash
npm test          # Jest tests
npm run type-check # TypeScript type checking
```
