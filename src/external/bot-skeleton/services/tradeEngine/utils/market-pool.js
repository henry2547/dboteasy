/**
 * The market pool behind the "Switch active market" block.
 *
 * Only genuine, dynamically discovered markets are ever used here: the pool is the app's own active
 * symbol list, filtered to the two volatility families the digit tooling supports, to the markets
 * that are open and not suspended right now, and — per candidate — to markets whose `contracts_for`
 * response really offers the contract types the bot is set up to trade. Nothing here fabricates a
 * symbol, a price, a tick or a precision: symbols keep their exact API codes and every price keeps
 * coming from the trade engine's own tick processing for that symbol.
 *
 * The state/order vocabulary and the pacing constants live in `market-scan-states.js` so the block
 * definition can read them without importing the API services.
 */
import { filterDigitMarkets, normalizeActiveSymbols } from '@/pages/digits/markets';
import ApiHelpers from '../../api/api-helpers';
import { DISCOVERY_TIMEOUT_MS } from './market-scan-states';

export {
    MARKET_SCAN_ORDER,
    MARKET_SCAN_STATES,
    MIN_TICK_HISTORY,
    SWITCH_PACING_MS,
    TICK_POLL_INTERVAL_MS,
    TICK_READY_TIMEOUT_MS,
} from './market-scan-states';

export const createMarketScanState = () => ({
    state: 'IDLE',
    message: '',
    order: 'sequential',
    max_switches: 0,
    limit: 0,
    switches: 0,
    cycles: 0,
    cursor: 0,
    eligible: [],
    analysed: [],
    skipped: [],
    active_symbol: null,
    active_display: '',
    position: 0,
    entry_found: false,
    frozen: false,
    data_ready: false,
    tick_count: 0,
    started_at: null,
    updated_at: null,
    reported_key: '',
});

/** Human label for a discovered market: display name plus the exact API symbol. */
export const describeMarket = market => (market ? `${market.displayName} (${market.apiSymbol})` : '');

/**
 * The safety limit on one search: the configured maximum switch count when the user set one,
 * otherwise one full cycle through the eligible pool.
 */
export const resolveSwitchLimit = (max_switches, pool_size) => {
    const configured = Number(max_switches);
    if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
    return Math.max(1, pool_size);
};

const withTimeout = (promise, ms, message) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });

/**
 * Discovers the markets the app may switch to, from the existing market-discovery service.
 *
 * Fails loudly instead of returning an empty pool: an empty list means "no eligible market right
 * now", a throw means "the market list could not be read", and the two are reported differently.
 */
export const discoverEligibleMarkets = async () => {
    const active_symbols = ApiHelpers?.instance?.active_symbols;
    if (!active_symbols?.retrieveActiveSymbols) {
        throw new Error('Market discovery is unavailable until the connection is ready');
    }

    const symbols = await withTimeout(
        active_symbols.retrieveActiveSymbols(),
        DISCOVERY_TIMEOUT_MS,
        'The market list took too long to load'
    );

    if (!Array.isArray(symbols) || !symbols.length || active_symbols.has_initialization_error) {
        throw new Error('The market list could not be loaded from the Deriv API');
    }

    // Volatility Indices + Volatility 1-Second Indices, open and not suspended. The order the API
    // returns is kept, so a sequential walk is deterministic and matches the app's own market list.
    return filterDigitMarkets(normalizeActiveSymbols(symbols)).filter(
        market => market.availability === 'available'
    );
};

/**
 * Re-checks a candidate against the live market list before it is subscribed: markets close and
 * suspend while a scan is running, and a closed market must be skipped rather than traded on.
 */
export const isMarketTradable = symbol => {
    const active_symbols = ApiHelpers?.instance?.active_symbols;
    if (!active_symbols?.isSymbolClosed) return false;
    return !active_symbols.isSymbolClosed(symbol);
};

/**
 * True when the market's own `contracts_for` response offers one of the contract types this bot is
 * set up to trade. The response is cached by the existing service, so a market is verified once per
 * session instead of on every switch.
 */
export const supportsContractTypes = async (symbol, contract_types = []) => {
    if (!Array.isArray(contract_types) || contract_types.length === 0) {
        return { supported: true, reason: '' };
    }

    const contracts_for = ApiHelpers?.instance?.contracts_for;
    if (!contracts_for?.getContractsFor) return { supported: true, reason: '' };

    let contracts;
    try {
        contracts = await withTimeout(
            contracts_for.getContractsFor(symbol),
            DISCOVERY_TIMEOUT_MS,
            `${symbol} contract list took too long`
        );
    } catch (error) {
        return { supported: false, reason: 'Contracts could not be verified for this market' };
    }

    if (!Array.isArray(contracts) || contracts.length === 0) {
        return { supported: false, reason: 'The API returned no contracts for this market' };
    }

    const offered = contracts.some(contract => contract_types.includes(contract.contract_type));
    return offered ? { supported: true, reason: '' } : { supported: false, reason: `Does not offer ${contract_types.join('/')}` };
};
