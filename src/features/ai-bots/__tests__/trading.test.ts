/**
 * The AI bots' purchase rules: which contract a signal buys and how the setup
 * fields size and stop the session.
 */

import { contractTicks, nextStake, sessionStop, tradePlanFor } from '../trading';

describe('tradePlanFor', () => {
    it('buys the parity the Even-Odd bot confirmed', () => {
        expect(tradePlanFor('even_odd', 'Even')).toEqual({ contractType: 'DIGITEVEN', side: 'Even' });
        expect(tradePlanFor('even_odd', 'Odd')).toEqual({ contractType: 'DIGITODD', side: 'Odd' });
    });

    it('refuses a rise/fall side on the Even-Odd bot', () => {
        expect(tradePlanFor('even_odd', 'Rise')).toBeNull();
        expect(tradePlanFor('even_odd', 'Fall')).toBeNull();
    });

    it('buys the run the Rise-Fall bot confirmed the other way round', () => {
        expect(tradePlanFor('rise_fall', 'Rise')).toEqual({ contractType: 'CALL', side: 'Rise' });
        expect(tradePlanFor('rise_fall', 'Fall')).toEqual({ contractType: 'PUT', side: 'Fall' });
        expect(tradePlanFor('rise_fall', 'Even')).toBeNull();
    });
});

describe('nextStake', () => {
    it('starts at the base stake and resets after a win', () => {
        expect(nextStake(0.5, 2, 0)).toBe(0.5);
    });

    it('lifts the stake by the multiplier after each loss', () => {
        expect(nextStake(0.5, 2, 1)).toBe(1);
        expect(nextStake(0.5, 2, 3)).toBe(4);
        expect(nextStake(1, 2.1, 2)).toBe(4.41);
    });

    it('treats a multiplier of 1 or less as flat staking', () => {
        expect(nextStake(2, 1, 4)).toBe(2);
        expect(nextStake(2, 0, 4)).toBe(2);
    });

    it('never returns a negative stake', () => {
        expect(nextStake(-5, 2, 1)).toBe(0);
        expect(nextStake(Number.NaN, 2, 1)).toBe(0);
    });
});

describe('sessionStop', () => {
    it('has no stop while a limit is not set', () => {
        expect(sessionStop(100, { takeProfit: 0, stopLoss: 0 })).toBeNull();
    });

    it('reports the take profit when the settled profit reaches it', () => {
        expect(sessionStop(5, { takeProfit: 5, stopLoss: 30 })).toBe('take_profit');
    });

    it('reports the stop loss when the settled profit reaches it', () => {
        expect(sessionStop(-30, { takeProfit: 5, stopLoss: 30 })).toBe('stop_loss');
    });

    it('stays inside both limits in between', () => {
        expect(sessionStop(2, { takeProfit: 5, stopLoss: 30 })).toBeNull();
        expect(sessionStop(-29.99, { takeProfit: 5, stopLoss: 30 })).toBeNull();
    });
});

describe('contractTicks', () => {
    it('uses the setup ticks, at least one and at most ten', () => {
        expect(contractTicks(5)).toBe(5);
        expect(contractTicks(0)).toBe(1);
        expect(contractTicks(2.7)).toBe(2);
        expect(contractTicks(50)).toBe(10);
        expect(contractTicks(Number.NaN)).toBe(1);
    });
});
