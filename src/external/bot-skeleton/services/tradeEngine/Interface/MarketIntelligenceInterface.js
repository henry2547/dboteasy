/**
 * The market-intelligence surface the generated program talks to.
 *
 * Every entry returns a promise: the interpreter wraps these as async native functions, so the
 * generated program suspends while a market pool is discovered or a contract list is verified
 * instead of busy-waiting on the interpreter thread.
 */
const getMarketIntelligenceInterface = tradeEngine => ({
    marketIntelligenceDiscover: (...args) => tradeEngine.marketIntelligenceDiscover(...args),
    marketIntelligenceEligibleCount: (...args) => tradeEngine.marketIntelligenceEligibleCount(...args),
    marketIntelligenceReadiness: (...args) => tradeEngine.marketIntelligenceReadiness(...args),
    marketIntelligenceReadinessPassed: (...args) => tradeEngine.marketIntelligenceReadinessPassed(...args),
    marketIntelligenceReadinessReport: (...args) => tradeEngine.marketIntelligenceReadinessReport(...args),
    marketIntelligenceRank: (...args) => tradeEngine.marketIntelligenceRank(...args),
    marketIntelligenceTopMarket: (...args) => tradeEngine.marketIntelligenceTopMarket(...args),
    marketIntelligenceCooldown: (...args) => tradeEngine.marketIntelligenceCooldown(...args),
    marketIntelligenceIsCooling: (...args) => tradeEngine.marketIntelligenceIsCooling(...args),
    marketIntelligenceExcludedReport: (...args) => tradeEngine.marketIntelligenceExcludedReport(...args),
});

export default getMarketIntelligenceInterface;
