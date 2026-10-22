/**
 * The session risk rules behind the new Risk Management blocks, tested in isolation.
 *
 * Every number is measured from contracts the session really settled: a losing streak only grows on
 * a recorded loss, give-back only counts profit that was actually reached, and stake sizing answers
 * 0 with a reason instead of inventing an amount when there is no balance to size from.
 */
import {
    createRiskLimits,
    createRiskState,
    giveBack,
    recordRiskEntry,
    recordRiskSettlement,
    riskBlockReasons,
    riskCanTrade,
    riskSummary,
    stakeForRisk,
} from '../risk-management';

describe('risk limits', () => {
    it('starts with every limit off and allows trading', () => {
        const state = createRiskState();
        expect(state.limits).toEqual({
            max_consecutive_losses: 0,
            max_give_back: 0,
            max_exposure: 0,
            risk_per_trade_percent: 0,
        });
        expect(riskCanTrade(state)).toBe(true);
        expect(riskBlockReasons(state)).toEqual([]);
    });

    it('treats unusable limits as not set and clamps a percentage to 100', () => {
        expect(
            createRiskLimits({
                max_consecutive_losses: -2,
                max_give_back: 'abc',
                max_exposure: null,
                risk_per_trade_percent: 250,
            })
        ).toEqual({
            max_consecutive_losses: 0,
            max_give_back: 0,
            max_exposure: 0,
            risk_per_trade_percent: 100,
        });
    });
});

describe('exposure', () => {
    it('exposes the stake a contract was bought for and releases it on settlement', () => {
        let state = createRiskState();
        state = recordRiskEntry(state, 12.5);
        expect(state.open_stake).toBe(12.5);

        state = recordRiskSettlement(state, { profit: 8, stake: 12.5 });
        expect(state.open_stake).toBe(0);
        expect(state.settled_stake).toBe(12.5);
    });

    it('never reports negative exposure when a settlement arrives without a recorded entry', () => {
        const state = recordRiskSettlement(createRiskState(), { profit: -1, stake: 5 });
        expect(state.open_stake).toBe(0);
    });

    it('ignores a stake of 0', () => {
        const state = createRiskState();
        expect(recordRiskEntry(state, 0)).toBe(state);
    });
});

describe('settled outcomes', () => {
    it('counts wins and losses from the settled profit, and zero profit is a loss', () => {
        let state = createRiskState();
        state = recordRiskSettlement(state, { profit: 2, stake: 1 });
        state = recordRiskSettlement(state, { profit: 0, stake: 1 });
        state = recordRiskSettlement(state, { profit: -1.5, stake: 1 });

        expect(state.trades).toBe(3);
        expect(state.wins).toBe(1);
        expect(state.losses).toBe(2);
        expect(state.session_profit).toBe(0.5);
    });

    it('grows the losing streak on losses and clears it on a win', () => {
        let state = createRiskState();
        state = recordRiskSettlement(state, { profit: -1, stake: 1 });
        state = recordRiskSettlement(state, { profit: -1, stake: 1 });
        expect(state.consecutive_losses).toBe(2);
        expect(state.consecutive_wins).toBe(0);

        state = recordRiskSettlement(state, { profit: 3, stake: 1 });
        state = recordRiskSettlement(state, { profit: 3, stake: 1 });
        expect(state.consecutive_losses).toBe(0);
        expect(state.consecutive_wins).toBe(2);
    });

    it('measures the profit given back from the session peak and never goes negative', () => {
        let state = createRiskState();
        expect(giveBack(state)).toBe(0);

        state = recordRiskSettlement(state, { profit: 10, stake: 1 });
        expect(state.peak_profit).toBe(10);
        expect(giveBack(state)).toBe(0);

        state = recordRiskSettlement(state, { profit: -4, stake: 1 });
        expect(giveBack(state)).toBe(4);

        state = recordRiskSettlement(state, { profit: 6, stake: 1 });
        expect(state.peak_profit).toBe(12);
        expect(giveBack(state)).toBe(0);
    });
});

