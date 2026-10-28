import ContractFamily from '../../trade/ContractFamily';
import { tradeOptionToBuy, tradeOptionToProposal } from '../helpers';
import { OVER_UNDER } from '../contract-families';

jest.mock('../../../../utils/observer', () => ({
    observer: { register: jest.fn(), emit: jest.fn() },
}));

const createEngine = () => {
    const Engine = ContractFamily(class {});
    const engine = new Engine();
    engine.tradeOptions = { amount: 10, prediction: 1, contractTypes: ['DIGITEVEN', 'DIGITODD'] };
    engine.options = { contractTypes: ['DIGITEVEN', 'DIGITODD'] };
    return engine;
};

describe('engine contract family switching', () => {
    it('reports the family the trade definition names before the first buy', () => {
        expect(createEngine().getContractFamily()).toBe('even_odd');
    });

    it('builds the Over/Under leg with its own barrier', () => {
        const engine = createEngine();
        const resolved = engine.resolveContractTradeOptions('DIGITOVER', { barrier: 1 });
        expect(resolved.ok).toBe(true);
        expect(resolved.family).toBe(OVER_UNDER);
        expect(resolved.tradeOptions.prediction).toBe(1);
    });

    it('builds the Even/Odd leg without the definition barrier', () => {
        const engine = createEngine();
        const resolved = engine.resolveContractTradeOptions('DIGITEVEN');
        expect(resolved.ok).toBe(true);
        expect(resolved.tradeOptions.prediction).toBeUndefined();
    });

    it('leaves every non-digit contract on the definition trade options', () => {
        const engine = createEngine();
        const resolved = engine.resolveContractTradeOptions('CALL');
        expect(resolved.ok).toBe(true);
        expect(resolved.family).toBeNull();
        expect(resolved.tradeOptions).toBe(engine.tradeOptions);
    });

    it('remembers the family a buy used', () => {
        const engine = createEngine();
        engine.recordContractFamily(OVER_UNDER);
        expect(engine.getContractFamily()).toBe(OVER_UNDER);
    });
});

describe('contract request builders', () => {
    const trade_options = { amount: 10, currency: 'USD', duration: 1, duration_unit: 't', symbol: 'R_100' };
    const with_definitions = { ...trade_options, prediction: 1, contractTypes: ['DIGITEVEN', 'DIGITODD'] };

    it('never sends an Even/Odd buy the Over/Under barrier', () => {
        const buy = tradeOptionToBuy('DIGITEVEN', with_definitions);
        expect(buy.parameters.barrier).toBeUndefined();
        expect(buy.parameters.selected_tick).toBeUndefined();
    });

    it('keeps the barrier on an Over/Under buy', () => {
        const buy = tradeOptionToBuy('DIGITOVER', with_definitions);
        expect(buy.parameters.barrier).toBe(1);
    });

    it('matches the proposal the same way', () => {
        const proposals = tradeOptionToProposal(with_definitions, 'ref');
        const even = proposals.find(proposal => proposal.contract_type === 'DIGITEVEN');
        expect(even.barrier).toBeUndefined();
        expect(even.selected_tick).toBeUndefined();
    });
});
