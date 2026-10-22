/**
 * Market intelligence for the Bot Builder: eligible-market discovery, readiness, ranking and
 * market cooldowns — the runtime behind the "Market Intelligence" blocks.
 *
 * Everything here is measured from the app's own services: the pool comes from the existing
 * market-discovery service (`market-pool.js` → `filterDigitMarkets` over `active_symbols`), the
 * readiness numbers come from this trade engine's own tick subscription and tick cache, and a
 * market's contract compatibility comes from the API's `contracts_for` response. Nothing is
 * fabricated and no market is ever ranked on an invented score:
 * - a market that has not been measured is reported as *not measured*, never as zero-quality;
 * - the only criterion that looks at outcomes reads completed *virtual* observations and refuses
 *   to rank at all below `MIN_PERFORMANCE_SAMPLE`;
 * - a cooldown is refused when its reason describes a data-quality or account problem, so a broken
 *   feed can never be hidden behind one (the caller reports the error instead).
 *
 * Cooldowns only ever steer this bot's own market scanning: they are consulted by `MarketScan`'s
 * candidate selection and by nothing else, so no risk control, proposal or purchase path changes.
 */
import { observer as globalObserver } from '../../../utils/observer';
import { getLastDigit } from '../utils/helpers';
import {
    MARKET_RANK_CRITERIA,
    MIN_PERFORMANCE_SAMPLE,
    MIN_READINESS_HISTORY,
    consumeScanCycle,
    createCooldownStore,
    evaluateMarketReadiness,
    isMarketCooling,
    listCoolingMarkets,
    rankEligibleMarkets,
    setMarketCooldown,
} from '../utils/market-intelligence';
import {
    MIN_TICK_HISTORY,
    discoverEligibleMarkets,
    isMarketTradable,
    supportsContractTypes,
} from '../utils/market-pool';

const journal = (message, className = 'info') => globalObserver.emit('ui.log.notify', { className, message });

/** Journal/panel event carrying a market-intelligence snapshot. */
export const MARKET_INTELLIGENCE_STATUS_EVENT = 'market_intelligence.status';

const CATEGORY_LABELS = {
    all: 'every supported volatility market',
    'Volatility Indices': 'Volatility Indices',
    '1-Second Volatility Indices': 'Volatility 1-Second Indices',
};

