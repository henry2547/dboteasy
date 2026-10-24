/**
 * The market-scan surface the generated program talks to.
 *
 * Every entry returns a promise: the interpreter wraps these in async native functions, so the
 * generated loop suspends while a market is discovered, subscribed and confirmed to be delivering
 * its own genuine ticks, instead of busy-waiting on the interpreter thread.
 */
const getMarketScanInterface = tradeEngine => {
    return {
        marketScanBegin: (...args) => tradeEngine.marketScanBegin(...args),
        marketScanBestParity: (...args) => tradeEngine.marketScanBestParity(...args),
        marketScanNext: (...args) => tradeEngine.marketScanNext(...args),
        marketScanLock: (...args) => tradeEngine.marketScanLock(...args),
        marketScanReport: (...args) => tradeEngine.marketScanReport(...args),
    };
};

export default getMarketScanInterface;
