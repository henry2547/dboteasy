import { DEFAULT_CONFIG } from '../config';
import { emptySession, progressionLosses, riskVerdict, roundMoney, stakeFor, stakePreview, winRate } from '../risk';
import type { EngineConfig, SessionMetrics } from '../types';

const config: EngineConfig = { ...DEFAULT_CONFIG, initialStake: 1, multiplier: 2, maxStake: 8 };

function session(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
    return { ...emptySession(), ...overrides };
}

const baseRisk = {
    connectionOk: true,
    dataFresh: true,
    purchasePending: false,
    entriesAllowed: true,
    balance: 1000,
};

describe('staking policy', () => {
    it('applies the multiplier to primary losses only when scoped to primary', () => {
        const scoped = { ...config, multiplierScope: 'primary' as const };
        expect(stakeFor(scoped, 'primary', { primaryLosses: 2, recoveryLosses: 0 })).toBe(4);
        expect(stakeFor(scoped, 'recovery', { primaryLosses: 2, recoveryLosses: 2 })).toBe(1);
    });

    it('applies the multiplier to both legs when scoped to both', () => {
        expect(stakeFor(config, 'primary', { primaryLosses: 1, recoveryLosses: 0 })).toBe(2);
        expect(stakeFor(config, 'recovery', { primaryLosses: 0, recoveryLosses: 2 })).toBe(4);
    });

    it('never exceeds the maximum stake', () => {
        expect(stakeFor(config, 'primary', { primaryLosses: 10, recoveryLosses: 0 })).toBe(8);
    });

    it('stays flat with a multiplier of 1', () => {
        const flat = { ...config, multiplier: 1 };
        expect(stakeFor(flat, 'primary', { primaryLosses: 5, recoveryLosses: 0 })).toBe(1);
    });

    it('reports the next calculated stake and the remaining allowance', () => {
        const preview = stakePreview(config, { primaryLosses: 1, recoveryLosses: 0 }, 'primary');
        expect(preview.currentStake).toBe(2);
        expect(preview.nextStake).toBe(4);
        expect(preview.remainingRiskAllowance).toBe(6);
    });

    it('carries the same progression into the recovery leg', () => {
        // One primary loss, so the recovery trade that follows must already be
        // multiplied. Separate counters left it at the base stake.
        const counts = progressionLosses(session({ consecutiveLosses: 1 }));
        expect(counts).toEqual({ primaryLosses: 1, recoveryLosses: 1 });
        expect(stakeFor(config, 'primary', counts)).toBe(2);
        expect(stakeFor(config, 'recovery', counts)).toBe(2);
    });

    it('resets both legs after a win and counts a recovery loss once', () => {
        expect(progressionLosses(session({ consecutiveLosses: 0 }))).toEqual({ primaryLosses: 0, recoveryLosses: 0 });
        expect(stakeFor(config, 'recovery', progressionLosses(session({ consecutiveLosses: 2 })))).toBe(4);
    });
});

describe('risk gate', () => {
    it('allows a valid purchase', () => {
        const verdict = riskVerdict({ ...baseRisk, config, session: session(), kind: 'primary', stake: 1 });
        expect(verdict.allowed).toBe(true);
    });

    it('blocks on take profit', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config,
            session: session({ profit: config.takeProfit }),
            kind: 'primary',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('Take profit');
    });

    it('blocks on stop loss', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config,
            session: session({ profit: -config.stopLoss }),
            kind: 'primary',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('Stop loss');
    });

    it('blocks when the consecutive-loss limit is reached', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config,
            session: session({ consecutiveLosses: config.maxConsecutiveLosses }),
            kind: 'primary',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('consecutive losses');
    });

    it('blocks beyond the open-contract limit', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config,
            session: session({ openContracts: config.maxOpenContracts }),
            kind: 'primary',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
    });

    it('blocks a stake above the maximum stake', () => {
        const verdict = riskVerdict({ ...baseRisk, config, session: session(), kind: 'primary', stake: 99 });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('maximum stake');
    });

    it('blocks an insufficient balance', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config,
            session: session(),
            kind: 'primary',
            stake: 5,
            balance: 3,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('Insufficient balance');
    });

    it('blocks while a purchase is pending (duplicate protection)', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            purchasePending: true,
            config,
            session: session(),
            kind: 'primary',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('duplicate');
    });

    it('blocks without a live connection or fresh data', () => {
        expect(
            riskVerdict({ ...baseRisk, connectionOk: false, config, session: session(), kind: 'primary', stake: 1 }).allowed
        ).toBe(false);
        expect(
            riskVerdict({ ...baseRisk, dataFresh: false, config, session: session(), kind: 'primary', stake: 1 }).allowed
        ).toBe(false);
    });

    it('blocks when the engine is not accepting entries', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            entriesAllowed: false,
            haltReason: 'Engine paused.',
            config,
            session: session(),
            kind: 'primary',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toBe('Engine paused.');
    });

    it('blocks recovery once the recovery attempt limit is reached', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config,
            session: session({ recoveryAttempts: config.maxRecoveryTrades }),
            kind: 'recovery',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
    });

    it('blocks recovery when recovery trades are disabled', () => {
        const verdict = riskVerdict({
            ...baseRisk,
            config: { ...config, maxRecoveryTrades: 0 },
            session: session(),
            kind: 'recovery',
            stake: 1,
        });
        expect(verdict.allowed).toBe(false);
    });
});

describe('reporting helpers', () => {
    it('rounds money to two decimals', () => {
        expect(roundMoney(1.005)).toBe(1.01);
        expect(roundMoney(Number.NaN)).toBe(0);
    });

    it('computes a win rate only over settled trades', () => {
        expect(winRate(session({ wins: 3, losses: 1 }))).toBe(75);
        expect(winRate(session())).toBe(0);
    });
});
