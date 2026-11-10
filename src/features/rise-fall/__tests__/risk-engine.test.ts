import { DEFAULT_RISK, MIN_STAKE, evaluateRisk, sanitiseRiskConfig } from '../risk-engine';
import type { RiskContext } from '../types';

const clean: RiskContext = {
    sessionPnl: 0,
    sessionPeakPnl: 0,
    consecutiveLosses: 0,
    tradesTaken: 0,
    openContracts: 0,
    exposure: 0,
    lastLossAt: null,
    now: 1_700_000_000_000,
};

const config = { ...DEFAULT_RISK.virtual };

describe('evaluateRisk', () => {
    it('allows a clean entry and reports every check', () => {
        const decision = evaluateRisk(config, clean);

        expect(decision.allowed).toBe(true);
        expect(decision.reason).toBeNull();
        expect(decision.checks).toHaveLength(9);
    });

    it('rejects a stake above the configured maximum', () => {
        const decision = evaluateRisk({ ...config, stake: config.maxStake + 1 }, clean);

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('above');
    });

    it('rejects a stake below the market minimum', () => {
        const decision = evaluateRisk({ ...config, stake: MIN_STAKE / 2, maxStake: 10 }, clean);

        expect(decision.allowed).toBe(false);
        expect(decision.checks.find(check => check.id === 'min-stake')?.passed).toBe(false);
    });

    it('rejects an entry once the daily loss limit is reached', () => {
        const decision = evaluateRisk(config, { ...clean, sessionPnl: -config.maxDailyLoss });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('Daily loss');
    });

    it('rejects an entry at the consecutive-loss limit', () => {
        const decision = evaluateRisk(config, { ...clean, consecutiveLosses: config.maxConsecutiveLosses });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('consecutive losses');
    });

    it('rejects an entry at the session trade limit', () => {
        const decision = evaluateRisk(config, { ...clean, tradesTaken: config.maxTradesPerSession });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('session limit');
    });

    it('rejects a second simultaneous contract when only one is allowed', () => {
        const decision = evaluateRisk(config, { ...clean, openContracts: config.maxOpenContracts });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('open contract');
    });

    it('rejects an entry that would exceed the session exposure', () => {
        const decision = evaluateRisk(config, {
            ...clean,
            exposure: config.maxExposure - config.stake / 2,
        });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('Exposure');
    });

    it('rejects an entry past the session drawdown limit', () => {
        const decision = evaluateRisk(config, {
            ...clean,
            sessionPnl: -config.maxSessionDrawdown / 2,
            sessionPeakPnl: config.maxSessionDrawdown / 2,
        });

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('Drawdown');
    });

    it('enforces the cool-down after a loss and releases it afterwards', () => {
        const risk = { ...config, cooldownAfterLossMs: 30_000 };
        const cooling = evaluateRisk(risk, { ...clean, lastLossAt: clean.now - 5_000 });
        const released = evaluateRisk(risk, { ...clean, lastLossAt: clean.now - 45_000 });

        expect(cooling.allowed).toBe(false);
        expect(cooling.reason).toContain('Cooling down');
        expect(released.allowed).toBe(true);
    });

    it('has no Martingale: the stake is flat and never derived from a loss', () => {
        const afterLosses = evaluateRisk(config, { ...clean, sessionPnl: -8, consecutiveLosses: 2 });

        expect(afterLosses.allowed).toBe(true);
        expect(afterLosses.checks.find(check => check.id === 'stake')?.detail).toContain(String(config.stake));
    });
});

describe('sanitiseRiskConfig', () => {
    it('clamps a stake into the range the engine can honour', () => {
        const next = sanitiseRiskConfig({ stake: -5 }, config);
        expect(next.stake).toBe(MIN_STAKE);
    });

    it('keeps the fallback when a value is not a number', () => {
        const next = sanitiseRiskConfig({ maxTradesPerSession: Number.NaN }, config);
        expect(next.maxTradesPerSession).toBe(config.maxTradesPerSession);
    });

    it('caps a runaway cool-down', () => {
        const next = sanitiseRiskConfig({ cooldownAfterLossMs: 99_999_999 }, config);
        expect(next.cooldownAfterLossMs).toBe(3_600_000);
    });
});
