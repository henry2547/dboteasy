/**
 * The authenticated Deriv side of the Rise/Fall engine.
 *
 * Demo and Real entries go through Deriv's documented workflow — `proposal`,
 * then `buy`, then `proposal_open_contract` until the contract settles — over the
 * app's existing authenticated socket (`features/ai-bot/auth-ws`). Nothing here
 * invents a contract id, a quote or a settlement: every number reported to the
 * executor came back from Deriv.
 *
 * The broker never retries a purchase. A `buy` that times out is reported as an
 * UNKNOWN outcome so the executor halts the mode instead of buying twice.
 */

import { AuthTradingWebSocket, type AuthMessage, type AuthWsStatus } from '@/features/ai-bot/auth-ws';
import type { BrokerBuyResult, BrokerTicket, LiveContractUpdate, RiseFallBroker } from './types';

const PROPOSAL_TIMEOUT_MS = 10_000;
const BUY_TIMEOUT_MS = 10_000;

/** Deriv's own words for the last error, without echoing anything sensitive. */
function describeError(payload: Record<string, any> | undefined): string {
    if (!payload?.error) return 'Deriv rejected the request.';
    const message = String(payload.error.message ?? payload.error.code ?? 'Deriv rejected the request.');
    const code = String(payload.error.code ?? '');
    return code && !message.includes(code) ? `${message} (${code})` : message;
}

export interface LiveAccount {
    loginId: string;
    currency: string;
    balance: number;
    isVirtual: boolean;
    authorized: boolean;
}

/** Reads the connected account's own facts out of the auth status stream. */
export function accountFromStatus(status: AuthWsStatus): LiveAccount | null {
    if (!status.authorized || !status.loginid || !status.currency) return null;
    return {
        loginId: status.loginid,
        currency: status.currency,
        balance: Number(status.balance ?? 0),
        isVirtual: status.isVirtual,
        authorized: status.authorized,
    };
}

export class DerivRiseFallBroker implements RiseFallBroker {
    private readonly offMessage: () => void;
    /** contract id → the subscription id Deriv gave for it. */
    private readonly subscriptions = new Map<string, string>();
    private busy = false;

    constructor(
        private readonly client: AuthTradingWebSocket,
        private readonly onUpdate: (update: LiveContractUpdate) => void
    ) {
        this.offMessage = this.client.onMessage(message => this.handleMessage(message));
    }

    destroy(): void {
        this.subscriptions.forEach((subscriptionId, contractId) => {
            this.client.send({ forget: subscriptionId });
            this.subscriptions.delete(contractId);
        });
        this.offMessage();
    }

    async buy(ticket: BrokerTicket): Promise<BrokerBuyResult> {
        if (this.busy) {
            return { ok: false, contractId: null, payout: null, reason: 'Another purchase is already in flight.', unknown: false };
        }
        this.busy = true;

        try {
            const proposalResponse = await this.client.sendAndWait(
                {
                    proposal: 1,
                    amount: ticket.stake,
                    basis: 'stake',
                    contract_type: ticket.contractType,
                    currency: ticket.currency,
                    duration: ticket.durationTicks,
                    duration_unit: 't',
                    symbol: ticket.symbol,
                },
                PROPOSAL_TIMEOUT_MS
            );

            const proposalPayload = proposalResponse as Record<string, any>;
            if (proposalPayload.error) {
                return {
                    ok: false,
                    contractId: null,
                    payout: null,
                    reason: describeError(proposalPayload),
                    unknown: false,
                };
            }

            const proposal = proposalPayload.proposal;
            const proposalId = proposal?.id;
            const askPrice = Number(proposal?.ask_price);
            if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0) {
                return {
                    ok: false,
                    contractId: null,
                    payout: null,
                    reason: 'Deriv returned an unusable proposal — nothing was bought.',
                    unknown: false,
                };
            }

            let buyResponse: AuthMessage;
            try {
                buyResponse = await this.client.sendAndWait({ buy: proposalId, price: askPrice }, BUY_TIMEOUT_MS);
            } catch (error) {
                return {
                    ok: false,
                    contractId: null,
                    payout: null,
                    reason: `The buy request timed out (${(error as Error).message}).`,
                    unknown: true,
                };
            }

            const buyPayload = buyResponse as Record<string, any>;
            if (buyPayload.error) {
                return {
                    ok: false,
                    contractId: null,
                    payout: null,
                    reason: describeError(buyPayload),
                    unknown: false,
                };
            }

            const contractId = buyPayload.buy?.contract_id;
            if (contractId === undefined || contractId === null) {
                return {
                    ok: false,
                    contractId: null,
                    payout: null,
                    reason: 'Deriv accepted the request but returned no contract id — treating the outcome as unknown.',
                    unknown: true,
                };
            }

            const payout = Number(buyPayload.buy?.payout);
            this.subscribeToContract(String(contractId));

            return {
                ok: true,
                contractId: String(contractId),
                payout: Number.isFinite(payout) ? payout : null,
                reason: null,
                unknown: false,
            };
        } finally {
            this.busy = false;
        }
    }

    private subscribeToContract(contractId: string): void {
        const reqId = this.client.send({ proposal_open_contract: 1, contract_id: Number(contractId), subscribe: 1 });
        // The subscription id arrives on the first update; remember the request
        // so a `forget` can still be sent if the contract settles immediately.
        this.subscriptions.set(contractId, String(reqId));
    }

    private handleMessage(message: AuthMessage): void {
        const payload = message as Record<string, any>;
        if (payload.msg_type !== 'proposal_open_contract') return;
        const contract = payload.proposal_open_contract;
        if (!contract) return;

        const contractId = String(contract.contract_id ?? '');
        if (!contractId) return;

        const subscriptionId = payload.subscription?.id;
        if (subscriptionId) this.subscriptions.set(contractId, String(subscriptionId));

        const isSold = Boolean(contract.is_sold);
        const profit = Number(contract.profit);
        const entryQuote = Number(contract.entry_spot);
        const exitQuote = Number(contract.sell_spot ?? contract.current_spot);
        const exitEpoch = Number(contract.exit_tick_time ?? contract.current_spot_time);

        const status = isSold
            ? // A flat contract is a loss: the engine never requests allow-equals.
              (Number.isFinite(profit) ? profit > 0 : exitQuote > entryQuote) && !(exitQuote === entryQuote)
                ? 'won'
                : 'lost'
            : 'open';

        this.onUpdate({
            contractId,
            status,
            profit: Number.isFinite(profit) ? profit : null,
            exitQuote: Number.isFinite(exitQuote) && exitQuote > 0 ? exitQuote : null,
            exitEpoch: Number.isFinite(exitEpoch) && exitEpoch > 0 ? exitEpoch : null,
            balance: null,
        });

        if (isSold) {
            const subscription = this.subscriptions.get(contractId);
            if (subscription) {
                this.client.send({ forget: subscription });
                this.subscriptions.delete(contractId);
            }
        }
    }
}

export function createDerivRiseFallBroker(
    client: AuthTradingWebSocket,
    onUpdate: (update: LiveContractUpdate) => void
): DerivRiseFallBroker {
    return new DerivRiseFallBroker(client, onUpdate);
}