export default Engine =>
    class MarketIntelligence extends Engine {
        getMarketIntelligenceState() {
            if (!this.market_intelligence) {
                this.market_intelligence = {
                    cooldown: createCooldownStore(),
                    discovery: null,
                    ranking: null,
                    evidence: {},
                };
            }
            return this.market_intelligence;
        }

        /** The snapshot the monitoring UI (and the tests) read — real engine values only. */
        marketIntelligenceSnapshot() {
            const state = this.getMarketIntelligenceState();
            return {
                discovery: state.discovery
                    ? { ...state.discovery, markets: state.discovery.markets.map(market => ({ ...market })) }
                    : null,
                ranking: state.ranking
                    ? {
                          criterion: state.ranking.criterion,
                          criterion_label: state.ranking.criterion_label,
                          ranked: state.ranking.ranked.map(item => ({ ...item })),
                          unranked: state.ranking.unranked.map(item => ({ ...item })),
                          at: state.ranking.at,
                      }
                    : null,
                excluded: listCoolingMarkets(state.cooldown),
            };
        }

        publishMarketIntelligence() {
            globalObserver.emit(MARKET_INTELLIGENCE_STATUS_EVENT, this.marketIntelligenceSnapshot());
        }

        /** The market a readiness/cooldown read applies to when the program names none. */
        resolveIntelligenceSymbol(symbol) {
            const requested = String(symbol ?? '').trim();
            return requested || this.symbol || this.options?.symbol || '';
        }

        /** Metadata for a symbol, from the pool this session discovered (never invented). */
        findPoolMarket(symbol) {
            const state = this.getMarketIntelligenceState();
            const pool = state.discovery?.markets || [];
            return pool.find(market => market.symbol === symbol) || null;
        }

        /** Evidence a scan genuinely produced for a market, recorded so a ranking has a basis. */
        recordMarketEvidence(symbol, evidence = {}) {
            if (!symbol) return;
            const state = this.getMarketIntelligenceState();
            const previous = state.evidence[symbol] || {};
            state.evidence[symbol] = { ...previous, ...evidence, symbol, at: Date.now() };
        }

        // ── discovery ───────────────────────────────────────────────────────────────────────────

        /**
         * Discovers the markets this account may trade from the app's market-discovery service and
         * filters them by the supported market category, availability and — when asked — the
         * contract types this bot is configured to trade. Fails loudly with a reason instead of
         * returning an empty pool.
         */
        async marketIntelligenceDiscover(options = {}) {
            const state = this.getMarketIntelligenceState();
            const category = CATEGORY_LABELS[options.category] ? options.category : 'all';
            const min_history = Math.max(0, Number(options.min_history) || MIN_READINESS_HISTORY);
            const verify_contracts = options.verify_contracts === true;
            const started_at = Date.now();

            if (this.isMarketScanStopped?.()) {
                return { ok: false, count: 0, reason: 'The bot is stopping, so no market was discovered.' };
            }

            let pool;
            try {
                pool = await discoverEligibleMarkets();
            } catch (error) {
                const reason = error?.message || 'The market list could not be loaded from the Deriv API';
                state.discovery = { at: started_at, category, min_history, markets: [], reason, error: true };
                this.publishMarketIntelligence();
                journal(`Market intelligence: market discovery failed — ${reason}`, 'warn');
                return { ok: false, count: 0, reason };
            }

            const in_category = pool.filter(
                market =>
                    (category === 'all' || market.category === category) &&
                    market.isOpen !== false &&
                    market.isSuspended !== true &&
                    market.availability !== 'unavailable'
            );

            const accepted = [];
            const rejected = [];
            for (const market of in_category) {
                if (this.isMarketScanStopped?.()) {
                    return { ok: false, count: 0, reason: 'The bot was stopped while discovering markets.' };
                }
                if (!isMarketTradable(market.apiSymbol)) {
                    rejected.push({ symbol: market.apiSymbol, reason: 'Market closed or suspended' });
                    continue;
                }
                if (verify_contracts && this.options?.contractTypes?.length) {
                    const check = await supportsContractTypes(market.apiSymbol, this.options.contractTypes);
                    if (!check.supported) {
                        rejected.push({ symbol: market.apiSymbol, reason: check.reason || 'Contract not offered' });
                        continue;
                    }
                }
                accepted.push({
                    symbol: market.apiSymbol,
                    display_name: market.displayName,
                    category: market.category,
                });
            }

            state.discovery = {
                at: started_at,
                category,
                min_history,
                verify_contracts,
                markets: accepted,
                rejected,
                reason: '',
                error: false,
            };
            this.publishMarketIntelligence();

            if (!accepted.length) {
                const reason = `No eligible market in ${CATEGORY_LABELS[category]}${
                    rejected.length ? ` — ${rejected.length} market(s) rejected` : ''
                }.`;
                journal(`Market intelligence: ${reason}`, 'warn');
                return { ok: false, count: 0, reason, rejected };
            }

            journal(
                `Market intelligence: ${accepted.length} eligible market(s) in ${CATEGORY_LABELS[category]}${
                    rejected.length ? `, ${rejected.length} rejected` : ''
                }, minimum ${min_history} tick(s) for readiness.`
            );
            return { ok: true, count: accepted.length, reason: '', rejected };
        }

        /** How many markets the last discovery accepted (0 when nothing has been discovered yet). */
        async marketIntelligenceEligibleCount() {
            const state = this.getMarketIntelligenceState();
            return state.discovery?.markets?.length || 0;
        }

        // ── readiness ───────────────────────────────────────────────────────────────────────────

        /**
         * Reads the evidence a readiness decision needs — genuine tick history from this engine's
         * own tick cache, the live subscription, the connection and the API's contract list — and
         * returns the structured readiness result from `evaluateMarketReadiness`.
         */
        async marketIntelligenceReadiness(options = {}) {
            const symbol = this.resolveIntelligenceSymbol(options.symbol);
            const required_history = Math.max(0, Number(options.required_history) || MIN_READINESS_HISTORY);
            const now = Date.now();

            if (!symbol) {
                return {
                    symbol: '',
                    display_name: '',
                    ready: false,
                    checks: [],
                    passed: 0,
                    total: 0,
                    reason: 'No market is selected, so readiness cannot be measured',
                };
            }

            const ticks = await this.readMarketTicks(symbol);
            const last_tick_epoch = this.lastTickEpoch(ticks);
            const pool_market = this.findPoolMarket(symbol);

            let contract_check = null;
            if (this.options?.contractTypes?.length) {
                contract_check = await supportsContractTypes(symbol, this.options.contractTypes);
            }

            const readiness = evaluateMarketReadiness({
                symbol,
                display_name: pool_market?.display_name || (symbol === this.symbol ? this.getActiveMarketName() : symbol),
                metadata_available: Boolean(pool_market) || symbol === this.symbol,
                metadata_reason: 'This market is not in the pool discovered for this run',
                tick_count: Array.isArray(ticks) ? ticks.length : 0,
                last_tick_epoch,
                now,
                subscription_active: this.isTickSubscriptionActive(symbol),
                connected: this.isMarketDataConnected(),
                contract_check,
                required_history,
            });

            this.recordMarketEvidence(symbol, {
                tick_count: Array.isArray(ticks) ? ticks.length : 0,
                last_tick_epoch,
                data_ready: readiness.ready,
                ready_checks: { passed: readiness.passed, total: readiness.total },
                frequencies: this.digitShares(symbol, ticks),
            });
            this.publishMarketIntelligence();
            return readiness;
        }

        /** The boolean half of readiness, for a Condition socket: false whenever anything fails. */
        async marketIntelligenceReadinessPassed(options = {}) {
            const readiness = await this.marketIntelligenceReadiness(options);
            if (!readiness.ready) {
                journal(
                    `Market intelligence: ${readiness.display_name || readiness.symbol} is not ready — ${readiness.reason}`,
                    'warn'
                );
            }
            return readiness.ready;
        }

        /** Journals every readiness check, pass or fail, so a refusal can be diagnosed. */
        async marketIntelligenceReadinessReport(options = {}) {
            const readiness = await this.marketIntelligenceReadiness(options);
            const name = readiness.display_name || readiness.symbol || 'the selected market';
            journal(
                `Market intelligence: readiness of ${name} — ${readiness.passed}/${readiness.total} check(s) passed${
                    readiness.ready ? '' : `, ${readiness.reason}`
                }.`
            );
            readiness.checks.forEach(check => {
                journal(`  ${check.ok ? '✓' : '✗'} ${check.label}: ${check.detail}`, check.ok ? 'info' : 'warn');
            });
            return readiness.ready;
        }

        // ── ranking ─────────────────────────────────────────────────────────────────────────────

        /**
         * Ranks the discovered markets by one measurable criterion, using only evidence this
         * session recorded. Markets without a measurement come back unranked with the reason, and
         * the journal names the basis of every position instead of a bare score.
         */
        async marketIntelligenceRank(options = {}) {
            const state = this.getMarketIntelligenceState();
            const criterion = Object.values(MARKET_RANK_CRITERIA).includes(options.criterion)
                ? options.criterion
                : MARKET_RANK_CRITERIA.READINESS;
            const min_sample = Math.max(1, Number(options.min_sample) || MIN_PERFORMANCE_SAMPLE);

            const pool = state.discovery?.markets || [];
            if (!pool.length) {
                const reason = 'No market has been discovered yet — run “Find eligible markets” first';
                journal(`Market intelligence: ${reason}`, 'warn');
                return { criterion, ranked: [], unranked: [], reason };
            }

            const entries = pool.map(market => {
                const evidence = state.evidence[market.symbol] || {};
                return {
                    symbol: market.symbol,
                    display_name: market.display_name,
                    tick_count: evidence.tick_count,
                    entry_met: evidence.entry_met,
                    frequencies: evidence.frequencies,
                    ready_checks: evidence.ready_checks,
                    observed: evidence.observed,
                };
            });

            const ranking = rankEligibleMarkets(entries, criterion, { min_sample, now: Date.now() });
            state.ranking = { ...ranking, at: Date.now() };
            this.publishMarketIntelligence();

            const label = ranking.criterion_label;
            if (!ranking.ranked.length) {
                journal(
                    `Market intelligence: no market could be ranked by ${label} — ${ranking.unranked.length} market(s) have no measurement yet.`,
                    'warn'
                );
            } else {
                journal(`Market intelligence: ranking ${ranking.ranked.length} market(s) by ${label}.`);
                ranking.ranked.forEach(item => {
                    journal(`  #${item.rank} ${item.display_name} — ${item.reason}`);
                });
            }
            ranking.unranked.forEach(item => {
                journal(`  not ranked: ${item.display_name} — ${item.reason}`, 'warn');
            });

            return ranking;
        }

        /** The symbol of the market that topped the last ranking, or '' when there is none. */
        async marketIntelligenceTopMarket() {
            const state = this.getMarketIntelligenceState();
            const top = state.ranking?.ranked?.[0];
            if (!top) return '';
            return top.symbol;
        }

        // ── cooldown ────────────────────────────────────────────────────────────────────────────

        /**
         * Temporarily excludes a market from this bot's scanning after a chosen event. Refuses —
         * and reports as an error — when the reason describes a data-quality or account problem.
         */
        async marketIntelligenceCooldown(options = {}) {
            const state = this.getMarketIntelligenceState();
            const symbol = this.resolveIntelligenceSymbol(options.symbol);
            const cycles = Math.max(0, Math.floor(Number(options.cycles) || 0));
            const minutes = Math.max(0, Number(options.minutes) || 0);
            const reason = String(options.reason ?? '').trim() || 'Cooling down after the configured event';
            const pool_market = this.findPoolMarket(symbol);

            const result = setMarketCooldown(state.cooldown, {
                symbol,
                display_name: pool_market?.display_name || symbol,
                reason,
                cycles,
                minutes,
                source: 'block',
            });

            this.publishMarketIntelligence();

            if (!result.applied) {
                journal(`Market intelligence: ${result.reason}`, 'warn');
                return { applied: false, reason: result.reason, critical: Boolean(result.critical) };
            }

            journal(
                `Market intelligence: ${result.entry.display_name} is in cooldown — ${reason}${
                    cycles ? `, ${cycles} scan cycle(s)` : ''
                }${minutes ? `${cycles ? ' and' : ''} ${minutes} minute(s)` : ''}.`
            );
            return { applied: true, reason: '', critical: false, entry: result.entry };
        }

        /**
         * The cooldown entry currently excluding this market, if any. The market scan consults this
         * before it subscribes, so a cooling market is skipped with its reason rather than traded on.
         */
        cooldownFor(symbol) {
            return isMarketCooling(this.getMarketIntelligenceState().cooldown, symbol);
        }

        /**
         * Called by the scan on the market it has just subscribed and confirmed: measuring readiness
         * here records the evidence (`ready_checks`, tick count, digit shares) a later ranking cites.
         */
        async recordScanEvidence(symbol) {
            const readiness = await this.marketIntelligenceReadiness({ symbol });
            this.recordMarketEvidence(symbol, { data_ready: readiness.ready });
            return readiness;
        }

        /** True while that market is excluded by a cooldown this program set. */
        async marketIntelligenceIsCooling(options = {}) {
            const state = this.getMarketIntelligenceState();
            const symbol = this.resolveIntelligenceSymbol(options.symbol);
            const { cooling, entry } = isMarketCooling(state.cooldown, symbol);
            if (cooling) {
                journal(
                    `Market intelligence: ${entry.display_name || symbol} is in cooldown — ${entry.reason}${
                        entry.remaining_seconds ? `, ${entry.remaining_seconds}s left` : ''
                    }${entry.cycles_remaining ? `, ${entry.cycles_remaining} scan cycle(s) left` : ''}.`
                );
            }
            return cooling;
        }

        /**
         * Journals every exclusion the session holds: the cooldowns this program set, and the
         * quality/permission reasons the scan recorded — kept apart, so a cooldown can never
         * quietly stand in for a data or account problem.
         */
        async marketIntelligenceExcludedReport() {
            const state = this.getMarketIntelligenceState();
            const excluded = listCoolingMarkets(state.cooldown);
            const quality = (this.getScanState?.().skipped || []).map(item => ({ ...item }));

            if (!excluded.length && !quality.length) {
                journal('Market intelligence: no market is excluded right now.');
            } else {
                journal(`Market intelligence: ${excluded.length} market(s) in cooldown, ${quality.length} skipped for data or contract reasons.`);
                excluded.forEach(item => {
                    journal(
                        `  cooldown: ${item.display_name} — ${item.reason}${
                            item.cycles_remaining ? ` (${item.cycles_remaining} scan cycle(s) left)` : ''
                        }${item.minutes_remaining ? ` (${item.minutes_remaining} minute(s) left)` : ''}`
                    );
                });
                quality.forEach(item => {
                    journal(`  skipped: ${item.display_name || item.symbol} — ${item.reason}`, 'warn');
                });
            }

            return { cooldown: excluded, quality_skips: quality };
        }

        /** Called by the scan when a market is reached: its measurement becomes rankable evidence. */
        advanceMarketCooldowns() {
            const state = this.getMarketIntelligenceState();
            const released = consumeScanCycle(state.cooldown, { now: Date.now() });
            if (released.length) {
                journal(
                    `Market intelligence: cooldown finished for ${released
                        .map(entry => entry.display_name || entry.symbol)
                        .join(', ')} — the market is eligible again.`
                );
                this.publishMarketIntelligence();
            }
            return released;
        }

        // ── measurements ────────────────────────────────────────────────────────────────────────

        /** The market's own cached ticks from this engine's tick service; null when unavailable. */
        async readMarketTicks(symbol) {
            const { ticksService } = this.$scope || {};
            if (!symbol || !ticksService?.request) return null;
            try {
                const ticks = await ticksService.request({ symbol });
                return Array.isArray(ticks) ? ticks : null;
            } catch (error) {
                return null;
            }
        }

        lastTickEpoch(ticks) {
            if (!Array.isArray(ticks) || !ticks.length) return 0;
            const last = ticks[ticks.length - 1];
            const epoch = Number(typeof last === 'object' ? last?.epoch : NaN);
            return Number.isFinite(epoch) ? epoch : 0;
        }

        /**
         * The share of each final digit over the market's genuine ticks, or null when the market's
         * precision is unknown — a share is never estimated from tick timestamps. Digit extraction
         * reuses the trade engine's own `getPipSize()`/`getLastDigit()`, and only the market this
         * engine is actually subscribed to has a known precision here.
         */
        digitShares(symbol, ticks) {
            if (!Array.isArray(ticks) || ticks.length < MIN_TICK_HISTORY) return null;
            if (symbol !== this.symbol) return null;
            const pip_size = this.getPipSize?.();
            if (!Number.isFinite(Number(pip_size))) return null;

            const counts = new Array(10).fill(0);
            ticks.forEach(tick => {
                const value = typeof tick === 'object' ? tick?.quote : tick;
                if (!Number.isFinite(Number(value))) return;
                const digit = Number(getLastDigit(Number(value).toFixed(Number(pip_size))));
                if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit] += 1;
            });

            const total = counts.reduce((sum, count) => sum + count, 0);
            if (!total) return null;
            return counts.map(count => count / total);
        }

        /** The display name of the market this engine is on, from the discovered pool when known. */
        getActiveMarketName() {
            return this.findPoolMarket(this.symbol)?.display_name || this.symbol;
        }
    };