describe('risk guard', () => {
    it('blocks after the configured losing streak and names the number that reached it', () => {
        let state = createRiskState({ max_consecutive_losses: 2 });
        state = recordRiskSettlement(state, { profit: -1, stake: 1 });
        expect(riskCanTrade(state)).toBe(true);

        state = recordRiskSettlement(state, { profit: -1, stake: 1 });
        expect(riskCanTrade(state)).toBe(false);
        expect(riskBlockReasons(state)[0]).toContain('2 consecutive loss(es)');
        expect(riskBlockReasons(state)[0]).toContain('limit of 2');
    });

    it('allows trading again once the streak is broken', () => {
        let state = createRiskState({ max_consecutive_losses: 1 });
        state = recordRiskSettlement(state, { profit: -1, stake: 1 });
        expect(riskCanTrade(state)).toBe(false);

        state = recordRiskSettlement(state, { profit: 2, stake: 1 });
        expect(riskCanTrade(state)).toBe(true);
    });

    it('blocks when the configured give-back is reached', () => {
        let state = createRiskState({ max_give_back: 5 });
        state = recordRiskSettlement(state, { profit: 10, stake: 1 });
        state = recordRiskSettlement(state, { profit: -4, stake: 1 });
        expect(riskCanTrade(state)).toBe(true);

        state = recordRiskSettlement(state, { profit: -2, stake: 1 });
        expect(riskCanTrade(state)).toBe(false);
        expect(riskBlockReasons(state)[0]).toContain('given back');
    });

    it('blocks while the open stake is at the exposure limit', () => {
        let state = createRiskState({ max_exposure: 10 });
        state = recordRiskEntry(state, 6);
        expect(riskCanTrade(state)).toBe(true);

        state = recordRiskEntry(state, 4);
        expect(riskCanTrade(state)).toBe(false);
        expect(riskBlockReasons(state)[0]).toContain('exposed');
    });
});

describe('stake sizing', () => {
    it('sizes a stake from the balance and the percentage, rounded to cents', () => {
        expect(stakeForRisk({ balance: 1000, percent: 1 })).toEqual({ stake: 10, reason: '' });
        expect(stakeForRisk({ balance: 1000, percent: 0.333 })).toEqual({ stake: 3.33, reason: '' });
    });

    it('answers 0 with a reason when it cannot be sized honestly', () => {
        expect(stakeForRisk({ balance: 0, percent: 1 }).stake).toBe(0);
        expect(stakeForRisk({ balance: 1000, percent: 1 }).reason).toBe('');
        expect(stakeForRisk({ balance: 0, percent: 1 }).reason).toContain('balance');
        expect(stakeForRisk({ balance: 1000, percent: 0 }).reason).toContain('percentage');
        expect(stakeForRisk({ balance: 1, percent: 0.01 }).stake).toBe(0);
    });

    it('clamps the stake to the exposure limit still available', () => {
        expect(stakeForRisk({ balance: 1000, percent: 5, max_exposure: 20, open_stake: 15 })).toEqual({
            stake: 5,
            reason: '',
        });
        expect(stakeForRisk({ balance: 1000, percent: 5, max_exposure: 20, open_stake: 20 }).stake).toBe(0);
        expect(stakeForRisk({ balance: 1000, percent: 5, max_exposure: 20, open_stake: 20 }).reason).toContain(
            'no room'
        );
    });
});

describe('session report', () => {
    it('states the measured numbers and whether the guard allows trading', () => {
        let state = createRiskState({ max_consecutive_losses: 1 });
        state = recordRiskEntry(state, 2);
        state = recordRiskSettlement(state, { profit: -2, stake: 2 });

        const report = riskSummary(state);
        expect(report).toContain('1 trade(s) settled');
        expect(report).toContain('0W/1L');
        expect(report).toContain('profit -2.00');
        expect(report).toContain('guard blocks new trades');
    });
});
