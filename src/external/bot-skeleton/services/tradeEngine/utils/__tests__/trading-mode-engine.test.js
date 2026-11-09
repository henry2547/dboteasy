import TradingMode, { TRADING_MODES } from '../../trade/TradingMode';
import { observerRuntime } from '../../../observer';

jest.mock('../../../../utils/observer', () => ({
    observer: { register: jest.fn(), emit: jest.fn() },
}));

jest.mock('../../../observer', () => ({
    observerRuntime: { gateEnabled: jest.fn(() => false), consumeEntry: jest.fn(() => false) },
}));

const createEngine = (tradingMode, { gate = false, lastResult = 'win' } = {}) => {
    const Engine = TradingMode(class {});
    const engine = new Engine();
    engine.options = { tradingMode };
    engine.sessionLastResult = () => lastResult;
    engine.resetTradingMode();
    observerRuntime.gateEnabled.mockReturnValue(gate);
    observerRuntime.consumeEntry.mockReturnValue(false);
    return engine;
};

/** One tick of the purchase loop: the canvas either reached its purchase block or it did not. */
const runPurchaseTick = (engine, attempted) => {
    engine.tradingModeTickStart();
    if (attempted) engine.tradingModePurchaseAttempted();
    engine.tradingModeTickEnd();
};

describe('trading mode', () => {
    it('defaults to continuous when the trade definition does not name a mode', () => {
        expect(createEngine(undefined).tradingMode()).toBe(TRADING_MODES.CONTINUOUS);
        expect(createEngine('SOMETHING_ELSE').tradingMode()).toBe(TRADING_MODES.CONTINUOUS);
        expect(createEngine('SINGLE').tradingMode()).toBe(TRADING_MODES.SINGLE);
    });

    it('keeps the entry live in continuous mode after a settled contract', () => {
        const engine = createEngine('CONTINUOUS');
        engine.tradingModePurchaseAttempted();
        engine.tradingModePurchased();
        engine.tradingModeTradeSettled();

        expect(engine.tradingModeBlocksPurchase()).toBe(false);
        runPurchaseTick(engine, false);
        expect(engine.tradingModeBlocksPurchase()).toBe(false);
    });

    it('holds the next purchase back in single mode until the entry conditions lapse', () => {
        const engine = createEngine('SINGLE');
        runPurchaseTick(engine, true);
        engine.tradingModePurchased();
        engine.tradingModeTradeSettled();

        // The conditions still hold on the next tick: no second contract for this entry.
        expect(engine.tradingModeBlocksPurchase()).toBe(true);
        runPurchaseTick(engine, true);
        expect(engine.tradingModeBlocksPurchase()).toBe(true);

        // A tick where nothing buys means the entry lapsed, so the next entry may trade.
        runPurchaseTick(engine, false);
        expect(engine.tradingModeBlocksPurchase()).toBe(false);
        runPurchaseTick(engine, true);
        expect(engine.tradingModeBlocksPurchase()).toBe(false);
    });

    it('never blocks a purchase in continuous mode, lapsed entry or not', () => {
        const engine = createEngine('CONTINUOUS');
        runPurchaseTick(engine, true);
        engine.tradingModeTradeSettled();
        expect(engine.tradingModeBlocksPurchase()).toBe(false);
    });
});

describe('trading mode on a canvas with an observer entry gate', () => {
    it('starts a trade only once the observer signals an entry', () => {
        const engine = createEngine('SINGLE', { gate: true });

        expect(engine.tradingModeEntryAllowed()).toBe(false);
        observerRuntime.consumeEntry.mockReturnValueOnce(true);
        expect(engine.tradingModeEntryAllowed()).toBe(true);
    });

    it('waits for a new signal in single mode after a settled contract', () => {
        const engine = createEngine('SINGLE', { gate: true });
        observerRuntime.consumeEntry.mockReturnValueOnce(true);
        engine.tradingModeEntryAllowed();
        engine.tradingModeTradeSettled();

        expect(engine.tradingModeEntryAllowed()).toBe(false);
        observerRuntime.consumeEntry.mockReturnValueOnce(true);
        expect(engine.tradingModeEntryAllowed()).toBe(true);
    });

    it('keeps trading inside the confirmed entry after a win in continuous mode', () => {
        const engine = createEngine('CONTINUOUS', { gate: true, lastResult: 'win' });
        observerRuntime.consumeEntry.mockReturnValueOnce(true);
        engine.tradingModeEntryAllowed();
        engine.tradingModeTradeSettled();

        expect(engine.tradingModeEntryAllowed()).toBe(true);
        expect(engine.tradingModeEntryAllowed()).toBe(true);
    });

    it('awaits the next entry signal after a loss in continuous mode', () => {
        const engine = createEngine('CONTINUOUS', { gate: true, lastResult: 'loss' });
        observerRuntime.consumeEntry.mockReturnValueOnce(true);
        engine.tradingModeEntryAllowed();
        engine.tradingModeTradeSettled();

        expect(engine.tradingModeEntryAllowed()).toBe(false);
        observerRuntime.consumeEntry.mockReturnValueOnce(true);
        expect(engine.tradingModeEntryAllowed()).toBe(true);
    });
});
