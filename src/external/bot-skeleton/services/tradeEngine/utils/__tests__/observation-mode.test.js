import Purchase from '../../trade/Purchase';
import EvenOdd from '../../trade/EvenOdd';
import { api_base } from '../../../api/api-base';
import { BEFORE_PURCHASE } from '../../trade/state/constants';
import { isObservationMode, loadObservationMode, setObservationMode } from '../../../observation-mode';

jest.mock('../../../../utils/observer', () => ({
    observer: { register: jest.fn(), emit: jest.fn() },
}));
jest.mock('../../../api/api-base', () => ({
    api_base: { api: { send: jest.fn(), connection: { readyState: 1 } }, is_running: true, is_stopping: false },
}));

const createPurchaseEngine = () => {
    const Engine = Purchase(class {});
    const engine = new Engine();
    engine.store = { getState: () => ({ scope: BEFORE_PURCHASE }) };
    engine.tradeOptions = { amount: 1 };
    return engine;
};

const createEvenOddEngine = digits => {
    const Engine = EvenOdd(class {});
    const engine = new Engine();
    engine.symbol = 'R_100';
    engine.tradeOptions = { amount: 1 };
    engine.store = { getState: () => ({ scope: BEFORE_PURCHASE }) };
    engine.purchase = jest.fn();
    engine.eoConfigure({ ticks: digits.length, percent: 65, direction: 'both' });
    engine.eoMonitor(digits.length);
    digits.forEach((digit, index) => engine.eoFeedTick({ digit, epoch: index + 1, symbol: 'R_100' }));
    return engine;
};

describe('observation mode', () => {
    afterEach(() => setObservationMode(false));

    it('is off until it is turned on, and remembers the choice', () => {
        expect(loadObservationMode()).toBe(false);
        expect(isObservationMode()).toBe(false);

        setObservationMode(true);
        expect(isObservationMode()).toBe(true);
        expect(loadObservationMode()).toBe(true);

        setObservationMode(false);
        expect(isObservationMode()).toBe(false);
    });

    it('records an entry without sending a buy', async () => {
        const engine = createPurchaseEngine();
        setObservationMode(true);

        await expect(engine.purchase('DIGITEVEN')).resolves.toBeUndefined();

        expect(api_base.api.send).not.toHaveBeenCalled();
        expect(engine.contractId).toBeUndefined();
    });

    it('routes an Even/Odd signal to the journal instead of the purchase path', async () => {
        const engine = createEvenOddEngine([2, 4]);
        setObservationMode(true);

        engine.eoAllowOneEntry();
        await expect(engine.eoBuyEven()).resolves.toBe(false);

        expect(engine.purchase).not.toHaveBeenCalled();
        // The signal still counts as used, so the same ticks never journal it twice.
        expect(engine.eoEntryAllowed()).toBe(false);
    });

    it('journals a reversed digit run without buying the opposite parity', async () => {
        const engine = createEvenOddEngine([2, 4]);
        setObservationMode(true);

        await expect(engine.eoJournalReverse(2)).resolves.toBe(false);
        // The same reversed run never journals a second entry.
        await expect(engine.eoJournalReverse(2)).resolves.toBe(false);

        expect(engine.purchase).not.toHaveBeenCalled();
    });
});
