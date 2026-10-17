/**
 * Order Execution Service — the documented Deriv workflow for authenticated
 * trading operations.
 *
 * Workflow:
 * 1. Obtain a valid price proposal (proposal request).
 * 2. Verify the returned quote and contract parameters.
 * 3. Submit a purchase only when all conditions and risk checks pass.
 * 4. Monitor the open contract via proposal_open_contract until settled.
 *
 * This service never fabricates proposal identifiers, contract IDs, quotes, or
 * execution confirmations. It handles rejected orders, stale quotes, network
 * errors, duplicate requests, and ambiguous responses safely.
 */

import type { AuthMessage } from './auth-ws';
import type { ExecutionResult, OpenContractInfo, ProposalInfo, StrategySignal, TradingSettings } from './types';
import { proposalParamsFromSignal } from './strategy-engine';

export interface ExecutionCallbacks {
    onProposal: (info: ProposalInfo | null, error: string | null) => void;
    onBuy: (result: { contractId: number; buyPrice: number; payout: number; longcode: string } | null, error: string | null) => void;
    onContractUpdate: (contract: OpenContractInfo) => void;
    onSettled: (result: ExecutionResult) => void;
    onError: (message: string) => void;
}

const PROPOSAL_TIMEOUT_MS = 10000;
const BUY_TIMEOUT_MS = 10000;
const MAX_QUOTE_AGE_S = 5;

export class ExecutionEngine {
    private activeProposalId: string | null = null;
    private activeContractId: number | null = null;
    private openContractSubscriptionId: string | null = null;
    private isExecuting = false;
    private offMessage: (() => void) | null = null;
    private callbacks: ExecutionCallbacks | null = null;

    constructor(
        private sendFn: (msg: Record<string, unknown>) => number,
        private sendAndWaitFn: (msg: Record<string, unknown>, timeoutMs?: number) => Promise<AuthMessage>,
        private subscribeFn: (handler: (msg: AuthMessage) => void) => () => void,
        private settingsRef: () => TradingSettings
    ) {
        this.offMessage = this.subscribeFn(this.handleMessage.bind(this));
    }

    destroy(): void {
        this.cancelProposal();
        if (this.openContractSubscriptionId) {
            this.sendFn({ forget: this.openContractSubscriptionId });
            this.openContractSubscriptionId = null;
        }
        if (this.offMessage) this.offMessage();
        this.offMessage = null;
    }

    get isBusy(): boolean {
        return this.isExecuting;
    }

    get openContractId(): number | null {
        return this.activeContractId;
    }

    /**
     * Execute the full workflow: proposal → verify → buy → monitor.
     * The contract is monitored via the message handler; onSettled fires
     * when proposal_open_contract reports is_sold.
     */
    async execute(signal: StrategySignal, currency: string, callbacks: ExecutionCallbacks): Promise<void> {
        if (this.isExecuting) {
            callbacks.onError('Another trade is already in progress');
            return;
        }

        this.callbacks = callbacks;
        this.isExecuting = true;
        const settings = this.settingsRef();

        try {
            // 1. Obtain a price proposal.
            const proposal = await this.requestProposal(signal, currency, callbacks);
            if (!proposal) return;

            // 2. Verify the quote is fresh and valid.
            if (!this.verifyProposal(proposal, settings, callbacks)) return;

            // 3. Submit the purchase.
            const buyResult = await this.buyContract(proposal, callbacks);
            if (!buyResult) return;

            // 4. Subscribe to contract updates and monitor until settled.
            this.activeContractId = buyResult.contractId;
            this.subscribeOpenContract(buyResult.contractId);
        } catch (error) {
            callbacks.onError(`Execution error: ${(error as Error).message}`);
        } finally {
            this.isExecuting = false;
        }
    }

    /** Cancel any in-flight proposal (forget the proposal subscription). */
    cancelProposal(): void {
        if (this.activeProposalId) {
            this.sendFn({ forget: this.activeProposalId });
            this.activeProposalId = null;
        }
    }

