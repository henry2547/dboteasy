/**
 * The Risk Management runtime as the generated program sees it: the guard reads the session the
 * engine recorded and sizes stakes from the account balance, and the limits it sets are the ones
 * that decide. The mixin is exercised on its own — no socket, no login.
 */
import RiskManagement from '../../trade/RiskManagement';

const createEngine = () => {
    const Engine = RiskManagement(
        class {
            getBalance() {
                return 1000;
            }
        }
    );
    return new Engine();
};

describe('risk management runtime', () => {
    it('allows trading until a limit is set and breached', () => {
        const engine = createEngine();
        expect(engine.riskCanTrade()).toBe(true);
        expect(engine.riskBlockReason()).toBe('');

        engine.setRiskLimits({ max_consecutive_losses: 2 });
        engine.recordRiskSettlement({ profit: -1, stake: 1 });
        engine.recordRiskSettlement({ profit: -1, stake: 1 });

        expect(engine.riskCanTrade()).toBe(false);
        expect(engine.riskBlockReason()).toContain('2 consecutive loss(es)');
        expect(engine.riskReport()).toContain('guard blocks new trades');
    });

    it('tracks exposure from the stake the engine really paid', () => {
        const engine = createEngine();
        engine.recordRiskEntry(10);
        expect(engine.riskExposure()).toBe(10);

        engine.recordRiskSettlement({ profit: 5, stake: 10 });
        expect(engine.riskExposure()).toBe(0);
        expect(engine.riskGiveBack()).toBe(0);
    });

    it('sizes a stake from the balance and clamps it to the exposure limit', () => {
        const engine = createEngine();
        expect(engine.riskStake(2)).toBe(20);

        engine.setRiskLimits({ max_exposure: 25 });
        engine.recordRiskEntry(20);
        expect(engine.riskStake(2)).toBe(5);
    });

    it('falls back to the configured percentage when the block passes none', () => {
        const engine = createEngine();
        expect(engine.riskStake(0)).toBe(0);

        engine.setRiskLimits({ risk_per_trade_percent: 5 });
        expect(engine.riskStake(0)).toBe(50);
    });

    it('answers 0 for a stake when there is no balance to size from', () => {
        const Engine = RiskManagement(class {});
        const engine = new Engine();
        expect(engine.riskStake(1)).toBe(0);
    });

    it('resets the session numbers but keeps the limits', () => {
        const engine = createEngine();
        engine.setRiskLimits({ max_consecutive_losses: 3, max_give_back: 5 });
        engine.recordRiskEntry(10);
        engine.recordRiskSettlement({ profit: -4, stake: 10 });

        engine.resetRiskSession();

        expect(engine.riskExposure()).toBe(0);
        expect(engine.riskConsecutiveLosses()).toBe(0);
        expect(engine.riskStake(0)).toBe(0); // no percentage limit was set
        expect(engine.getRiskState().limits.max_consecutive_losses).toBe(3);
        expect(engine.getRiskState().limits.max_give_back).toBe(5);
    });
});
