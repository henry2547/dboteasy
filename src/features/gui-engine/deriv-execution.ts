/**
 * Deriv execution for the GUI Trading Engine.
 *
 * It reuses the app's existing authorized socket (`api_base`) — no second
 * authenticated connection is opened. A purchase only happens after Deriv
 * answers a valid proposal with an id and ask price; the returned `buy` object
 * is the only thing that creates a trade record.
 */

import { api_base } from '@/external/bot-skeleton';

export interface ProposalRequest {
    symbol: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'CALL' | 'PUT';
    stake: number;
    barrier?: number;
    currency: string;
    duration: number;
    durationUnit: 't';
}

export interface ProposalResult {
    id: string;
    askPrice: number;
    payout: number;
    spot: number | null;
    longcode: string | null;
    dateStart: number | null;
    raw: Record<string, unknown>;
}

export interface PurchaseResult {
    contractId: number;
    transactionId: number;
    buyPrice: number;
    payout: number;
    balanceAfter: number | null;
    startTime: number | null;
    raw: Record<string, unknown>;
}

export class TradeExecutionError extends Error {
    code: string | null;

    constructor(message: string, code: string | null = null) {
        super(message);
        this.name = 'TradeExecutionError';
        this.code = code;
    }
}

function ensureSocket() {
    if (!api_base.api || !api_base.is_authorized) {
        throw new TradeExecutionError('Sign in with your Deriv account before starting the engine.', 'Unauthorized');
    }
}

/**
 * `api_base.api.send` resolves with the raw Deriv response for a non-subscribing
 * request; the vendored typing declares it as void, so the call goes through one
 * narrow cast here instead of at every call site.
 */
function sendRequest(payload: Record<string, unknown>): Promise<Record<string, any>> {
    const api = api_base.api as unknown as { send: (data: unknown) => Promise<Record<string, any>> };
    return api.send(payload);
}

function readError(response: Record<string, any> | null | undefined): { message: string; code: string | null } | null {
    if (!response || !response.error) return null;
    const error = response.error;
    return {
        message: String(error.message ?? error.code ?? 'Deriv rejected the request.'),
        code: error.code ? String(error.code) : null,
    };
}

/**
 * `api_base.api.send` rejects with the whole Deriv message, so a failed request
 * carries its reason in `error.message` / `error.code` rather than on an `Error`.
 * Without this the UI could only ever say "the request failed".
 */
function rejectionError(error: unknown): { message: string; code: string | null } | null {
    const rejected = error as { error?: { message?: unknown; code?: unknown } } | null | undefined;
    if (rejected?.error) {
        const message = rejected.error.message ?? rejected.error.code;
        if (message !== undefined && message !== null && String(message) !== '') {
            return {
                message: String(message),
                code: rejected.error.code ? String(rejected.error.code) : null,
            };
        }
    }
    if (error instanceof Error && error.message) return { message: error.message, code: null };
    return null;
}

export async function requestProposal(request: ProposalRequest): Promise<ProposalResult> {
    ensureSocket();

    const payload: Record<string, unknown> = {
        proposal: 1,
        amount: request.stake,
        basis: 'stake',
        contract_type: request.contractType,
        currency: request.currency,
        duration: request.duration,
        duration_unit: request.durationUnit,
        // The options API names the market `underlying_symbol`; `symbol` is refused
        // with InputValidationFailed "field is not allowed".
        underlying_symbol: request.symbol,
    };

    if (request.barrier !== undefined && request.barrier !== null) {
        payload.barrier = String(request.barrier);
    }

    let response: Record<string, any> | null = null;
    try {
        response = await sendRequest(payload);
    } catch (error) {
        const rejected = rejectionError(error);
        throw new TradeExecutionError(rejected?.message ?? 'The proposal request failed.', rejected?.code ?? 'ProposalFailed');
    }

    const apiError = readError(response);
    if (apiError) throw new TradeExecutionError(apiError.message, apiError.code);

    const proposal = response?.proposal;
    if (!proposal || proposal.id === undefined || proposal.ask_price === undefined) {
        throw new TradeExecutionError('Deriv did not return a usable proposal.', 'InvalidProposal');
    }

    const askPrice = Number(proposal.ask_price);
    if (!Number.isFinite(askPrice) || askPrice <= 0) {
        throw new TradeExecutionError('Deriv returned a proposal without a valid price.', 'InvalidProposal');
    }

    return {
        id: String(proposal.id),
        askPrice,
        payout: Number(proposal.payout ?? 0),
        spot: proposal.spot === undefined ? null : Number(proposal.spot),
        longcode: typeof proposal.longcode === 'string' ? proposal.longcode : null,
        dateStart: proposal.date_start === undefined ? null : Number(proposal.date_start),
        raw: proposal as Record<string, unknown>,
    };
}

