/**
 * The proposal/buy payloads and the reason a failed request reports.
 *
 * A purchase only ever happens through `requestProposal` → `purchaseContract`, so
 * the request shape (the options API names the market `underlying_symbol`) and the
 * surfaced Deriv error are what the engine's journal shows the user.
 */

import { purchaseContract, requestProposal, TradeExecutionError } from '../deriv-execution';

const send = jest.fn();

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        get api() {
            return { send: (...args: unknown[]) => send(...args) };
        },
        is_authorized: true,
    },
}));

const proposalResponse = {
    msg_type: 'proposal',
    proposal: {
        id: 'prop-1',
        ask_price: 0.35,
        payout: 0.66,
        spot: 1234.56,
        longcode: 'Win payout if the last digit is over 2',
        date_start: 1760000000,
    },
};

describe('requestProposal', () => {
    beforeEach(() => send.mockReset());

    it('sends the market as underlying_symbol with a string barrier', async () => {
        send.mockResolvedValue(proposalResponse);

        const result = await requestProposal({
            symbol: 'R_100',
            contractType: 'DIGITOVER',
            stake: 0.35,
            barrier: 2,
            currency: 'USD',
            duration: 1,
            durationUnit: 't',
        });

        expect(send).toHaveBeenCalledWith({
            proposal: 1,
            amount: 0.35,
            basis: 'stake',
            contract_type: 'DIGITOVER',
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            underlying_symbol: 'R_100',
            barrier: '2',
        });
        expect(send.mock.calls[0][0]).not.toHaveProperty('symbol');
        expect(result).toMatchObject({ id: 'prop-1', askPrice: 0.35, payout: 0.66 });
    });

    it('omits the barrier for an Even/Odd contract', async () => {
        send.mockResolvedValue(proposalResponse);

        await requestProposal({
            symbol: 'R_100',
            contractType: 'DIGITEVEN',
            stake: 0.35,
            currency: 'USD',
            duration: 1,
            durationUnit: 't',
        });

        expect(send.mock.calls[0][0]).not.toHaveProperty('barrier');
    });

    it('reports the Deriv reason from a resolved error response', async () => {
        send.mockResolvedValue({ msg_type: 'proposal', error: { code: 'ContractBuyValidationError', message: 'Stake is too low.' } });

        await expect(
            requestProposal({
                symbol: 'R_100',
                contractType: 'DIGITOVER',
                stake: 0.01,
                barrier: 2,
                currency: 'USD',
                duration: 1,
                durationUnit: 't',
            })
        ).rejects.toMatchObject({ message: 'Stake is too low.', code: 'ContractBuyValidationError' });
    });

    it('reports the Deriv reason from a rejected message', async () => {
        send.mockRejectedValue({ error: { code: 'InputValidationFailed', message: 'Symbol is not allowed.' } });

        const failure = (await requestProposal({
            symbol: 'R_100',
            contractType: 'DIGITOVER',
            stake: 0.35,
            barrier: 2,
            currency: 'USD',
            duration: 1,
            durationUnit: 't',
        }).catch(error => error)) as TradeExecutionError;

        expect(failure).toBeInstanceOf(TradeExecutionError);
        expect(failure.message).toBe('Symbol is not allowed.');
        expect(failure.code).toBe('InputValidationFailed');
    });

    it('refuses to trade without an authorized socket', async () => {
        const { api_base } = jest.requireMock('@/external/bot-skeleton') as { api_base: { is_authorized: boolean } };
        api_base.is_authorized = false;

        await expect(
            requestProposal({
                symbol: 'R_100',
                contractType: 'DIGITEVEN',
                stake: 0.35,
                currency: 'USD',
                duration: 1,
                durationUnit: 't',
            })
        ).rejects.toMatchObject({ code: 'Unauthorized' });

        api_base.is_authorized = true;
    });
});

describe('purchaseContract', () => {
    beforeEach(() => send.mockReset());

    it('buys the proposal id at the quoted ask price', async () => {
        send.mockResolvedValue({
            msg_type: 'buy',
            buy: {
                contract_id: 98765,
                transaction_id: 4321,
                buy_price: 0.35,
                payout: 0.66,
                balance_after: 9.65,
                start_time: 1760000000,
            },
        });

        const bought = await purchaseContract({
            id: 'prop-1',
            askPrice: 0.35,
            payout: 0.66,
            spot: null,
            longcode: null,
            dateStart: null,
            raw: {},
        });

        expect(send).toHaveBeenCalledWith({ buy: 'prop-1', price: 0.35 });
        expect(bought).toMatchObject({ contractId: 98765, transactionId: 4321, buyPrice: 0.35, balanceAfter: 9.65 });
    });

    it('surfaces the Deriv reason when the buy is refused', async () => {
        send.mockRejectedValue({ error: { code: 'PriceMoved', message: 'The price has moved.' } });

        await expect(
            purchaseContract({
                id: 'prop-1',
                askPrice: 0.35,
                payout: 0.66,
                spot: null,
                longcode: null,
                dateStart: null,
                raw: {},
            })
        ).rejects.toMatchObject({ message: 'The price has moved.', code: 'PriceMoved' });
    });
});