    /** Subscribe to proposal_open_contract updates for the purchased contract. */
    private subscribeOpenContract(contractId: number): void {
        this.sendFn({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private async requestProposal(
        signal: StrategySignal,
        currency: string,
        callbacks: ExecutionCallbacks
    ): Promise<ProposalInfo | null> {
        const settings = this.settingsRef();
        const params = proposalParamsFromSignal(signal, settings, currency);
        try {
            const response = await this.sendAndWaitFn(params, PROPOSAL_TIMEOUT_MS);
            const payload = response as Record<string, any>;

            if (payload.error) {
                const msg = String(payload.error.message ?? 'Proposal rejected');
                callbacks.onProposal(null, msg);
                callbacks.onError(`Proposal rejected: ${msg}`);
                return null;
            }

            const proposal = payload.proposal;
            if (!proposal || !proposal.id) {
                callbacks.onProposal(null, 'Invalid proposal response');
                callbacks.onError('Invalid proposal response — no proposal id');
                return null;
            }

            this.activeProposalId = proposal.subscription?.id ?? proposal.id;

            const info: ProposalInfo = {
                id: proposal.id,
                askPrice: Number(proposal.ask_price),
                payout: Number(proposal.payout),
                longcode: String(proposal.longcode ?? ''),
                spot: Number(proposal.spot ?? 0),
                spotTime: Number(proposal.spot_time ?? 0),
                dateStart: Number(proposal.date_start ?? 0),
                dateExpiry: Number(proposal.date_expiry ?? 0),
            };

            callbacks.onProposal(info, null);
            return info;
        } catch (error) {
            const msg = (error as Error).message;
            callbacks.onProposal(null, msg);
            callbacks.onError(`Proposal request failed: ${msg}`);
            return null;
        }
    }

    private verifyProposal(proposal: ProposalInfo, settings: TradingSettings, callbacks: ExecutionCallbacks): boolean {
        // Check quote freshness.
        if (proposal.spotTime > 0) {
            const quoteAgeS = Date.now() / 1000 - proposal.spotTime;
            if (quoteAgeS > MAX_QUOTE_AGE_S) {
                callbacks.onError(`Stale quote (${Math.round(quoteAgeS)}s old)`);
                return false;
            }
        }

        // Check ask price is within limits.
        if (proposal.askPrice > settings.maxStake) {
            callbacks.onError(`Ask price ${proposal.askPrice} exceeds max stake ${settings.maxStake}`);
            return false;
        }

        return true;
    }

    private async buyContract(
        proposal: ProposalInfo,
        callbacks: ExecutionCallbacks
    ): Promise<{ contractId: number; buyPrice: number; payout: number; longcode: string } | null> {
        try {
            const response = await this.sendAndWaitFn(
                { buy: proposal.id, price: proposal.askPrice },
                BUY_TIMEOUT_MS
            );
            const payload = response as Record<string, any>;

            if (payload.error) {
                const msg = String(payload.error.message ?? 'Purchase rejected');
                callbacks.onBuy(null, msg);
                callbacks.onError(`Purchase rejected: ${msg}`);
                return null;
            }

            const buy = payload.buy;
            if (!buy || !buy.contract_id) {
                callbacks.onBuy(null, 'Invalid buy response');
                callbacks.onError('Invalid buy response — no contract id');
                return null;
            }

            const result = {
                contractId: Number(buy.contract_id),
                buyPrice: Number(buy.buy_price),
                payout: Number(buy.payout),
                longcode: String(buy.longcode ?? ''),
            };

            callbacks.onBuy(result, null);
            return result;
        } catch (error) {
            const msg = (error as Error).message;
            callbacks.onBuy(null, msg);
            callbacks.onError(`Purchase failed: ${msg}`);
            return null;
        }
    }

    private handleMessage(message: AuthMessage): void {
        const msgType = message.msg_type;
        const payload = message as Record<string, any>;

        if (msgType !== 'proposal_open_contract') return;
        if (!this.activeContractId) return;

        const contract = payload.proposal_open_contract;
        if (!contract || Number(contract.contract_id) !== this.activeContractId) return;

        if (payload.subscription?.id) this.openContractSubscriptionId = String(payload.subscription.id);

        const info: OpenContractInfo = {
            contractId: Number(contract.contract_id),
            contractType: String(contract.contract_type ?? ''),
            symbol: String(contract.underlying ?? ''),
            buyPrice: Number(contract.buy_price ?? 0),
            payout: Number(contract.payout ?? 0),
            profit: contract.profit !== undefined ? Number(contract.profit) : null,
            isSold: Boolean(contract.is_sold),
            isValidToSell: Boolean(contract.is_valid_to_sell),
            isExpired: Boolean(contract.is_expired),
            entryTick: contract.entry_tick !== undefined ? Number(contract.entry_tick) : null,
            currentSpot: contract.current_spot !== undefined ? Number(contract.current_spot) : null,
            status: contract.status ? String(contract.status) : null,
            transactionId: Number(contract.transaction_ids?.buy ?? 0),
        };

        this.callbacks?.onContractUpdate(info);

        if (info.isSold) {
            const profit = info.profit ?? 0;
            const result: ExecutionResult = {
                contractId: info.contractId,
                state: 'settled',
                buyPrice: info.buyPrice,
                payout: info.payout,
                profit,
                status: profit > 0 ? 'won' : profit < 0 ? 'lost' : 'open',
                message: `Contract settled: ${profit >= 0 ? 'won' : 'lost'} ${Math.abs(profit).toFixed(2)}`,
                timestamp: Date.now(),
            };
            this.activeContractId = null;
            this.cancelProposal();
            if (this.openContractSubscriptionId) {
                this.sendFn({ forget: this.openContractSubscriptionId });
                this.openContractSubscriptionId = null;
            }
            this.callbacks?.onSettled(result);
        }
    }
}
