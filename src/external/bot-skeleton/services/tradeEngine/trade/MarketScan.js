/**
 * Market scanning for the "Switch active market" block.
 *
 * The scan is a controlled state machine
 * (`IDLE → DISCOVERING_MARKETS → SELECTING_MARKET → SUBSCRIBING → ANALYZING`, then either
 * `ENTRY_FOUND` or `SWITCHING_MARKET` → … , and finally `LIMIT_REACHED` / `NO_ELIGIBLE_MARKETS` /
 * `DATA_UNAVAILABLE` / `TRADE_IN_PROGRESS` / `STOPPED`).
 *
 * What it genuinely does when a market is switched:
 * 1. the app's own market-discovery service is asked for the eligible volatility markets;
 * 2. each candidate is re-checked against the live market list and its own `contracts_for` response;
 * 3. the trade engine's real tick subscription is moved to that market (`watchTicks`), which loads
 *    its history and streams its ticks — and the previous market's subscription is forgotten;
 * 4. `options.symbol` is moved with it, so proposals, purchases and `proposal_open_contract` follow
 *    the selected market (the trade engine builds its proposal from `options.symbol`);
 * 5. the program is only allowed to analyse the market once its history is loaded *and* a genuine
 *    live tick of that market has arrived, so a stale tick of the previous market can never decide
 *    an entry;
 * 6. everything is paced, bounded by the configured switch limit and re-checked against Stop.
 *
 * Scanning never trades: it only decides which market the existing strategy runs on, and it refuses
 * to touch the market while a contract is in flight. Proposals, risk controls, the Demo/Real
 * protections and the Start/Stop controls all stay where they were.
 */
import { observer as globalObserver } from '../../../utils/observer';
import { api_base } from '../../api/api-base';
import {
    MARKET_SCAN_ORDER,
    MARKET_SCAN_STATES,
    MIN_TICK_HISTORY,
    SWITCH_PACING_MS,
    TICK_POLL_INTERVAL_MS,
    TICK_READY_TIMEOUT_MS,
    createMarketScanState,
    describeMarket,
    discoverEligibleMarkets,
    isMarketTradable,
    resolveSwitchLimit,
    supportsContractTypes,
} from '../utils/market-pool';
import { DURING_PURCHASE } from './state/constants';

const journal = message => globalObserver.emit('ui.log.notify', { className: 'info', message });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const lastEpochOf = ticks =>
    Array.isArray(ticks) && ticks.length ? Number(ticks[ticks.length - 1]?.epoch) || 0 : 0;

