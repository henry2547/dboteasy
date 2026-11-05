/**
 * The session-control runtime as the generated program sees it: the reads answer from trades the
 * engine really made, a stop request goes through the run panel's own Stop event, and waiting for a
 * settlement only resolves when the engine has really cleared its contract. No socket, no login.
 */
import { observer as globalObserver } from '../../../../utils/observer';
import SessionControl from '../../trade/SessionControl';
import { showSweetAlert } from '../../utils/sweet-alert';

jest.mock('../../utils/sweet-alert', () => ({ showSweetAlert: jest.fn() }));

const createStore = () => {
    let listeners = [];
    let state = { scope: 'DURING_PURCHASE' };

    return {
        subscribe: listener => {
            listeners.push(listener);
            return () => {
                listeners = listeners.filter(item => item !== listener);
            };
        },
        getState: () => state,
        dispatch: next => {
            state = { ...state, ...next };
            listeners.forEach(listener => listener());
        },
    };
};

const createEngine = () => {
    const Engine = SessionControl(
        class {
            constructor() {
                this.store = createStore();
            }
        }
    );
    return new Engine();
};

describe('session control runtime', () => {
    it('reports no result until a contract really settles', () => {
        const engine = createEngine();

        expect(engine.sessionLastResult()).toBe('');
        expect(engine.sessionTradesTaken()).toBe(0);

        engine.recordSessionEntry();
        expect(engine.sessionTradesTaken()).toBe(1);
        expect(engine.sessionLastResult()).toBe('');

        engine.recordSessionSettlement({ profit: -1, stake: 1 });
        expect(engine.sessionLastResult()).toBe('loss');
        expect(engine.sessionLastProfit()).toBe(-1);
        expect(engine.sessionProfit()).toBe(-1);
        expect(engine.sessionReport()).toContain('1 contract(s) taken');
    });

    it('reads the open contract from the engine instead of a second counter', () => {
        const engine = createEngine();

        expect(engine.sessionOpenContracts()).toBe(0);
        expect(engine.sessionHasOpenContract()).toBe(false);

        engine.contractId = '12345';
        expect(engine.sessionOpenContracts()).toBe(1);
        expect(engine.sessionHasOpenContract()).toBe(true);
        expect(engine.sessionReport()).toContain('1 open');
    });

    it('reaches the trade limit only when contracts were really taken', () => {
        const engine = createEngine();

        engine.sessionTradeLimitReached(1);
        expect(engine.sessionTradeLimitReached(1)).toBe(false);

        engine.recordSessionEntry();
        expect(engine.sessionTradeLimitReached(1)).toBe(true);
        expect(engine.sessionTradeLimitReached(0)).toBe(false);
    });

    it('stops once through the run panel stop event and keeps the reason', () => {
        const engine = createEngine();
        let stops = 0;
        const onStop = () => {
            stops += 1;
        };
        globalObserver.register('bot.stop_button_click', onStop);

        engine.stopBotWithReason('Target reached');
        engine.stopBotWithReason('Target reached');

        globalObserver.unregister('bot.stop_button_click', onStop);

        expect(stops).toBe(1);
        expect(engine.sessionSnapshot().stopped_reason).toBe('Target reached');
    });

    it('announces the stop with the sweet alert once the third check in a row fails', () => {
        const engine = createEngine();
        let stops = 0;
        const onStop = () => {
            stops += 1;
        };
        globalObserver.register('bot.stop_button_click', onStop);
        showSweetAlert.mockClear();

        engine.entryCheckFailed('digit 8 is no longer cold');
        engine.entryCheckFailed('digit 8 is no longer cold');
        expect(showSweetAlert).not.toHaveBeenCalled();
        expect(stops).toBe(0);

        engine.entryCheckFailed('digit 8 is no longer cold');
        globalObserver.unregister('bot.stop_button_click', onStop);

        expect(stops).toBe(1);
        expect(showSweetAlert).toHaveBeenCalledTimes(1);
        expect(showSweetAlert).toHaveBeenCalledWith(expect.objectContaining({ icon: 'warning', title: 'Bot stopped' }));
        // The popup carries the stop copy; the reason itself is pinned on the session snapshot below
        // (jest replaces localize with the un-interpolated template, so only the text is asserted).
        expect(showSweetAlert.mock.calls[0][0].message).toContain('Entry conditions are no longer valid');
        expect(engine.sessionSnapshot().stopped_reason).toContain('3 failed checks');
    });

    it('waits for the settlement the engine really recorded', async () => {
        const engine = createEngine();
        engine.contractId = '12345';

        const settled = engine.waitForSessionSettlement();
        engine.contractId = '';
        engine.store.dispatch({ scope: 'STOP' });

        await expect(settled).resolves.toBe(true);
    });

    it('does not wait when no contract is open', async () => {
        const engine = createEngine();
        await expect(engine.waitForSessionSettlement()).resolves.toBe(false);
    });

    it('starts a fresh session but keeps answering safely after a reset', () => {
        const engine = createEngine();
        engine.recordSessionEntry();
        engine.recordSessionSettlement({ profit: 1, stake: 1 });

        engine.resetSessionControl();

        expect(engine.sessionTradesTaken()).toBe(0);
        expect(engine.sessionProfit()).toBe(0);
        expect(engine.sessionLastResult()).toBe('');
        expect(engine.sessionReport()).toContain('no contracts taken yet');
    });
});
