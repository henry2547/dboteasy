/**
 * The AI bots' live run, kept outside the page component.
 *
 * A purchase must keep reporting after the tab unmounts — the user's next stop
 * is usually the Bot Builder, and a contract that settles while the AI Bots tab
 * is closed still has to reach the Summary and Transactions lists. So the open
 * contracts, the session figures and the contract subscription live here, at
 * module scope, and the page only reads them.
 *
 * Every purchase goes through the app's own authorized socket (the same helpers
 * the GUI engine uses): quote → buy → `proposal_open_contract` until it settles.
 * Each contract is mirrored into `summary_card` and `transactions`, and every
 * purchase and settlement is journaled, so the Bot Builder's Summary,
 * Transactions and Journal show the bot's trades.
 */

import { api_base, MessageTypes } from '@/external/bot-skeleton';
import { authData$, isAuthorized$ } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import {
    purchaseContract,
    requestProposal,
    watchContracts,
    type ContractUpdate,
} from '@/features/gui-engine/deriv-execution';
import type { AiBotId, AiBotSettings, TradeSide } from './types';
import { CONTRACT_TICKS } from './signals';
import { contractTicks, nextStake, sessionStop, tradePlanFor } from './trading';

export interface AiBotRun {
    trades: number;
    wins: number;
    losses: number;
    profit: number;
    openContracts: number;
}

export const EMPTY_AI_RUN: AiBotRun = { trades: 0, wins: 0, losses: 0, profit: 0, openContracts: 0 };

interface ReportingStores {
    journal: { pushMessage: (message: string, type: string, class_name: string) => void };
    summary_card: { onBotContractEvent: unknown };
    transactions: { onBotContractEvent: unknown };
}

let stores: ReportingStores | null = null;
let halt: ((reason: string) => void) | null = null;
let watcher: (() => void) | null = null;

let session: AiBotRun = { ...EMPTY_AI_RUN };
const listeners = new Set<() => void>();
const tracked = new Set<number>();
const settled = new Set<number>();
const symbols = new Map<number, string>();
const busy = new Set<string>();

let losses = 0;
let buying = false;
let warned = false;

// The run outlives the page, so the account it buys on is read here rather than
// from a React hook: the app's own socket is the single source of truth.
let authorized = false;
let currency = 'USD';
isAuthorized$.subscribe(value => {
    authorized = Boolean(value);
});
authData$.subscribe(data => {
    if (data?.currency) currency = data.currency;
});

const round2 = (value: number) => Math.round(value * 100) / 100;

function emit() {
    listeners.forEach(listener => listener());
}

function setSession(next: AiBotRun) {
    session = next;
    emit();
}

export function getAiBotRun(): AiBotRun {
    return session;
}

