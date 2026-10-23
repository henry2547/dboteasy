import EvenOdd from '../../trade/EvenOdd';
import { api_base } from '../../../api/api-base';
import { BEFORE_PURCHASE } from '../../trade/state/constants';

jest.mock('../../../../utils/observer', () => ({
    observer: { register: jest.fn(), emit: jest.fn() },
}));
jest.mock('../../../api/api-base', () => ({
    api_base: { api: { connection: { readyState: 1 } }, is_running: true, is_stopping: false },
}));

const createEngine = digits => {
    const Engine = EvenOdd(class {});
    const engine = new Engine();
    engine.symbol = 'R_100';
    engine.tradeOptions = { amount: 1 };
    engine.store = { getState: () => ({ scope: BEFORE_PURCHASE }) };
    engine.purchase = jest.fn(async () => { engine.contractId = 'test-contract'; });
    engine.eoConfigure({ ticks: digits.length, percent: 65, direction: 'both' });
    engine.eoMonitor(digits.length);
    digits.forEach((digit, index) => engine.eoFeedTick({ digit, epoch: index + 1, symbol: 'R_100' }));
    return engine;
};

describe('Even/Odd engine entries', () => {
    it('refuses a complete window without a qualifying signal', async () => {
        const engine = createEngine([2, 3]);
        await expect(engine.eoBuyEven()).resolves.toBe(false);
        expect(engine.purchase).not.toHaveBeenCalled();
    });

    it.each([['even', [2, 4], 'DIGITEVEN'], ['odd', [1, 3], 'DIGITODD']])(
        'routes a qualifying %s entry through the existing purchase path',
        async (parity, digits, contract) => {
            const engine = createEngine(digits);
            engine.eoAllowOneEntry();
            await expect(engine.eoBuy(parity)).resolves.toBe(true);
            expect(engine.purchase).toHaveBeenCalledWith(contract);
            engine.contractId = null;
            await expect(engine.eoBuy(parity)).resolves.toBe(false);
            expect(engine.purchase).toHaveBeenCalledTimes(1);
        }
    );

    it('refuses the opposite parity and breached risk limits', async () => {
        const engine = createEngine([2, 4]);
        await expect(engine.eoBuyOdd()).resolves.toBe(false);
        engine.riskCanTrade = () => false;
        await expect(engine.eoBuyEven()).resolves.toBe(false);
        expect(engine.purchase).not.toHaveBeenCalled();
    });

    it('does not mark an unconfirmed purchase as a used signal', async () => {
        const engine = createEngine([2, 4]);
        engine.eoAllowOneEntry();
        engine.purchase.mockImplementation(async () => {});
        await expect(engine.eoBuyEven()).resolves.toBe(false);
        expect(engine.eoEntryAllowed()).toBe(true);
    });

    it('refuses entries while disconnected', async () => {
        const engine = createEngine([2, 4]);
        api_base.api.connection.readyState = 3;
        try {
            await expect(engine.eoBuyEven()).resolves.toBe(false);
            expect(engine.purchase).not.toHaveBeenCalled();
        } finally {
            api_base.api.connection.readyState = 1;
        }
    });

    it('releases tick waits on a genuine tick or session stop', async () => {
        const engine = createEngine([2, 4]);
        const next = engine.eoWaitTick();
        engine.eoFeedTick({ digit: 6, epoch: 3, symbol: 'R_100' });
        await expect(next).resolves.toBe(true);
        const stopped = engine.eoWaitTick();
        engine.releaseEvenOddWaiters();
        await expect(stopped).resolves.toBe(false);
    });
});
