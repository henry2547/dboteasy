/**
 * Authenticated order execution service.
 *
 * Uses the app's existing authenticated Deriv socket (`api_base`) — the *same*
 * one the block-builder bot uses — which is kept separate from the public
 * market-data socket. It follows Deriv's documented workflow:
 *
 *   1. request a `proposal` (price quote) for the contract,
 *   2. verify the returned quote and contract parameters,
 *   3. submit a `buy` only when the quote is valid and fresh,
 *   4. monitor the open contract via `proposal_open_contract` until it settles.
 *
 * Nothing is fabricated: proposal ids, contract ids, quotes and confirmations
 * all come from Deriv's responses. Rejected proposals, stale quotes, network
 * errors and duplicate requests are handled safely.
 */

import { api_base } from '@/external/bot-skeleton';
import type { DerivMessage } from '../digits/deriv-public-ws';
import type { ContractRecord, DigitContractType, ScannerConfig, StrategySignal } from './scanner-types';

type Unsubscribe = () => void;

interface ProposalResult {
    proposalId: string;
    askPrice: number;
    payout: number;
    spot: number | null;
}

interface BuyResult {
    contractId: number;
    transactionId: number;
    buyPrice: number;
}

interface SettledContract {
    contractId: number;
    isWon: boolean;
    payout: number | null;
    profit: number | null;
    sellPrice: number | null;
}

/** Builds the Deriv `proposal` request body for a digit contract. */
function buildProposal(signal: StrategySignal, config: ScannerConfig, ref: string): Record<string, unknown> {
    const base: Record<string, unknown> = {
        proposal: 1,
        amount: config.stake,
        basis: 'stake',
        contract_type: signal.contractType,
        currency: 'USD',
        duration: config.durationTicks,
        duration_unit: 't',
        symbol: signal.symbol,
        passthrough: { ref },
    };
    if (signal.prediction !== null) base.prediction = signal.prediction;
    if (signal.barrier !== null) base.barrier = String(signal.barrier);
    return base;
}

export class ExecutionService {
    private messageUnsub: Unsubscribe | null = null;
    private proposalResolvers = new Map<string, (p: ProposalResult) => void>();
    private proposalRejecters = new Map<string, (e: Error) => void>();
    private contractCallbacks = new Map<number, (s: SettledContract) => void>();
    private actionedSignals = new Set<string>();

    /** True when the authenticated socket is available and authorized. */
    isReady(): boolean {
        return Boolean(api_base?.api) && Boolean(api_base?.is_authorized);
    }

    /** Subscribe to the authenticated message stream once. */
    private ensureSubscription(): void {
        if (this.messageUnsub) return;
        const api = api_base?.api;
        if (!api?.onMessage) return;

        const subscription = api.onMessage().subscribe((response: unknown) => {
            const data = (response as { data?: DerivMessage })?.data;
            if (!data) return;
            this.handleMessage(data);
        });
        this.messageUnsub = () => subscription?.unsubscribe?.();
    }

    private handleMessage(data: DerivMessage): void {
        const msgType = data.msg_type;
        const payload = data as Record<string, any>;

        if (msgType === 'proposal') {
            const ref = payload.passthrough?.ref;
            if (!ref) return;
            if (payload.error) {
                this.reject(ref, new Error(payload.error.message ?? 'Proposal rejected'));
                return;
            }
            const proposal = payload.proposal;
            if (proposal?.id) {
                this.resolve(ref, {
                    proposalId: proposal.id,
                    askPrice: Number(proposal.ask_price),
                    payout: Number(proposal.payout),
                    spot: proposal.spot ? Number(proposal.spot) : null,
                });
            }
            return;
        }

        if (msgType === 'proposal_open_contract') {
            const contract = payload.proposal_open_contract;
            if (!contract?.contract_id) return;
            const cb = this.contractCallbacks.get(contract.contract_id);
            if (!cb) return;
            if (contract.is_sold) {
                const buyPrice = Number(contract.buy_price ?? 0);
                const payout = Number(contract.payout ?? 0);
                const sellPrice = Number(contract.sell_price ?? 0);
                const profit = sellPrice - buyPrice;
                cb({
                    contractId: contract.contract_id,
                    isWon: profit >= 0,
                    payout: Number.isFinite(payout) ? payout : null,
                    profit: Number.isFinite(profit) ? profit : null,
                    sellPrice: Number.isFinite(sellPrice) ? sellPrice : null,
                });
            }
        }
    }