export function subscribeAiBotRun(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Wired by the AI Bots page: the stores it reports into, and where a reached limit goes. */
export function attachAiBotRunner(next: ReportingStores, onHalt: (reason: string) => void) {
    stores = next;
    halt = onHalt;
    ensureWatcher();
}

/** Fresh figures for a new run; a contract that is still open keeps tracking. */
export function resetAiBotRun() {
    session = { ...EMPTY_AI_RUN };
    losses = 0;
    warned = false;
    emit();
}

function pushJournal(message: string, type: string = MessageTypes.NOTIFY) {
    try {
        stores?.journal.pushMessage(`AI bot · ${message}`, type, '');
    } catch {
        /* journal store unavailable (tests) — the panels still get the contract */
    }
}

function pushReporting(update: ContractUpdate) {
    if (!stores) return;
    const payload = {
        ...update.raw,
        id: String(update.contractId),
        contract_id: update.contractId,
        is_sold: update.isSold ? 1 : 0,
        profit: update.profit,
        buy_price: update.buyPrice,
        sell_price: update.sellPrice,
        payout: update.payout,
    };
    try {
        const onContract = stores.summary_card.onBotContractEvent as (
            contract: Record<string, unknown>
        ) => void;
        const onTransaction = stores.transactions.onBotContractEvent as (
            contract: Record<string, unknown>
        ) => void;
        onContract(payload);
        onTransaction(payload);
    } catch {
        /* reporting stores unavailable (tests) */
    }
}

/** The limits the running session was started with — read when it settles. */
let sessionLimits: Pick<AiBotSettings, 'takeProfit' | 'stopLoss'> = { takeProfit: 0, stopLoss: 0 };

function onContractUpdate(update: ContractUpdate) {
    pushReporting(update);
    if (!update.isSold || settled.has(update.contractId)) return;

    settled.add(update.contractId);
    tracked.delete(update.contractId);
    const symbol = symbols.get(update.contractId);
    symbols.delete(update.contractId);
    if (symbol) busy.delete(symbol);

    const profit = round2(update.profit);
    const won = profit > 0;
    losses = won ? 0 : losses + 1;

    setSession({
        ...session,
        wins: session.wins + (won ? 1 : 0),
        losses: session.losses + (won ? 0 : 1),
        profit: round2(session.profit + profit),
        openContracts: Math.max(0, session.openContracts - 1),
    });

    pushJournal(
        `Contract ${update.contractId} settled ${won ? 'WON' : 'LOST'} · P/L ${profit.toFixed(2)}`,
        won ? MessageTypes.SUCCESS : MessageTypes.NOTIFY
    );

    const limits = sessionLimits;
    const stop = sessionStop(session.profit, limits);
    if (stop) {
        halt?.(
            stop === 'take_profit'
                ? `Take profit reached · ${session.profit.toFixed(2)}`
                : `Stop loss reached · ${session.profit.toFixed(2)}`
        );
    }
}

/** One contract subscription for the whole app; the socket is the app's own. */
function ensureWatcher() {
    // `watchContracts` answers a no-op before the app's socket exists, so only
    // remember a subscription once there is a socket to subscribe to.
    if (watcher || !api_base.api) return;
    watcher = watchContracts(
        contractId => tracked.has(contractId),
        update => onContractUpdate(update)
    );
}

export interface AiBotEntry {
    botId: AiBotId;
    settings: AiBotSettings;
    symbol: string;
    displayName: string;
    side: TradeSide;
}

/** A market that already holds an open contract or a purchase in flight is skipped. */
export function isAiBotMarketBusy(symbol: string): boolean {
    return busy.has(symbol);
}

export async function placeAiBotTrade(entry: AiBotEntry): Promise<void> {
    const plan = tradePlanFor(entry.botId, entry.side);
    if (!plan) return;
    if (busy.has(entry.symbol) || buying) return;

    if (!authorized) {
        if (!warned) {
            warned = true;
            pushJournal('Sign in with your Deriv account to place the entries.', MessageTypes.ERROR);
        }
        return;
    }

    buying = true;
    busy.add(entry.symbol);
    sessionLimits = { takeProfit: entry.settings.takeProfit, stopLoss: entry.settings.stopLoss };
    ensureWatcher();

    const stake = nextStake(entry.settings.stake, entry.settings.martingale, losses);
    if (stake < 1) {
        busy.delete(entry.symbol);
        buying = false;
        pushJournal('Entry skipped · the stake is below the minimum.', MessageTypes.ERROR);
        return;
    }

    try {
        const proposal = await requestProposal({
            symbol: entry.symbol,
            contractType: plan.contractType,
            stake,
            currency,
            // A contract always covers one tick — the setup no longer exposes a duration field.
            duration: contractTicks(CONTRACT_TICKS),
            durationUnit: 't',
        });
        const bought = await purchaseContract(proposal);

        tracked.add(bought.contractId);
        symbols.set(bought.contractId, entry.symbol);
        setSession({ ...session, trades: session.trades + 1, openContracts: session.openContracts + 1 });

        pushReporting({
            contractId: bought.contractId,
            isSold: false,
            profit: 0,
            buyPrice: bought.buyPrice,
            sellPrice: null,
            payout: bought.payout,
            status: 'open',
            entrySpot: proposal.spot,
            exitSpot: null,
            entryTickTime: bought.startTime,
            exitTickTime: null,
            raw: {
                contract_id: bought.contractId,
                contract_type: plan.contractType,
                underlying_symbol: entry.symbol,
                buy_price: bought.buyPrice,
                payout: bought.payout,
                transaction_ids: { buy: bought.transactionId },
                date_start: bought.startTime,
                currency,
                longcode: proposal.longcode,
                stake,
            },
        });

        pushJournal(
            `Bought ${plan.side} on ${entry.displayName} · stake ${stake} · contract ${bought.contractId}`,
            MessageTypes.SUCCESS
        );
    } catch (caught) {
        busy.delete(entry.symbol);
        pushJournal(
            `${plan.side} entry on ${entry.displayName} was not placed · ${(caught as Error).message}`,
            MessageTypes.ERROR
        );
    } finally {
        buying = false;
    }
}
