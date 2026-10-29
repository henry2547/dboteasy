/**
 * A digit bot that trades Over 1 / Under 8 and then Even/Odd after a loss subscribes proposals for
 * both families in one session. Over/Under proposals carry the last-digit prediction as the barrier;
 * Even/Odd proposals must carry neither, or the request comes back invalid and the parity leg never
 * trades. These tests pin both halves of that.
 */
jest.mock('../broadcast', () => ({ error: jest.fn(), info: jest.fn(), log: jest.fn(), contractStatus: jest.fn() }));

const trade_option = {
    amount: 1,
    basis: 'stake',
    currency: 'USD',
    symbol: 'R_100',
    duration: 5,
    duration_unit: 't',
    prediction: 1,
    contractTypes: ['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'],
};

describe('digit proposals and purchases', () => {
    const { tradeOptionToProposal, tradeOptionToBuy } = require('../helpers');

    it('subscribes one proposal per digit contract the bot can buy', () => {
        const proposals = tradeOptionToProposal(trade_option, 'ref');

        expect(proposals.map(proposal => proposal.contract_type)).toEqual([
            'DIGITOVER',
            'DIGITUNDER',
            'DIGITEVEN',
            'DIGITODD',
        ]);
    });

    it('sends the Over/Under barrier and never one for the parity contracts', () => {
        const by_type = Object.fromEntries(
            tradeOptionToProposal(trade_option, 'ref').map(proposal => [proposal.contract_type, proposal])
        );

        expect(by_type.DIGITOVER.barrier).toBe(1);
        expect(by_type.DIGITOVER.selected_tick).toBe(1);
        expect(by_type.DIGITODD.barrier).toBeUndefined();
        expect(by_type.DIGITODD.selected_tick).toBeUndefined();
        expect(by_type.DIGITEVEN.barrier).toBeUndefined();
        expect(by_type.DIGITEVEN.selected_tick).toBeUndefined();
    });

    it('buys a parity contract without a barrier and an Over contract with one', () => {
        expect(tradeOptionToBuy('DIGITODD', trade_option).parameters).toEqual(
            expect.objectContaining({ contract_type: 'DIGITODD', amount: 1 })
        );
        expect(tradeOptionToBuy('DIGITODD', trade_option).parameters.barrier).toBeUndefined();
        expect(tradeOptionToBuy('DIGITODD', trade_option).parameters.selected_tick).toBeUndefined();
        expect(tradeOptionToBuy('DIGITOVER', trade_option).parameters.barrier).toBe(1);
    });
});

describe('digit parity run at run time', () => {
    const Ticks = require('../../trade/Ticks').default;

    const engineWith = digits => {
        const engine = Object.create(Ticks(class {}).prototype);
        engine.getLastDigitList = () => Promise.resolve(digits);
        return engine;
    };

    it('arms on two even digits and on two odd digits', async () => {
        await expect(engineWith([5, 2, 4]).isDigitParityRun('even', 2)).resolves.toBe(true);
        await expect(engineWith([5, 2, 4]).isDigitParityRun('odd', 2)).resolves.toBe(false);
        await expect(engineWith([6, 3, 7]).isDigitParityRun('odd', 2)).resolves.toBe(true);
        // Only the newest `count` digits matter: an older opposite digit does not break the pair.
        await expect(engineWith([1, 8, 6]).isDigitParityRun('even', 2)).resolves.toBe(true);
    });

    it('stays false until there are enough digits for the run', async () => {
        await expect(engineWith([2]).isDigitParityRun('even', 2)).resolves.toBe(false);
    });
});
