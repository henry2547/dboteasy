/**
 * The Even/Odd surface the generated program talks to.
 *
 * Every read here is synchronous — the window is maintained from the engine's own tick stream — so
 * the blocks work inside an ordinary IF/AND/OR condition. The two entries that hand back a promise
 * (waiting for a tick and buying a contract) are exported separately and wrapped as async native
 * functions by the interpreter, exactly like the settlement wait.
 */
const getEvenOddInterface = tradeEngine => ({
    eoConfigure: config => tradeEngine.eoConfigure(config),
    eoMonitor: ticks => tradeEngine.eoMonitor(ticks),
    eoWindowReady: () => tradeEngine.eoWindowReady(),
    eoEvenPercent: () => tradeEngine.eoEvenPercent(),
    eoOddPercent: () => tradeEngine.eoOddPercent(),
    eoEvenMeets: percent => tradeEngine.eoEvenMeets(percent),
    eoOddMeets: percent => tradeEngine.eoOddMeets(percent),
    eoSignalDirection: () => tradeEngine.eoSignalDirection(),
    eoAllowOneEntry: () => tradeEngine.eoAllowOneEntry(),
    eoEntryAllowed: () => tradeEngine.eoEntryAllowed(),
    eoStatus: () => tradeEngine.eoStatus(),
    eoInvalidate: reason => tradeEngine.eoInvalidate(reason),
});

/**
 * The promise-returning part: `eoWaitTick` suspends until a genuine new tick arrives (or the session
 * stops), and the two buys suspend until the engine has really confirmed the purchase.
 */
export const getEvenOddAsyncInterface = tradeEngine => ({
    eoWaitTick: () => tradeEngine.eoWaitTick(),
    eoRecoveryPrepare: config => tradeEngine.eoRecoveryPrepare(config),
    eoBuyEven: () => tradeEngine.eoBuyEven(),
    eoBuyOdd: () => tradeEngine.eoBuyOdd(),
});

export default getEvenOddInterface;
