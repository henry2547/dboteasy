import {
    EVEN_ODD,
    OVER_UNDER,
    canTradeContract,
    contractNeedsBarrier,
    contractTradeOptions,
    familiesOfContractTypes,
    familyOfContractType,
    resolveBarrier,
} from '../contract-families';

describe('contract families', () => {
    it.each([
        ['DIGITOVER', OVER_UNDER],
        ['DIGITUNDER', OVER_UNDER],
        ['DIGITEVEN', EVEN_ODD],
        ['DIGITODD', EVEN_ODD],
        ['DIGITMATCH', 'matches_differs'],
        ['DIGITDIFF', 'matches_differs'],
    ])('maps %s to %s', (contract_type, family) => {
        expect(familyOfContractType(contract_type)).toBe(family);
    });

    it('leaves non-digit contracts without a family and keeps their barrier behaviour', () => {
        expect(familyOfContractType('CALL')).toBeNull();
        expect(contractNeedsBarrier('CALL')).toBe(true);
    });

    it('only Over/Under and Matches/Differs read a barrier', () => {
        expect(contractNeedsBarrier('DIGITOVER')).toBe(true);
        expect(contractNeedsBarrier('DIGITUNDER')).toBe(true);
        expect(contractNeedsBarrier('DIGITMATCH')).toBe(true);
        expect(contractNeedsBarrier('DIGITEVEN')).toBe(false);
        expect(contractNeedsBarrier('DIGITODD')).toBe(false);
    });

    it('reads the families a trade definition lists once', () => {
        expect(familiesOfContractTypes(['DIGITEVEN', 'DIGITODD'])).toEqual([EVEN_ODD]);
        expect(familiesOfContractTypes(undefined)).toEqual([]);
    });

    it('accepts only a whole digit as a barrier', () => {
        expect(resolveBarrier(1)).toBe(1);
        expect(resolveBarrier('8')).toBe(8);
        expect(resolveBarrier(10)).toBeNull();
        expect(resolveBarrier('')).toBeNull();
        expect(resolveBarrier(1.5)).toBeNull();
    });
});

describe('contract trade options', () => {
    const trade_options = { amount: 10, prediction: 1 };

    it('carries the explicit barrier of the contract that reads one', () => {
        const resolved = contractTradeOptions(trade_options, 'DIGITOVER', { barrier: 8 });
        expect(resolved.ok).toBe(true);
        expect(resolved.family).toBe(OVER_UNDER);
        expect(resolved.tradeOptions).toMatchObject({ amount: 10, prediction: 8 });
    });

    it('drops the definition barrier for an Even/Odd buy', () => {
        const resolved = contractTradeOptions(trade_options, 'DIGITEVEN');
        expect(resolved.ok).toBe(true);
        expect(resolved.tradeOptions.prediction).toBeUndefined();
        expect(trade_options.prediction).toBe(1);
    });

    it('refuses a barrier contract without a usable barrier', () => {
        const resolved = contractTradeOptions({ amount: 10 }, 'DIGITOVER', { barrier: 12 });
        expect(resolved.ok).toBe(false);
        expect(resolved.error).toContain('barrier digit');
    });

    it('refuses a contract that is not a digit contract', () => {
        expect(contractTradeOptions(trade_options, 'CALL').ok).toBe(false);
    });
});

describe('trade definition permission', () => {
    it('lets a both definition buy either family', () => {
        const definition = { trade_type: 'evenodd', contract_type: 'both' };
        expect(canTradeContract(definition, 'DIGITEVEN').ok).toBe(true);
        expect(canTradeContract(definition, 'DIGITOVER').ok).toBe(true);
    });

    it('keeps a definition pinned to one contract', () => {
        const definition = { trade_type: 'evenodd', contract_type: 'DIGITEVEN' };
        expect(canTradeContract(definition, 'DIGITEVEN').ok).toBe(true);
        expect(canTradeContract(definition, 'DIGITODD').ok).toBe(false);
    });

    it('refuses a trade definition that is not a digit definition', () => {
        const permitted = canTradeContract({ trade_type: 'callput', contract_type: 'both' }, 'DIGITOVER');
        expect(permitted.ok).toBe(false);
        expect(permitted.reason).toContain('callput');
    });
});
