import TradeEngine from '../trade';
import getBotInterface from './BotInterface';
import getEvenOddInterface, { getEvenOddAsyncInterface } from './EvenOddInterface';
import getLearningInterface from './LearningInterface';
import getMarketIntelligenceInterface from './MarketIntelligenceInterface';
import getMarketScanInterface from './MarketScanInterface';
import getRiskInterface from './RiskInterface';
import getSessionControlInterface, { getSessionControlAsyncInterface } from './SessionControlInterface';
import getTicksInterface from './TicksInterface';
import getToolsInterface from './ToolsInterface';

const sleep = (observer, arg = 1) => {
    return new Promise(
        r =>
            // eslint-disable-next-line no-promise-executor-return
            setTimeout(() => {
                r();
                setTimeout(() => observer.emit('CONTINUE'), 0);
            }, arg * 1000),
        () => {}
    );
};

const Interface = $scope => {
    const tradeEngine = new TradeEngine($scope);
    const { observer } = $scope;
    const getInterface = () => {
        return {
            ...getBotInterface(tradeEngine),
            ...getToolsInterface(tradeEngine),
            // Session risk guards and stake sizing: synchronous reads of the numbers this session
            // really recorded, so they work inside an ordinary condition.
            ...getRiskInterface(tradeEngine),
            // Strategy learning: per-label hit rates and streaks from contracts this session
            // really settled, readable synchronously inside an ordinary condition.
            ...getLearningInterface(tradeEngine),
            // Session reads, the program's own stop request and journal notes — synchronous, so they
            // work inside an ordinary condition or statement.
            ...getSessionControlInterface(tradeEngine),
            // Even/Odd strategy: the rolling tick window, parity percentages, the threshold test and
            // the once-per-signal gate — synchronous reads of genuine ticks, so they work inside an
            // ordinary condition.
            ...getEvenOddInterface(tradeEngine),
            getTicksInterface: getTicksInterface(tradeEngine),
            // The one promise: the program suspends until the open contract settles.
            getSessionControlAsyncInterface: getSessionControlAsyncInterface(tradeEngine),
            // Waiting for a tick suspends the program until a genuine one arrives; the two buys
            // suspend until the engine has really confirmed the purchase.
            getEvenOddAsyncInterface: getEvenOddAsyncInterface(tradeEngine),
            // Exposed as its own surface: every entry is a promise, wrapped as an async native
            // function by the interpreter (see utils/interpreter.js).
            getMarketScanInterface: getMarketScanInterface(tradeEngine),
            // Same contract as the market scan: every entry is a promise, wrapped as an async
            // native function by the interpreter (see utils/interpreter.js).
            getMarketIntelligenceInterface: getMarketIntelligenceInterface(tradeEngine),
            watch: (...args) => tradeEngine.watch(...args),
            sleep: (...args) => sleep(observer, ...args),
            alert: (...args) => alert(...args), // eslint-disable-line no-alert
            prompt: (...args) => prompt(...args), // eslint-disable-line no-alert
            console: {
                log(...args) {
                    // eslint-disable-next-line no-console
                    console.log(new Date().toLocaleTimeString(), ...args);
                },
            },
        };
    };
    return { tradeEngine, observer, getInterface };
};

export default Interface;