export async function purchaseContract(proposal: ProposalResult): Promise<PurchaseResult> {
    ensureSocket();

    let response: Record<string, any> | null = null;
    try {
        response = await sendRequest({ buy: proposal.id, price: proposal.askPrice });
    } catch (error) {
        const rejected = rejectionError(error);
        throw new TradeExecutionError(rejected?.message ?? 'The purchase request failed.', rejected?.code ?? 'PurchaseFailed');
    }

    const apiError = readError(response);
    if (apiError) throw new TradeExecutionError(apiError.message, apiError.code);

    const buy = response?.buy;
    if (!buy || buy.contract_id === undefined) {
        throw new TradeExecutionError('Deriv did not confirm the purchase.', 'PurchaseFailed');
    }

    return {
        contractId: Number(buy.contract_id),
        transactionId: Number(buy.transaction_id ?? 0),
        buyPrice: Number(buy.buy_price ?? proposal.askPrice),
        payout: Number(buy.payout ?? proposal.payout),
        balanceAfter: buy.balance_after === undefined ? null : Number(buy.balance_after),
        startTime: buy.start_time === undefined ? null : Number(buy.start_time),
        raw: buy as Record<string, unknown>,
    };
}

/** Current account balance — read immediately before a purchase validation. */
export async function fetchBalance(): Promise<number | null> {
    ensureSocket();
    try {
        const response = await sendRequest({ balance: 1 });
        const apiError = readError(response);
        if (apiError) return null;
        const balance = Number(response?.balance?.balance);
        return Number.isFinite(balance) ? balance : null;
    } catch {
        return null;
    }
}

export interface ContractUpdate {
    contractId: number;
    isSold: boolean;
    profit: number;
    buyPrice: number;
    sellPrice: number | null;
    payout: number;
    status: string;
    entrySpot: number | null;
    exitSpot: number | null;
    entryTickTime: number | null;
    exitTickTime: number | null;
    raw: Record<string, any>;
}

/**
 * Subscribes to the account's existing `proposal_open_contract` stream and
 * reports updates for the contract ids the engine is holding.
 */
export function watchContracts(
    isTracked: (contractId: number) => boolean,
    onUpdate: (update: ContractUpdate) => void
): () => void {
    if (!api_base.api) return () => undefined;

    const subscription = api_base.api.onMessage().subscribe((message: any) => {
        const data = message?.data ?? message;
        if (!data || data.msg_type !== 'proposal_open_contract') return;

        const contract = data.proposal_open_contract;
        if (!contract || contract.contract_id === undefined) return;

        const contractId = Number(contract.contract_id);
        if (!Number.isFinite(contractId) || !isTracked(contractId)) return;

        onUpdate({
            contractId,
            isSold: Boolean(contract.is_sold),
            profit: Number(contract.profit ?? 0),
            buyPrice: Number(contract.buy_price ?? 0),
            sellPrice: contract.sell_price === undefined ? null : Number(contract.sell_price),
            payout: Number(contract.payout ?? 0),
            status: String(contract.status ?? ''),
            entrySpot: contract.entry_spot === undefined ? null : Number(contract.entry_spot),
            exitSpot: contract.exit_spot === undefined ? null : Number(contract.exit_spot),
            entryTickTime: contract.entry_tick_time === undefined ? null : Number(contract.entry_tick_time),
            exitTickTime: contract.exit_tick_time === undefined ? null : Number(contract.exit_tick_time),
            raw: contract as Record<string, any>,
        });
    });

    return () => subscription.unsubscribe();
}

/** One-off read used to reconcile a persisted open contract after a reload. */
export async function fetchContract(contractId: number): Promise<ContractUpdate | null> {
    if (!api_base.api) return null;
    try {
        const response = await sendRequest({ proposal_open_contract: 1, contract_id: contractId });
        const contract = response?.proposal_open_contract;
        if (!contract) return null;
        return {
            contractId,
            isSold: Boolean(contract.is_sold),
            profit: Number(contract.profit ?? 0),
            buyPrice: Number(contract.buy_price ?? 0),
            sellPrice: contract.sell_price === undefined ? null : Number(contract.sell_price),
            payout: Number(contract.payout ?? 0),
            status: String(contract.status ?? ''),
            entrySpot: contract.entry_spot === undefined ? null : Number(contract.entry_spot),
            exitSpot: contract.exit_spot === undefined ? null : Number(contract.exit_spot),
            entryTickTime: contract.entry_tick_time === undefined ? null : Number(contract.entry_tick_time),
            exitTickTime: contract.exit_tick_time === undefined ? null : Number(contract.exit_tick_time),
            raw: contract as Record<string, any>,
        };
    } catch {
        return null;
    }
}