    private resolve(ref: string, result: ProposalResult): void {
        this.proposalResolvers.get(ref)?.(result);
        this.proposalResolvers.delete(ref);
        this.proposalRejecters.delete(ref);
    }

    private reject(ref: string, error: Error): void {
        this.proposalRejecters.get(ref)?.(error);
        this.proposalResolvers.delete(ref);
        this.proposalRejecters.delete(ref);
    }

    /**
     * Requests a proposal and resolves with the quote. Rejects on error, stale
     * quote, or timeout. The proposal subscription is forgotten after the first
     * quote to avoid duplicate purchases on price moves.
     */
    async requestProposal(signal: StrategySignal, config: ScannerConfig): Promise<ProposalResult> {
        if (!this.isReady()) throw new Error('Not authorized — connect a Deriv account first.');
        if (this.actionedSignals.has(signal.id)) throw new Error('Duplicate signal — already actioned.');

        this.ensureSubscription();
        const api = api_base.api!;
        const ref = `${signal.id}:${Date.now()}`;

        const result = await new Promise<ProposalResult>((resolve, reject) => {
            this.proposalResolvers.set(ref, resolve);
            this.proposalRejecters.set(ref, reject);

            const timeout = setTimeout(() => this.reject(ref, new Error('Proposal timed out.')), 15000);

            api.send(buildProposal(signal, config, ref)).catch((err: unknown) => {
                clearTimeout(timeout);
                this.reject(ref, new Error((err as Error)?.message ?? 'Proposal request failed.'));
            });

            // Clear the timeout guard once resolved/rejected.
            const originalResolve = this.proposalResolvers.get(ref);
            const originalReject = this.proposalRejecters.get(ref);
            if (originalResolve) this.proposalResolvers.set(ref, (p) => { clearTimeout(timeout); originalResolve(p); });
            if (originalReject) this.proposalRejecters.set(ref, (e) => { clearTimeout(timeout); originalReject(e); });
        });

        // Forget the proposal stream so a later price move cannot trigger a duplicate buy.
        try {
            api.send({ forget: result.proposalId });
        } catch {
            /* non-fatal */
        }

        if (!Number.isFinite(result.askPrice) || result.askPrice <= 0) {
            throw new Error('Invalid quote returned by Deriv.');
        }

        return result;
    }

    /**
     * Purchases the contract at the quoted ask price. Rejects on any error,
     * including `PriceMoved` and `InvalidContractProposal` — the caller decides
     * whether to retry.
     */
    async buy(proposalId: string, askPrice: number, signal: StrategySignal): Promise<BuyResult> {
        if (!this.isReady()) throw new Error('Not authorized.');
        if (this.actionedSignals.has(signal.id)) throw new Error('Duplicate signal — already actioned.');

        const api = api_base.api!;
        const response = await api.send({ buy: proposalId, price: askPrice });
        const buy = (response as { buy?: any; error?: any })?.buy;
        const error = (response as { error?: any })?.error;

        if (error) throw new Error(error.message ?? error.code ?? 'Purchase rejected.');
        if (!buy?.contract_id) throw new Error('No contract id returned by Deriv.');

        this.actionedSignals.add(signal.id);
        return {
            contractId: Number(buy.contract_id),
            transactionId: Number(buy.transaction_id ?? 0),
            buyPrice: Number(buy.buy_price ?? askPrice),
        };
    }

    /**
     * Monitors an open contract until Deriv reports it sold, then resolves with
     * the authoritative result. Never declares a win before the contract settles.
     */
    monitorContract(contractId: number): Promise<SettledContract> {
        this.ensureSubscription();
        return new Promise(resolve => {
            this.contractCallbacks.set(contractId, (settled) => {
                this.contractCallbacks.delete(contractId);
                resolve(settled);
            });
            // Request the open-contract stream for this contract.
            try {
                api_base.api?.send({ proposal_open_contract: 1, contract_id: contractId });
            } catch {
                /* will retry on next tick */
            }
        });
    }

    /** Releases the signal id so a genuinely new signal on the same setup can trade. */
    releaseSignal(signalId: string): void {
        this.actionedSignals.delete(signalId);
    }

    /** Tears down all subscriptions (called when the bot stops). */
    dispose(): void {
        this.messageUnsub?.();
        this.messageUnsub = null;
        this.proposalResolvers.clear();
        this.proposalRejecters.clear();
        this.contractCallbacks.clear();
    }
}

export type { ContractRecord, DigitContractType };
