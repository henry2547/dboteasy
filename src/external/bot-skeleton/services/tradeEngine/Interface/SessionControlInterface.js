/**
 * The session-control surface the generated program talks to.
 *
 * Everything here except the settlement wait is a synchronous read (or a state change), so a block
 * can sit inside an ordinary condition without suspending the interpreter. The one promise entry is
 * exported separately and wrapped as an async native function by the interpreter.
 */
const getSessionControlInterface = tradeEngine => ({
    sessionLastResult: () => tradeEngine.sessionLastResult(),
    sessionLastProfit: () => tradeEngine.sessionLastProfit(),
    sessionProfit: () => tradeEngine.sessionProfit(),
    sessionTradesTaken: () => tradeEngine.sessionTradesTaken(),
    sessionOpenContracts: () => tradeEngine.sessionOpenContracts(),
    sessionHasOpenContract: () => tradeEngine.sessionHasOpenContract(),
    sessionTradeLimitReached: limit => tradeEngine.sessionTradeLimitReached(limit),
    sessionStop: reason => tradeEngine.stopBotWithReason(reason),
    sessionJournal: (message, level) => tradeEngine.journalNote(message, level),
    sessionReport: () => tradeEngine.sessionReport(),
});

/** The promise-returning part: the generated program suspends until the contract settles. */
export const getSessionControlAsyncInterface = tradeEngine => ({
    sessionWaitForSettlement: () => tradeEngine.waitForSessionSettlement(),
});

export default getSessionControlInterface;
