import TradeEngine from '../trade';
import getBotInterface from './BotInterface';
import getMarketIntelligenceInterface from './MarketIntelligenceInterface';
import getMarketScanInterface from './MarketScanInterface';
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
            getTicksInterface: getTicksInterface(tradeEngine),
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
