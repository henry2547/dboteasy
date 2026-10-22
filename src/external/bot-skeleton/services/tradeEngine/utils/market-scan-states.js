/**
 * The market-scan vocabulary, kept in a dependency-free module.
 *
 * Both halves of the feature share it: the trade engine's scan state machine and the generated code
 * of the "Switch active market" block. It imports nothing, so block definitions can use it without
 * pulling the API services into the Blockly bundle.
 */

/**
 * The scan state machine. `ANALYZING` is the only state in which the strategy may read a market:
 * it has been selected, its genuine history is loaded and its own live tick stream has confirmed at
 * least one fresh tick.
 */
export const MARKET_SCAN_STATES = Object.freeze({
    IDLE: 'IDLE',
    DISCOVERING_MARKETS: 'DISCOVERING_MARKETS',
    SELECTING_MARKET: 'SELECTING_MARKET',
    SUBSCRIBING: 'SUBSCRIBING',
    ANALYZING: 'ANALYZING',
    ENTRY_FOUND: 'ENTRY_FOUND',
    SWITCHING_MARKET: 'SWITCHING_MARKET',
    LIMIT_REACHED: 'LIMIT_REACHED',
    NO_ELIGIBLE_MARKETS: 'NO_ELIGIBLE_MARKETS',
    DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
    TRADE_IN_PROGRESS: 'TRADE_IN_PROGRESS',
    STOPPED: 'STOPPED',
});

/** Journal event the monitoring panel listens to. */
export const MARKET_SCAN_STATUS_EVENT = 'market_scan.status';

/**
 * `sequential` always walks the discovered pool from its first market and restarts there in the
 * next cycle; `round_robin` continues where the previous cycle ended, so repeated cycles rotate
 * through the pool instead of hammering its head.
 */
export const MARKET_SCAN_ORDER = Object.freeze({
    SEQUENTIAL: 'sequential',
    ROUND_ROBIN: 'round_robin',
});

/** History a market must already hold before its ticks may be read by the strategy. */
export const MIN_TICK_HISTORY = 20;
/** How long a freshly subscribed market gets to deliver its first genuine live tick. */
export const TICK_READY_TIMEOUT_MS = 6000;
/** Pause between two market switches so the scan can never free-run through the pool. */
export const SWITCH_PACING_MS = 250;
/** How long the initial market discovery may take before the scan reports it as unavailable. */
export const DISCOVERY_TIMEOUT_MS = 15000;
/** How often the scan looks for the first live tick of a freshly subscribed market. */
export const TICK_POLL_INTERVAL_MS = 200;
