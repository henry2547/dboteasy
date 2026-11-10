# Phase 0 — Reality Gate (Deriv Rise/Fall engine)

Status: **blocking gate, reported before feature work.** Compiled 2026-11-10 for the Rise/Fall
expansion of the Blockly Bot Builder.

Legend: **VERIFIED** = checked against Deriv's current documentation or observed live in this
repository/session. **IMPLEMENTED** = the name is used by existing, working code in this repo but was
not re-checked against the docs page in this session. **UNVERIFIED** = not established; do not build
on it without checking.

## Findings

| # | Item | Finding | Status |
|---|------|---------|--------|
| 0.1 | Public market-data WebSocket | `wss://api.derivws.com/trading/v1/options/ws/public` (`src/external/deriv-core/config/urls.ts`, `src/features/digits/deriv-public-ws.ts`). Speaks the classic v3 message shape (`msg_type` / `req_id` / `echo_req`). Staging: `wss://staging-api.derivws.com/trading/v1/options/ws/public`. | VERIFIED (in use by the Digits lab today) |
| 0.1b | Authenticated trading channel | An OAuth access token is exchanged for a **per-account OTP WebSocket URL** via REST `GET {apiBase}/options/accounts/{accountId}/otp`; the socket is already authenticated on open (no `authorize` message). Documented and implemented in `src/features/ai-bot/auth-ws.ts`. | IMPLEMENTED, not re-verified this session (no credentials) |
| 0.2 | `app_id` | `NEXT_PUBLIC_DERIV_APP_ID` in `.env.production`, injected at build time; used for OAuth and the `Deriv-App-ID` REST header. It is a **public client id**, not a credential. | VERIFIED (repo convention, `AGENTS.md`) |
| 0.3 | Authentication flow | OAuth2 authorization-code login → access token in localStorage → per-account OTP URL. Flow name: Deriv OAuth2. Token lifetimes and granted scopes (`trade`) | UNVERIFIED this session |
| 0.4 | `ticks_history` / `ticks` | Request `{ticks_history, end:'latest', count:1000, style:'ticks', subscribe:1}`. **`subscribe: 1` is required** — `subscribe: 0` is rejected (`InputValidationFailed`), and one request returns `history` *and* streams the live `tick` messages on the same subscription. History carries `history.prices[]` + `history.times[]`; live ticks carry `tick.{symbol, epoch, quote, id, pip_size}` where `pip_size` is a **decimal-place count** on tick messages. | VERIFIED (docs index + live feed in this repo) |
| 0.5 | `contracts_for` | Request `{contracts_for: <symbol>}` confirmed. Response field names (how `CALL`/`PUT`, durations, units and barriers are discovered) were **not** captured from the docs page in this session, so no contract-type or duration mapping is hardcoded anywhere in the new module. | Request VERIFIED / response UNVERIFIED |
| 0.6 | `proposal` (Rise/Fall) | Request schema confirmed: `proposal: 1`, `underlying_symbol`, `contract_type` (enum includes `CALL` and `PUT`), `currency` (must be the account currency), `duration` + `duration_unit` (`s`/`m`/`h`/`d`/`t`), optional `barrier`, `amount` with `basis` (`stake`/`payout`), `subscribe: 1`, `passthrough`, `req_id`. Response fields (`id`, `ask_price`, `payout`, …) | Request VERIFIED / response UNVERIFIED |
| 0.6b | Design consequence | The docs state that tick trades **without a user-defined barrier**, digit trades, and <24h at-the-money contracts **are not streamed** for `R_10`, `R_25`, `R_50`, `R_75`, `R_100`, `RDBULL`, `RDBEAR`. Those are exactly the Rise/Fall tick contracts this engine targets, so a proposal **subscription** cannot be relied on: Phase B must request one fresh `proposal` per entry and enforce an explicit age bound instead of streaming quotes. | VERIFIED (proposal endpoint docs) |
| 0.7 | `buy` | Request confirmed: `{buy: '<proposal id>'}` or `{buy: 1, parameters: {price}}`; optional `passthrough`, `req_id`, `subscribe`. Contract id / transaction reference field names (`buy.contract_id`, `buy.transaction_id`, `buy.buy_price`, `buy.payout`) | Request VERIFIED / response fields IMPLEMENTED (`src/features/ai-bot/execution-engine.ts`) |
| 0.8 | `proposal_open_contract` | Request confirmed: `{proposal_open_contract: 1, contract_id?, subscribe: 1}`; omitting `contract_id` streams **all** open contracts. `is_sold`, `is_expired`, `is_valid_to_sell`, `entry_tick` are read by the vendored trade engine (`src/external/bot-skeleton/services/tradeEngine/trade/OpenContract.js`); `exit_tick`, `profit`, `status` as used there | Request VERIFIED / fields IMPLEMENTED, not re-verified |
| 0.9 | Equality / "Allow Equals" | No `allow_equals` (or equivalent) parameter appears in the `proposal` schema, and none exists anywhere in this repository. Treated as **not supported**: Rise wins only on `exit > entry`, Fall only on `exit < entry`; an equal quote is a **loss**. | VERIFIED absence in the published proposal schema |
| 0.10 | Rate limits | Not documented on the pages examined this session. The existing engine recognises Deriv's `RateLimit` error code (`utils/helpers.js`, `Sell.js`) but no numeric budget is confirmed. | UNVERIFIED (numbers) |
| 0.11 | Jurisdictional availability | Not checked. No eligibility call is implemented, so the app cannot assert that Rise/Fall is available for a given account or country. Phase B/E must establish this per account before enabling entries. | UNVERIFIED |

## Mismatches with the brief

1. **Proposal streaming.** Brief §7 assumes fresh proposals can be had on demand; for volatility-index
   tick contracts the quote **stream** is unavailable (0.6b), which makes the age bound and the
   field-level validation of §6 mandatory rather than optional. Phase A already validates signal age;
   Phase B must add proposal-age validation.
2. **Equality.** The brief allows "allow-equals" when supported. It is not exposed by the API surface
   examined, so the strict rule is the only honest implementation.
3. **Demo/Real.** Neither can be completed from public documentation alone: they need an authenticated
   OTP session and a funded/eligible account, which this session does not have. Both are gated in code
   with explicit refusals rather than simulated success.

## What was verified live in this session

* The public feed serves 1,000 historical ticks and the live stream for volatility indices
  (the digits lab and the new Rise/Fall feed both use it).
* A virtual contract settles from genuine ticks only; no price is generated anywhere in the module.