export default Engine =>
    class MarketScan extends Engine {
        getScanState() {
            if (!this.market_scan) this.market_scan = createMarketScanState();
            return this.market_scan;
        }

        /** The snapshot the monitoring UI renders — real engine values only. */
        snapshotScan() {
            const scan = this.getScanState();
            const total = scan.eligible.length;
            return {
                state: scan.state,
                message: scan.message,
                order: scan.order,
                max_switches: scan.max_switches,
                limit: scan.limit,
                switches: scan.switches,
                cycles: scan.cycles,
                position: scan.position,
                total,
                active_symbol: scan.active_symbol,
                active_display: scan.active_display,
                analysed_count: scan.analysed.length,
                remaining_count: Math.max(0, total - scan.analysed.length),
                entry_found: scan.entry_found,
                frozen: scan.frozen,
                data_ready: scan.data_ready,
                tick_count: scan.tick_count,
                subscription_active: this.isTickSubscriptionActive(scan.active_symbol),
                connected: this.isMarketDataConnected(),
                running: Boolean(api_base.is_running),
                skipped: scan.skipped.map(entry => ({ ...entry })),
                updated_at: scan.updated_at,
            };
        }

        publishScanState() {
            globalObserver.emit('market_scan.status', this.snapshotScan());
        }

        /** The compact payload the generated program branches on. */
        scanStatusPayload() {
            const scan = this.getScanState();
            return {
                state: scan.state,
                message: scan.message,
                symbol: scan.active_symbol,
                display_name: scan.active_display,
                position: scan.position,
                total: scan.eligible.length,
                switches: scan.switches,
                limit: scan.limit,
                analysed_count: scan.analysed.length,
                remaining_count: Math.max(0, scan.eligible.length - scan.analysed.length),
                entry_found: scan.entry_found,
                data_ready: scan.data_ready,
            };
        }

        /** Moves the state machine and reports it. Identical states are not repeated in the journal. */
        transitionScanState(state, message) {
            const scan = this.getScanState();
            scan.state = state;
            scan.message = message;
            scan.updated_at = Date.now();
            const key = `${state}|${message}`;
            if (scan.reported_key !== key) {
                scan.reported_key = key;
                journal(`Market scan: ${message}`);
            }
            this.publishScanState();
            return this.scanStatusPayload();
        }

        isMarketScanStopped() {
            return Boolean(this.$scope?.stopped || api_base.is_stopping);
        }

        /** True while a contract is open, so the scan leaves the market alone mid-entry/mid-purchase. */
        isTradeInFlight() {
            const scope = this.store?.getState?.()?.scope;
            if (scope === DURING_PURCHASE) return true;
            return Boolean(this.contractId) && this.isSold === false;
        }

        isMarketDataConnected() {
            const ready_state = api_base?.api?.connection?.readyState;
            return ready_state === undefined ? Boolean(api_base?.api) : ready_state === 1;
        }

        isTickSubscriptionActive(symbol) {
            const listeners = this.$scope?.ticksService?.tickListeners;
            if (!symbol || !listeners?.hasIn?.([symbol])) return false;
            const symbol_listeners = listeners.getIn([symbol]);
            return Boolean(symbol_listeners?.size);
        }

        /**
         * Starts a scan cycle: discovers the pool, then selects the first market.
         * `mode` is not used to trade — it only records how the block was configured.
         */
        async marketScanBegin(options = {}) {
            const scan = this.getScanState();

            if (this.isMarketScanStopped()) {
                return this.transitionScanState(MARKET_SCAN_STATES.STOPPED, 'Stopped by the user.');
            }
            if (this.isTradeInFlight()) {
                return this.transitionScanState(
                    MARKET_SCAN_STATES.TRADE_IN_PROGRESS,
                    'A contract is already open, so the market was left unchanged.'
                );
            }

            scan.order =
                options?.order === MARKET_SCAN_ORDER.ROUND_ROBIN
                    ? MARKET_SCAN_ORDER.ROUND_ROBIN
                    : MARKET_SCAN_ORDER.SEQUENTIAL;
            scan.max_switches = Math.max(0, Number(options?.max_switches) || 0);
            scan.switches = 0;
            scan.cycles = 0;
            scan.cursor = 0;
            scan.analysed = [];
            scan.skipped = [];
            scan.eligible = [];
            scan.position = 0;
            scan.entry_found = false;
            scan.frozen = false;
            scan.data_ready = false;
            scan.tick_count = 0;
            scan.started_at = Date.now();
            scan.active_symbol = null;
            scan.active_display = '';

            this.transitionScanState(
                MARKET_SCAN_STATES.DISCOVERING_MARKETS,
                'Looking for the volatility markets this account may trade.'
            );

            let pool;
            try {
                pool = await discoverEligibleMarkets();
            } catch (error) {
                return this.transitionScanState(
                    MARKET_SCAN_STATES.DATA_UNAVAILABLE,
                    error?.message || 'The market list could not be loaded.'
                );
            }

            if (this.isMarketScanStopped()) {
                return this.transitionScanState(MARKET_SCAN_STATES.STOPPED, 'Stopped by the user.');
            }
            if (!pool.length) {
                return this.transitionScanState(
                    MARKET_SCAN_STATES.NO_ELIGIBLE_MARKETS,
                    'No open volatility market is available right now.'
                );
            }

            scan.eligible = pool;
            scan.limit = resolveSwitchLimit(scan.max_switches, pool.length);
            journal(
                `Market scan: ${pool.length} eligible volatility market(s) found, searching up to ${
                    scan.limit
                } (${scan.order}).`
            );

            return this.marketScanSelect();
        }

        /** The current market produced no entry: analyse the next eligible one. */
        async marketScanNext() {
            const scan = this.getScanState();
            if (scan.active_symbol) this.markAnalysed(scan.active_symbol);
            // The entry condition did not pass on this market — recorded as evidence, not inferred.
            this.recordMarketEvidence?.(scan.active_symbol, { entry_met: false });
            if (this.isMarketScanStopped()) {
                return this.transitionScanState(MARKET_SCAN_STATES.STOPPED, 'Stopped by the user.');
            }
            this.transitionScanState(
                MARKET_SCAN_STATES.SWITCHING_MARKET,
                'This market did not meet the entry conditions — moving on.'
            );
            return this.marketScanSelect();
        }

        /**
         * Freezes the selected market for the entry the strategy just found. The scan does not move
         * the market again until the strategy asks for a new scan, and never while a contract is open.
         */
        async marketScanLock() {
            const scan = this.getScanState();
            this.recordMarketEvidence?.(scan.active_symbol, { entry_met: true });
            scan.entry_found = true;
            scan.frozen = true;
            scan.active_symbol = scan.active_symbol || this.symbol;
            scan.active_display = scan.active_display || describeMarket(this.findPoolMarket(scan.active_symbol));
            return this.transitionScanState(
                MARKET_SCAN_STATES.ENTRY_FOUND,
                `Entry condition met on ${describeMarket(this.findPoolMarket(scan.active_symbol))} — market frozen for this entry.`
            );
        }

        /** Re-publishes the outcome the generated loop finished on (never duplicates a journal line). */
        async marketScanReport(status = {}) {
            const scan = this.getScanState();
            if (status?.state === MARKET_SCAN_STATES.ANALYZING) {
                return this.scanStatusPayload();
            }
            if (status?.state && status.state !== scan.state) {
                scan.state = status.state;
                scan.message = status.message || scan.message;
            }
            scan.updated_at = Date.now();
            const key = `${scan.state}|${scan.message}`;
            if (scan.reported_key !== key) {
                scan.reported_key = key;
                journal(`Market scan: ${scan.message}`);
            }
            this.publishScanState();
            return this.scanStatusPayload();
        }

        /** Called by the bot teardown: the scan stops cleanly and reports itself as stopped. */
        marketScanStop(reason = 'Stopped by the user.') {
            const scan = this.getScanState();
            if (scan.state === MARKET_SCAN_STATES.IDLE) return;
            scan.data_ready = false;
            this.transitionScanState(MARKET_SCAN_STATES.STOPPED, reason);
        }

        /** Publishes the very first snapshot so the monitoring panel can show an idle scan. */
        publishIdleScan() {
            this.getScanState();
            this.publishScanState();
        }

        // ── the state machine ────────────────────────────────────────────────────────────────────

        async marketScanSelect() {
            const scan = this.getScanState();
            // Guards: one iteration per candidate, plus one per skipped market, is always enough.
            const max_attempts = scan.limit + scan.eligible.length + 2;

            for (let attempt = 0; attempt < max_attempts; attempt += 1) {
                if (this.isMarketScanStopped()) {
                    return this.transitionScanState(MARKET_SCAN_STATES.STOPPED, 'Stopped by the user.');
                }
                if (this.isTradeInFlight()) {
                    return this.transitionScanState(
                        MARKET_SCAN_STATES.TRADE_IN_PROGRESS,
                        'A contract is already open, so the market was left unchanged.'
                    );
                }
                if (scan.switches >= scan.limit) {
                    return this.transitionScanState(
                        MARKET_SCAN_STATES.LIMIT_REACHED,
                        `Stopped after ${scan.switches} market(s): the switch limit was reached with no eligible entry.`
                    );
                }

                const market = this.pickNextMarket(scan);
                if (!market) {
                    return this.transitionScanState(
                        MARKET_SCAN_STATES.NO_ELIGIBLE_MARKETS,
                        'Every eligible volatility market was analysed without an entry.'
                    );
                }

                scan.active_symbol = market.apiSymbol;
                scan.active_display = market.displayName;
                scan.position = scan.eligible.findIndex(item => item.apiSymbol === market.apiSymbol) + 1;
                scan.data_ready = false;
                scan.tick_count = 0;

                this.transitionScanState(
                    MARKET_SCAN_STATES.SELECTING_MARKET,
                    `Selecting ${describeMarket(market)} (${scan.position}/${scan.eligible.length}).`
                );

                if (!isMarketTradable(market.apiSymbol)) {
                    this.skipMarket(scan, market, 'Market closed or suspended');
                    continue;
                }

                // A market the program has put in cooldown is skipped here, with its reason, and
                // stays visible in the excluded-markets report. Only an explicit cooldown can do
                // this: a data or account failure is refused by the cooldown block, so it can never
                // be hidden behind one.
                const cooling = this.cooldownFor?.(market.apiSymbol);
                if (cooling?.cooling) {
                    this.skipMarket(
                        scan,
                        market,
                        `In cooldown — ${cooling.entry.reason}${
                            cooling.entry.cycles_remaining
                                ? `, ${cooling.entry.cycles_remaining} scan cycle(s) left`
                                : ''
                        }${cooling.entry.remaining_seconds ? `, ${cooling.entry.remaining_seconds}s left` : ''}`
                    );
                    continue;
                }

                const contract_check = await supportsContractTypes(
                    market.apiSymbol,
                    this.options?.contractTypes
                );
                if (!contract_check.supported) {
                    this.skipMarket(scan, market, contract_check.reason);
                    continue;
                }

                this.transitionScanState(
                    MARKET_SCAN_STATES.SUBSCRIBING,
                    `Subscribing to ${describeMarket(market)}.`
                );
                const subscribed = await this.subscribeToMarket(market.apiSymbol);
                if (!subscribed.ok) {
                    this.skipMarket(scan, market, subscribed.reason);
                    continue;
                }

                const readiness = await this.waitForMarketData(market.apiSymbol);
                if (!readiness.ready) {
                    this.skipMarket(scan, market, readiness.reason);
                    continue;
                }

                scan.data_ready = true;
                scan.tick_count = readiness.tick_count;
                scan.switches += 1;

                // The measurement this market genuinely produced becomes rankable evidence.
                await this.recordScanEvidence?.(market.apiSymbol);

                this.transitionScanState(
                    MARKET_SCAN_STATES.ANALYZING,
                    `Analysing ${describeMarket(market)} — market ${scan.switches} of ${scan.limit}, ${scan.analysed.length} analysed, ${Math.max(
                        0,
                        scan.eligible.length - scan.analysed.length
                    )} left.`
                );

                // Never free-run: a short pause between two switches.
                await delay(SWITCH_PACING_MS);
                return this.scanStatusPayload();
            }

            return this.transitionScanState(
                MARKET_SCAN_STATES.LIMIT_REACHED,
                'Stopped after trying every eligible market with no eligible entry.'
            );
        }

        /**
         * The next eligible market for this cycle. Markets already analysed in the cycle are skipped;
         * when the cycle is complete a new one starts — from the first market for `sequential`, from
         * where the previous cycle ended for `round_robin`.
         */
        pickNextMarket(scan) {
            const pool = scan.eligible;
            if (!pool.length) return null;

            for (let offset = 0; offset < pool.length; offset += 1) {
                const index = (scan.cursor + offset) % pool.length;
                const market = pool[index];
                if (!scan.analysed.includes(market.apiSymbol)) {
                    scan.cursor = (index + 1) % pool.length;
                    return market;
                }
            }

            // Entire pool analysed: begin another cycle if the limit still allows switches.
            scan.analysed = [];
            scan.cycles += 1;
            // One scan cycle is complete: cycle-based market cooldowns advance by one here.
            this.advanceMarketCooldowns?.();
            if (scan.order === MARKET_SCAN_ORDER.SEQUENTIAL) scan.cursor = 0;
            const next = pool[scan.cursor % pool.length];
            scan.cursor = (scan.cursor + 1) % pool.length;
            return next || null;
        }

        markAnalysed(symbol) {
            const scan = this.getScanState();
            if (symbol && !scan.analysed.includes(symbol)) scan.analysed.push(symbol);
        }

        skipMarket(scan, market, reason) {
            this.markAnalysed(market.apiSymbol);
            scan.skipped.push({
                symbol: market.apiSymbol,
                display_name: market.displayName,
                reason: reason || 'Market unavailable',
            });
            scan.data_ready = false;
            this.transitionScanState(
                MARKET_SCAN_STATES.SELECTING_MARKET,
                `Skipped ${describeMarket(market)}: ${reason || 'market unavailable'}.`
            );
        }

        findPoolMarket(symbol) {
            const scan = this.getScanState();
            return scan.eligible.find(market => market.apiSymbol === symbol) || null;
        }

        /** Moves the trade engine's real tick subscription (and its symbol) to the new market. */
        async subscribeToMarket(symbol) {
            const previous_symbol = this.symbol;
            try {
                await this.watchTicks(symbol);
            } catch (error) {
                return { ok: false, reason: error?.message || 'The market feed could not be subscribed' };
            }

            if (this.symbol !== symbol) {
                return { ok: false, reason: 'The market feed did not accept the subscription' };
            }

            // Proposals, purchases and contract updates follow the selected market from here on.
            if (this.options) this.options.symbol = symbol;

            await this.forgetMarketTicks(previous_symbol);
            return { ok: true };
        }

        /**
         * Releases the previous market's tick subscription and its cached ticks, so a delayed message
         * or a cached frame of the old market can never be read as the new market's data.
         */
        async forgetMarketTicks(symbol) {
            if (!symbol || symbol === this.symbol) return;

            const { ticksService } = this.$scope || {};
            if (!ticksService) return;

            const subscription_id = ticksService.subscriptions?.getIn?.(['tick', symbol]);
            if (subscription_id && api_base?.api) {
                try {
                    await api_base.api.send({ forget: subscription_id });
                } catch (error) {
                    console.warn('Market scan: could not forget the previous market subscription', error);
                }
            }

            if (ticksService.subscriptions?.deleteIn) {
                ticksService.subscriptions = ticksService.subscriptions.deleteIn(['tick', symbol]);
            }
            if (ticksService.ticks?.delete) {
                ticksService.ticks = ticksService.ticks.delete(symbol);
            }
        }

        /**
         * A market may only be analysed on its own genuine data: its history must be loaded and its
         * own live tick stream must have produced at least one fresh tick since the subscription.
         */
        async waitForMarketData(symbol) {
            const { ticksService } = this.$scope || {};
            if (!ticksService?.request) return { ready: false, reason: 'The tick service is unavailable' };

            let ticks;
            try {
                ticks = await ticksService.request({ symbol });
            } catch (error) {
                return { ready: false, reason: 'Tick history could not be loaded' };
            }

            if (!Array.isArray(ticks) || ticks.length < MIN_TICK_HISTORY) {
                return {
                    ready: false,
                    reason: `Not enough tick history (${Array.isArray(ticks) ? ticks.length : 0} of ${MIN_TICK_HISTORY})`,
                };
            }

            const baseline_epoch = lastEpochOf(ticks);
            const deadline = Date.now() + TICK_READY_TIMEOUT_MS;

            while (Date.now() < deadline) {
                if (this.isMarketScanStopped()) return { ready: false, reason: 'Stopped by the user' };

                let latest;
                try {
                    latest = await ticksService.request({ symbol });
                } catch (error) {
                    return { ready: false, reason: 'The market feed stopped responding' };
                }

                if (lastEpochOf(latest) > baseline_epoch) {
                    return { ready: true, tick_count: latest.length };
                }

                await delay(TICK_POLL_INTERVAL_MS);
            }

            return { ready: false, reason: 'No live tick arrived in time' };
        }
    };
