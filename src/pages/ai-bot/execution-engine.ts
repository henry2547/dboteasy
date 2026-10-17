/**
 * Order Execution Service — the documented Deriv workflow for authenticated
 * trading operations.
 *
 * Workflow:
 * 1. Obtain a valid price proposal (proposal request).
 * 2. Verify the returned quote and contract parameters.
 * 3. Submit a purchase only when all conditions and risk checks pass — and for
 *    a real-money entry, only after the user approves the order (`prepare`
 *    quotes it, `buyPrepared` buys it, `cancelPending` drops it unplaced).
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
    /**
     * Fired when a quote the user approved went stale and was replaced by a
     * fresh one for the same contract at purchase time.
     */
    onQuoteRefreshed?: (info: ProposalInfo) => void;
}

const PROPOSAL_TIMEOUT_MS = 10000;
const BUY_TIMEOUT_MS = 10000;
const MAX_QUOTE_AGE_S = 5;

export class ExecutionEngine {
    private activeProposalId: string | null = null;
    private activeContractId: number | null = null;
    private openContractSubscriptionId: string | null = null;
    /** A verified quote held back until the user approves the order. */
    private pendingProposal: ProposalInfo | null = null;
    /** The proposal request that produced `pendingProposal`, for a re-quote. */
    private pendingParams: Record<string, unknown> | null = null;
    /** Invalidates a quote request that is still in flight when it is dropped. */
    private requestSeq = 0;
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
        this.cancelPending();
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
     * Execute the full workflow in one step: proposal → verify → buy → monitor.
     * The contract is monitored via the message handler; onSettled fires
     * when proposal_open_contract reports is_sold.
     */
    async execute(signal: StrategySignal, currency: string, callbacks: ExecutionCallbacks): Promise<void> {
        const proposal = await this.prepare(signal, currency, callbacks);
        if (!proposal) return;
        await this.buyPrepared(callbacks);
    }

    /**
     * Step 1 of a user-approved entry: obtain and verify a price proposal and
     * hold it — nothing is bought. `buyPrepared` buys that quote once the user
     * approves it; `cancelPending` drops it. Returns null (and releases the
     * engine, holding nothing) when no valid proposal was obtained.
     */
    async prepare(signal: StrategySignal, currency: string, callbacks: ExecutionCallbacks): Promise<ProposalInfo | null> {
        if (this.isExecuting) {
            callbacks.onError('Another trade is already in progress');
            return null;
        }

        const seq = ++this.requestSeq;
        this.callbacks = callbacks;
        this.isExecuting = true;

        const params = proposalParamsFromSignal(signal, this.settingsRef(), currency);
        const proposal = await this.requestProposal(params, callbacks);

        // Dropped (cancelled or replaced) while the quote was in flight.
        if (seq !== this.requestSeq) {
            if (proposal) this.cancelProposal();
            return null;
        }
        if (!proposal) {
            this.release();
            return null;
        }
        // Verify the returned quote and contract parameters.
        if (!this.verifyProposal(proposal, this.settingsRef(), callbacks)) {
            this.cancelProposal();
            this.release();
            return null;
        }

        this.pendingProposal = proposal;
        this.pendingParams = params;
        return proposal;
    }

    /** True while a prepared quote is waiting to be bought. */
    get hasPreparedProposal(): boolean {
        return this.pendingProposal !== null;
    }

    /**
     * Step 2 of a user-approved entry: submit the purchase for the quote the
     * user approved. A quote that went stale while the user was deciding is
     * replaced by a fresh one for the exact same contract before buying.
     */
    async buyPrepared(callbacks?: ExecutionCallbacks): Promise<void> {
        const cb = callbacks ?? this.callbacks;
        let proposal = this.pendingProposal;
        const params = this.pendingParams;
        this.pendingProposal = null;
        this.pendingParams = null;

        if (!cb) {
            this.release();
            return;
        }
        this.callbacks = cb;

        try {
            if (proposal && params && !this.isQuoteFresh(proposal)) {
                proposal = await this.requestProposal(params, cb);
                if (proposal && !this.verifyProposal(proposal, this.settingsRef(), cb)) proposal = null;
                if (proposal) cb.onQuoteRefreshed?.(proposal);
            }
            if (!proposal) return;

            const buyResult = await this.buyContract(proposal, cb);
            if (!buyResult) return;

            // Subscribe to contract updates and monitor until settled.
            this.activeContractId = buyResult.contractId;
            this.subscribeOpenContract(buyResult.contractId);
        } catch (error) {
            cb.onError(`Execution error: ${(error as Error).message}`);
        } finally {
            this.release();
        }
    }

    /** Cancel any in-flight proposal (forget the proposal subscription). */
    cancelProposal(): void {
        if (this.activeProposalId) {
            this.sendFn({ forget: this.activeProposalId });
            this.activeProposalId = null;
        }
    }

    /** Drop a prepared or in-flight entry without buying anything. */
    cancelPending(): void {
        this.requestSeq += 1; // invalidate a quote request still in flight
        this.cancelProposal();
        this.pendingProposal = null;
        this.pendingParams = null;
        this.release();
    }

    /** Subscribe to proposal_open_contract updates for the purchased contract. */
    private subscribeOpenContract(contractId: number): void {
        this.sendFn({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private async requestProposal(
        params: Record<string, unknown>,
        callbacks: ExecutionCallbacks
    ): Promise<ProposalInfo | null> {
        // A new proposal replaces the previous one, so its subscription goes.
        this.cancelProposal();
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
        if (!this.isQuoteFresh(proposal)) {
            callbacks.onError(`Stale quote (${Math.round(Date.now() / 1000 - proposal.spotTime)}s old)`);
            return false;
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

    /** Release the engine so the next entry can start. */
    private release(): void {
        this.isExecuting = false;
    }

    /** A quote is usable while its spot is recent (Deriv may omit spot_time). */
    private isQuoteFresh(proposal: ProposalInfo): boolean {
        if (proposal.spotTime <= 0) return true;
        return Date.now() / 1000 - proposal.spotTime <= MAX_QUOTE_AGE_S;
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
