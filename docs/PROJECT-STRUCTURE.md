# Project structure

The app is a shell plus a set of self-contained feature modules. Each module ("small project")
owns its page, its components, its logic, its styles and its tests, so a change starts from the
product area it belongs to instead of from a 1500-file pile.

```
src/
├── app/            app shell: boot, routing, tab host, providers
│   ├── App.tsx          top-level Suspense/layout wrapper
│   ├── app-content.jsx  mounts <Main> (the tab host) and the header/footer layout
│   ├── main/            the tab strip, tab switching, global modals, session-limit alert
│   └── ...
├── features/       one folder per product feature — see the table below
├── components/     shared UI kit used by several features
│   ├── layout/          header, footer, mobile menu, hamburger submenus
│   ├── run-panel/       the trade window (Summary / Transactions / Journal)
│   ├── shared/          hooks, services, styles and helpers shared app-wide
│   └── shared_ui/       generic inputs, dialogs, tabs, autocomplete, …
├── external/       vendored engines (bot-skeleton, deriv-core, indicators)
├── stores/         21 MobX stores (one per concern, registered in root-store.ts)
├── hooks/          app-wide React hooks (useApiBase, useStore, useThemeSwitcher, …)
├── services/       REST services against the Options API (accounts, bots, symbols)
├── utils/          app-wide helpers (branding, session limits, journal, URL handling)
├── constants/      tab ids, contract/contract-stage constants, quick-strategy copy
├── types/          shared TypeScript types (API message shapes)
├── xml/            Free Bots Blockly assets loaded as raw strings
├── adapters/       third-party chart adapter
├── styles/         global styles
└── translations/   i18n bootstrap
```

## Feature modules

Every module under `src/features/` has an `index.ts` that is what the rest of the app imports.
`src/app/main/main.tsx` lazy-loads each page through that entry point.

| Module | What it owns |
| --- | --- |
| `ai-architect` | AI Builder tab: prompt → spec → workspace (planner, registry, builder, validator, palette reader) |
| `ai-bot` | AI Bot engine (scanner, execution, risk, ledger). Tab is removed from the UI; code is kept and unit-tested |
| `ai-bots` | AI Bots tab: Even-Odd and Rise-Fall scanners over the public market scan |
| `bot-builder` | Blockly workspace, toolbar, Blocks palette (`toolbox/`), quick strategy |
| `chart` | Deriv Chart tab and the SmartChart adapter wiring |
| `dashboard` | Dashboard tab, bot list, announcements |
| `digits` | Digits lab: public feed, statistics, strategies, scanner, and the `engines/` analytics modules |
| `dtrader` | Kept DTrader tab component (unused, no route) |
| `free-bots` | Free Bots library: templates, XML inspection/re-targeting, loader, scanner match |
| `statistics` | Statistics tab over the shared Digits feed |
| `strategy-engine` | Strategy Engine tab: pure core + reactive hook + dashboard |
| `tutorials` | Guided tours, FAQ and guide content |

## Where things live inside a feature

Modules are not all shaped the same (the vendored ones keep the upstream layout), but a module
follows this convention when files are added:

- `index.ts` — the public entry point; everything outside the module imports from here.
- `*-page.tsx` — the route component rendered by the tab host.
- `components/` — UI used only by this feature.
- `*.ts` logic files (or `engines/`, `domain/`) — pure functions and engines, no React. They are
  what the unit tests in `__tests__/` call directly.
- `use-*.ts` — the React orchestration layer over that logic (feed, throttling, state).
- `*.scss` — styles scoped to the feature's own root class.

The largest modules are already split along those lines and add their own subfolders rather than
growing a single file:

- `bot-builder/toolbox/palette/` — the Blocks menu is one module per section (`trade-categories`,
  `trading-categories`, `observer-groups`, `analysis-category`, `utility-category`, `examples`);
  `toolbox-items.tsx` only composes them.
- `digits/engines/` — the five analytics engines plus `sanity.ts`, React-free so they are tested
  without a feed.
- `free-bots/` — `templates.ts` (the library data), `bot-xml.ts` (read/check/re-target an asset),
  `use-free-bot-loader.ts` (load it), `scanner-match.ts` (which bot a scanned market qualifies for).

## Rules of thumb

1. **A feature does not reach into another feature's internals.** Import the other module's
   `index.ts`; if two features need the same code, move it to `components/shared/`, `utils/` or
   `hooks/` — not across module folders.
2. **Pure logic stays free of React and the network.** It takes digits/ticks and returns values, so
   it can be unit-tested without mounting anything. The hook that owns the socket passes data in.
3. **Tests sit next to the code** in `__tests__/`. Run one module's tests with
   `docker compose -f docker-compose.base44.yml exec web npx jest src/features/<module> --coverage=false`.
4. **`src/external/` is vendored engine code** (Deriv's bot-skeleton, deriv-core, indicators). It is
   edited only for an engine-level fix, with its own tests under `src/external/.../__tests__/`.
5. **One tab, one module.** Adding a tab means: a folder under `src/features/` with an `index.ts`
   default export, an id in `constants/bot-contents.ts` (`DBOT_TABS` + `TAB_IDS`), the `hash`
   array entry in `app/main/main.tsx`, and the icon/label where the tab strip renders it.
