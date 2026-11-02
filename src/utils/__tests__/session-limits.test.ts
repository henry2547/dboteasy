import { resolveSessionLimitHit } from '../session-limits';

describe('resolveSessionLimitHit', () => {
    it('reports a take profit once the run profit reaches it', () => {
        expect(resolveSessionLimitHit({ profit: 10, takeProfit: 10, stopLoss: 20 })).toEqual({
            kind: 'take_profit',
            amount: 10,
        });
        expect(resolveSessionLimitHit({ profit: 10.5, takeProfit: 10, stopLoss: 20 })?.kind).toBe('take_profit');
    });

    it('reports a stop loss once the run profit reaches the negative limit', () => {
        expect(resolveSessionLimitHit({ profit: -20, takeProfit: 10, stopLoss: 20 })).toEqual({
            kind: 'stop_loss',
            amount: 20,
        });
    });

    it('stays quiet between the two limits', () => {
        expect(resolveSessionLimitHit({ profit: 4.2, takeProfit: 10, stopLoss: 20 })).toBeNull();
        expect(resolveSessionLimitHit({ profit: -19.99, takeProfit: 10, stopLoss: 20 })).toBeNull();
    });

    it('treats a missing or zero limit as not set, so it never fires', () => {
        expect(resolveSessionLimitHit({ profit: 999, takeProfit: 0, stopLoss: 0 })).toBeNull();
        expect(resolveSessionLimitHit({ profit: -999, takeProfit: null, stopLoss: null })).toBeNull();
    });

    it('reports a reached take profit when both limits are crossed in the same run', () => {
        expect(resolveSessionLimitHit({ profit: 10, takeProfit: 10, stopLoss: 10 })?.kind).toBe('take_profit');
    });
});
