/**
 * Central Rise/Fall execution service — the one account-aware path to an entry.
 *
 * Every entry, from any strategy and from any Blockly block, passes these checks
 * in this order: engine state → signal → duplicate guard → market-data integrity
 * → risk engine → account verification → contract validation → entry.
 *
 * Virtual mode simulates fills against genuine ticks: no purchase is sent to
 * Deriv and the record says so (`source: 'VIRTUAL'`, `contractId: null`).
 * Demo and Real send a real `proposal` → `buy` over the authenticated Deriv
 * socket through the injected broker, and settle on Deriv's own
 * `proposal_open_contract` reports. Real entries additionally need the mode
 * armed for the session and the user's per-entry confirmation.
 *
 * Settlement is strict: Rise wins only when the exit quote is above the entry
 * quote, Fall only when it is below. Equal quotes are a loss (allow-equals is not
 * requested — see REALITY_GATE.md).
 */

import { RiseFallJournal } from './journal';
import { DEFAULT_RISK, evaluateRisk, riskSnapshot, sanitiseRiskConfig, type RiskConfig } from './risk-engine';
import { EXECUTION_MODES, MODE_LABELS } from './types';
import type {
    AccountVerification,
    BrokerBuyResult,
    BrokerTicket,
    EngineSnapshot,
    EngineState,
    EntryStage,
    ExecutionMode,
    LiveContractUpdate,
    MarketIntegrity,
    ModeSnapshot,
    RiseFallBroker,
    RiseFallSignal,
    Tick,
    VirtualContract,
} from './types';

/** Simulated payout on a winning virtual contract (95% of stake). Documented assumption. */
export const VIRTUAL_PAYOUT_RATE = 0.95;

export const VIRTUAL_START_BALANCE = 1000;
export const VIRTUAL_CURRENCY = 'USD';

/** A signal older than this cannot be acted on. */
export const SIGNAL_MAX_AGE_MS = 10_000;

/** Deriv Rise/Fall tick durations accepted by this build. */
export const MIN_DURATION_TICKS = 1;
export const MAX_DURATION_TICKS = 300;

export const LIVE_ACCOUNT_REQUIRED =
    'No verified Deriv account is connected for this mode — log in from the header and press Verify in the account panel.';

export interface EntryRequest {
    signal: RiseFallSignal;
    stake: number;
    durationTicks: number;
    entryTick: Tick;
    integrity: MarketIntegrity;
    now: number;
}

export type EntryOutcome =
    | { status: 'rejected'; stage: EntryStage; reason: string }
    | { status: 'halted'; stage: EntryStage; reason: string }
    | { status: 'confirmation-required'; stage: 'confirmation'; reason: null; contract: VirtualContract }
    | { status: 'opened'; stage: 'execution'; reason: null; contract: VirtualContract };

interface ModeBook {
    state: EngineState;
    emergency: boolean;
    /** Real-money entries are refused until the user arms the mode. */
    realArmed: boolean;
    haltReason: string | null;
    account: AccountVerification;
    risk: RiskConfig;
    openContract: VirtualContract | null;
    pendingContract: VirtualContract | null;
    /** The signal behind the pending real entry, carried until it is confirmed. */
    pendingSignal: RiseFallSignal | null;
    usedFingerprints: Set<string>;
    nextId: number;
}

export function maskLoginId(loginId: string | null): string | null {
    if (!loginId) return null;
    if (loginId.length <= 4) return '••••';
    return `${loginId.slice(0, 2)}•••${loginId.slice(-2)}`;
}

function unverifiedAccount(mode: ExecutionMode, reason: string): AccountVerification {
    return {
        mode,
        verified: false,
        accountType: null,
        maskedLoginId: null,
        currency: null,
        balance: null,
        tradePermitted: false,
        verifiedAt: null,
        reason,
    };
}

function virtualAccount(now: number): AccountVerification {
    return {
        mode: 'virtual',
        verified: true,
        accountType: 'virtual',
        maskedLoginId: 'VIRTUAL-LEDGER',
        currency: VIRTUAL_CURRENCY,
        balance: VIRTUAL_START_BALANCE,
        tradePermitted: true,
        verifiedAt: now,
        reason: 'Simulated ledger — no Deriv account is connected and no purchase is sent.',
    };
}

function createBook(mode: ExecutionMode, now: number): ModeBook {
    return {
        state: 'idle',
        emergency: false,
        realArmed: false,
        haltReason: null,
        account:
            mode === 'virtual'
                ? virtualAccount(now)
                : unverifiedAccount(mode, `${MODE_LABELS[mode]} account is not connected yet. ${LIVE_ACCOUNT_REQUIRED}`),
        risk: { ...DEFAULT_RISK[mode] },
        openContract: null,
        pendingContract: null,
        pendingSignal: null,
        usedFingerprints: new Set<string>(),
        nextId: 1,
    };
}

export interface ExecutionServiceOptions {
    journal?: RiseFallJournal;
    clock?: () => number;
    /** Called after any state change so the UI can re-read the snapshot. */
    onChange?: () => void;
}

export class RiseFallExecutionService {
    private readonly journal: RiseFallJournal;
    private readonly clock: () => number;
    private readonly books: Record<ExecutionMode, ModeBook>;
    private mode: ExecutionMode = 'virtual';
    private broker: RiseFallBroker | null = null;
    private lastOutcome: EngineSnapshot['lastOutcome'] = null;
    private onChange: () => void;

    constructor(options: ExecutionServiceOptions = {}) {
        this.journal = options.journal ?? new RiseFallJournal();
        this.clock = options.clock ?? (() => Date.now());
        this.onChange = options.onChange ?? (() => undefined);
        const now = this.clock();
        this.books = {
            virtual: createBook('virtual', now),
            demo: createBook('demo', now),
            real: createBook('real', now),
        };
    }

    getMode(): ExecutionMode {
        return this.mode;
    }

    getState(mode: ExecutionMode = this.mode): EngineState {
        return this.books[mode].state;
    }

    /** The authenticated connection. Without it Demo and Real refuse every entry. */
    setBroker(broker: RiseFallBroker | null): void {
        this.broker = broker;
        if (!broker) {
            (['demo', 'real'] as const).forEach(mode => {
                const book = this.books[mode];
                if (book.account.verified) {
                    book.account = unverifiedAccount(mode, 'The authenticated connection closed — verify the account again.');
                }
                book.realArmed = false;
            });
            this.onChange();
        }
    }

    /**
     * Switching stops new entries. An open or pending contract belongs to the
     * mode that created it, so the switch is refused until it has settled.
     */
    setMode(mode: ExecutionMode): { ok: boolean; reason: string | null } {
        if (!EXECUTION_MODES.includes(mode)) return { ok: false, reason: 'Unknown execution mode.' };
        if (mode === this.mode) return { ok: true, reason: null };

        const open = this.openContractAnywhere();
        if (open) {
            return {
                ok: false,
                reason: `A ${MODE_LABELS[open.mode]} contract is still open — it must settle before the mode can change.`,
            };
        }

        this.books[this.mode].state = 'idle';
        this.mode = mode;
        this.onChange();
        return { ok: true, reason: null };
    }

    setRisk(patch: Partial<RiskConfig>): RiskConfig {
        const book = this.books[this.mode];
        book.risk = sanitiseRiskConfig(patch, book.risk);
        this.onChange();
        return { ...book.risk };
    }

    /** Called by the auth layer with the connected account's own data. */
    verifyAccount(mode: ExecutionMode, verification: Omit<AccountVerification, 'mode'>): void {
        const book = this.books[mode];
        if (mode === 'virtual') return;

        const previous = book.account.maskedLoginId;
        const next = { ...verification, mode };
        book.account = next;

        if (previous && next.maskedLoginId && previous !== next.maskedLoginId) {
            book.realArmed = false;
            book.haltReason =
                'The authorized account changed — new entries are halted until the account is re-verified.';
            book.state = 'halted';
        }
        this.onChange();
    }

    clearAccount(mode: ExecutionMode, reason: string): void {
        if (mode === 'virtual') return;
        this.books[mode].account = unverifiedAccount(mode, reason);
        this.books[mode].realArmed = false;
        this.onChange();
    }

    /** Arming is per session, per mode, and only possible for a verified Real account. */
    armReal(armed: boolean): { ok: boolean; reason: string | null } {
        const book = this.books.real;
        if (!armed) {
            book.realArmed = false;
            this.onChange();
            return { ok: true, reason: null };
        }
        if (!book.account.verified || book.account.accountType !== 'real') {
            return { ok: false, reason: 'A verified Real account is required before real entries can be armed.' };
        }
        book.realArmed = true;
        book.haltReason = null;
        if (book.state === 'halted' && !book.emergency) book.state = 'idle';
        this.onChange();
        return { ok: true, reason: null };
    }

    start(): { ok: boolean; reason: string | null } {
        const book = this.books[this.mode];
        if (book.emergency) {
            return { ok: false, reason: 'Emergency stop is engaged — release it before starting again.' };
        }
        if (book.haltReason) {
            return { ok: false, reason: book.haltReason };
        }
        if (this.mode === 'real' && !book.realArmed) {
            return { ok: false, reason: 'Real entries are not armed for this session.' };
        }
        if (book.state === 'paused') {
            book.state = 'running';
            this.onChange();
            return { ok: true, reason: null };
        }
        book.state = 'running';
        this.onChange();
        return { ok: true, reason: null };
    }

    pause(): void {
        const book = this.books[this.mode];
        if (book.state === 'running') book.state = 'paused';
        this.onChange();
    }

    /** Stop the bot: no new entries. An open contract keeps being monitored. */
    stop(): void {
        const book = this.books[this.mode];
        book.state = 'stopped';
        this.onChange();
    }

    /** Emergency stop: halts this mode and keeps monitoring its open contract. */
    emergencyStop(): void {
        const book = this.books[this.mode];
        book.emergency = true;
        book.state = 'halted';
        book.haltReason = 'Emergency stop engaged by the user.';
        book.pendingContract = null;
        book.pendingSignal = null;
        this.onChange();
    }

    releaseEmergencyStop(): void {
        const book = this.books[this.mode];
        book.emergency = false;
        book.haltReason = null;
        book.state = 'idle';
        this.onChange();
    }

    clearHalt(): void {
        const book = this.books[this.mode];
        if (book.emergency) return;
        book.haltReason = null;
        book.state = 'idle';
        this.onChange();
    }

    openContractAnywhere(): VirtualContract | null {
        const found = EXECUTION_MODES.map(mode => this.books[mode].openContract ?? this.books[mode].pendingContract).find(
            Boolean
        );
        return (found as VirtualContract | undefined) ?? null;
    }

    enter(request: EntryRequest): EntryOutcome {
        const book = this.books[this.mode];
        const { signal, stake, durationTicks, entryTick, integrity, now } = request;

        const fail = (status: 'rejected' | 'halted', stage: EntryStage, reason: string): EntryOutcome => {
            this.lastOutcome = { status, stage, reason, at: now };
            this.onChange();
            return { status, stage, reason } as EntryOutcome;
        };

        // 1. Engine state
        if (book.emergency) return fail('halted', 'execution', 'Emergency stop is engaged.');
        if (book.haltReason) return fail('halted', 'account', book.haltReason);
        if (book.state !== 'running') return fail('halted', 'execution', 'The engine is not running.');
        if (book.openContract) return fail('halted', 'execution', 'A contract is already open.');
        if (book.pendingContract) return fail('halted', 'confirmation', 'An entry is waiting for your confirmation.');

        // 2. Signal
        if (!signal || signal.direction === 'none') {
            return fail('rejected', 'signal', 'The strategy returned NO TRADE for this tick.');
        }
        if (!signal.suitable) {
            return fail('rejected', 'signal', 'The signal is not suitable for the current market regime.');
        }
        if (now - signal.evaluatedAt > SIGNAL_MAX_AGE_MS) {
            return fail('rejected', 'signal', 'The signal is stale and cannot be acted on.');
        }

        // 3. Duplicate-entry guard: one entry per strategy per tick
        if (book.usedFingerprints.has(signal.fingerprint)) {
            return fail('rejected', 'duplicate', 'This signal has already been acted on — no duplicate entry.');
        }

        // 4. Market-data integrity
        if (!integrity.healthy) {
            return fail('rejected', 'market-data', integrity.issue ?? 'Market data is not healthy.');
        }

        // 5. Risk engine
        const stats = this.journal.stats(this.mode);
        const decision = evaluateRisk(book.risk, {
            sessionPnl: stats.netProfit,
            sessionPeakPnl: stats.netProfit + stats.maxDrawdown,
            consecutiveLosses: stats.consecutiveLosses,
            tradesTaken: stats.trades,
            openContracts: book.openContract ? 1 : 0,
            exposure: book.openContract ? book.openContract.stake : 0,
            lastLossAt: stats.lastLossAt,
            now,
        });
        if (!decision.allowed) {
            return fail('rejected', 'risk', decision.reason ?? 'The risk engine refused the entry.');
        }

        // 6. Account verification + execution mode
        if (this.mode === 'virtual') {
            if (!book.account.verified || book.account.accountType !== 'virtual') {
                return fail('halted', 'account', 'The virtual ledger is not available.');
            }
        } else {
            if (!book.account.verified || book.account.accountType !== this.mode) {
                return fail('halted', 'account', book.account.reason ?? LIVE_ACCOUNT_REQUIRED);
            }
            if (!book.account.tradePermitted) {
                return fail('halted', 'account', 'This account is not permitted to trade.');
            }
            if (!this.broker) {
                return fail('halted', 'account', 'The authenticated Deriv connection is not open — entries are blocked.');
            }
            if (book.account.balance !== null && book.account.balance < stake) {
                return fail(
                    'rejected',
                    'account',
                    `Balance ${book.account.balance.toFixed(2)} ${book.account.currency ?? ''} is below the stake ${stake}.`
                );
            }
            if (this.mode === 'real' && !book.realArmed) {
                return fail(
                    'rejected',
                    'confirmation',
                    'Real-money entries are not armed for this session — arm them in the account panel first.'
                );
            }
        }

        // 7. Contract validation — structured fields only, never a description
        if (signal.direction !== 'rise' && signal.direction !== 'fall') {
            return fail('rejected', 'contract', 'The contract direction is not Rise or Fall.');
        }
        if (!Number.isFinite(stake) || stake <= 0 || stake > book.risk.maxStake) {
            return fail('rejected', 'contract', `Stake ${stake} is not within the configured limits.`);
        }
        if (!Number.isInteger(durationTicks) || durationTicks < MIN_DURATION_TICKS || durationTicks > MAX_DURATION_TICKS) {
            return fail(
                'rejected',
                'contract',
                `Duration ${durationTicks} ticks is outside the supported ${MIN_DURATION_TICKS}–${MAX_DURATION_TICKS} range.`
            );
        }
        if (!Number.isFinite(entryTick.quote) || !Number.isFinite(entryTick.epoch)) {
            return fail('rejected', 'contract', 'The entry tick is not usable.');
        }
        const expectedCurrency = this.mode === 'virtual' ? VIRTUAL_CURRENCY : book.account.currency;
        if (!expectedCurrency || book.account.currency !== expectedCurrency) {
            return fail('rejected', 'contract', 'The account currency is not available for this entry.');
        }
        if (this.mode !== 'virtual' && durationTicks < 1) {
            return fail('rejected', 'contract', 'A live Rise/Fall contract needs at least one tick of duration.');
        }

        // 8. Build the entry record. A live entry is dispatched after this call.
        const id = `rf-${this.mode}-${book.nextId}`;
        book.nextId += 1;

        const contract: VirtualContract = {
            id,
            mode: this.mode,
            source: this.mode === 'virtual' ? 'VIRTUAL' : this.mode === 'demo' ? 'DEMO' : 'REAL',
            contractId: null,
            symbol: signal.symbol,
            direction: signal.direction,
            contractType: signal.direction === 'rise' ? 'CALL' : 'PUT',
            stake,
            currency: expectedCurrency,
            durationTicks,
            ticksRemaining: durationTicks,
            lastAppliedEpoch: entryTick.epoch,
            entryEpoch: entryTick.epoch,
            entryQuote: entryTick.quote,
            payout: null,
            awaitingBroker: this.mode !== 'virtual',
            openedAt: now,
            status: 'open',
            exitEpoch: null,
            exitQuote: null,
            profit: null,
            tie: false,
            fingerprint: signal.fingerprint,
            signalScore: Math.max(signal.riseScore, signal.fallScore),
            regime: signal.regime,
            explanation: signal.explanation,
        };

        if (this.mode === 'virtual') {
            // Virtual: the fill is simulated here; nothing is sent anywhere.
            book.openContract = contract;
            book.usedFingerprints.add(signal.fingerprint);
            this.writeOpenJournal(contract, signal, true);
            this.lastOutcome = { status: 'opened', stage: 'execution', reason: null, at: now };
            this.onChange();
            return { status: 'opened', stage: 'execution', reason: null, contract };
        }

        if (this.mode === 'real') {
            book.pendingContract = contract;
            book.pendingSignal = signal;
            this.lastOutcome = {
                status: 'confirmation-required',
                stage: 'confirmation',
                reason: 'A real-money entry is waiting for your explicit confirmation.',
                at: now,
            };
            this.onChange();
            return { status: 'confirmation-required', stage: 'confirmation', reason: null, contract };
        }

        book.openContract = contract;
        book.usedFingerprints.add(signal.fingerprint);
        this.lastOutcome = { status: 'dispatching', stage: 'execution', reason: null, at: now };
        void this.dispatchPurchase(contract, signal);
        return { status: 'opened', stage: 'execution', reason: null, contract };
    }

    /** The user's explicit approval of the pending real-money entry. */
    confirmEntry(): { ok: boolean; reason: string | null; contract: VirtualContract | null } {
        const book = this.books.real;
        const pending = book.pendingContract;
        if (!pending) return { ok: false, reason: 'No entry is waiting for confirmation.', contract: null };
        if (this.mode !== 'real') return { ok: false, reason: 'Only a Real entry needs confirmation.', contract: null };
        if (!book.realArmed) return { ok: false, reason: 'Real entries are not armed for this session.', contract: null };
        const signal = book.pendingSignal;
        if (!signal) return { ok: false, reason: 'The pending entry lost its signal and was dropped.', contract: null };

        book.pendingContract = null;
        book.pendingSignal = null;
        book.openContract = pending;
        book.usedFingerprints.add(pending.fingerprint);
        this.lastOutcome = { status: 'dispatching', stage: 'execution', reason: null, at: this.clock() };
        this.onChange();
        void this.dispatchPurchase(pending, signal);
        return { ok: true, reason: null, contract: pending };
    }

    cancelPendingEntry(reason = 'The real-money entry was cancelled — nothing was bought.'): void {
        const book = this.books[this.mode];
        if (!book.pendingContract) return;
        book.pendingContract = null;
        book.pendingSignal = null;
        this.lastOutcome = { status: 'cancelled', stage: 'confirmation', reason, at: this.clock() };
        this.onChange();
    }

    /**
     * Feeds one genuine tick to the open contract. Only the virtual ledger
     * settles on ticks; a live contract settles on Deriv's own report. A quiet
     * feed delays virtual settlement rather than inventing a price, and a
     * replayed tick is ignored.
     */
    onTick(tick: Tick): VirtualContract | null {
        const book = this.books[this.mode];
        const contract = book.openContract;
        if (!contract || contract.status !== 'open' || contract.source !== 'VIRTUAL') return null;
        if (!Number.isFinite(tick.epoch) || !Number.isFinite(tick.quote)) return null;
        if (tick.epoch <= contract.lastAppliedEpoch) return null;

        const remaining = contract.ticksRemaining - 1;
        if (remaining > 0) {
            book.openContract = { ...contract, ticksRemaining: remaining, lastAppliedEpoch: tick.epoch };
            return null;
        }

        const won =
            contract.direction === 'rise' ? tick.quote > contract.entryQuote : tick.quote < contract.entryQuote;
        const profit = won ? Number((contract.stake * VIRTUAL_PAYOUT_RATE).toFixed(2)) : -contract.stake;

        const settled: VirtualContract = {
            ...contract,
            ticksRemaining: 0,
            lastAppliedEpoch: tick.epoch,
            status: won ? 'won' : 'lost',
            exitEpoch: tick.epoch,
            exitQuote: tick.quote,
            profit,
            tie: tick.quote === contract.entryQuote,
        };

        book.openContract = null;
        this.journal.update(this.mode, contract.id, {
            status: settled.status,
            exitEpoch: settled.exitEpoch,
            exitQuote: settled.exitQuote,
            profit: settled.profit,
            tie: settled.tie,
        });

        this.lastOutcome = {
            status: settled.status,
            stage: 'execution',
            reason: `${MODE_LABELS[this.mode]} contract settled at ${tick.quote} (entry ${contract.entryQuote}) — ${
                won ? 'win' : settled.tie ? 'tie counted as a loss' : 'loss'
            }.`,
            at: this.clock(),
        };
        this.onChange();

        return settled;
    }

    /** A settlement Deriv itself reported for a live contract. */
    onContractUpdate(update: LiveContractUpdate): void {
        const book = this.books[this.mode];
        const contract = book.openContract;
        if (!contract || contract.contractId !== update.contractId) return;
        if (contract.source === 'VIRTUAL') return;

        if (update.balance !== null && book.account.verified) {
            book.account = { ...book.account, balance: update.balance };
        }

        if (update.status === 'open') {
            book.openContract = {
                ...contract,
                exitQuote: update.exitQuote ?? contract.exitQuote,
                exitEpoch: update.exitEpoch ?? contract.exitEpoch,
                profit: update.profit ?? contract.profit,
            };
            this.onChange();
            return;
        }

        const settled: VirtualContract = {
            ...contract,
            status: update.status,
            awaitingBroker: false,
            exitQuote: update.exitQuote,
            exitEpoch: update.exitEpoch,
            profit: update.profit,
            tie: update.exitQuote !== null && update.exitQuote === contract.entryQuote,
        };
        book.openContract = null;
        this.journal.update(this.mode, contract.id, {
            status: settled.status,
            exitEpoch: settled.exitEpoch,
            exitQuote: settled.exitQuote,
            profit: settled.profit,
            tie: settled.tie,
            contractId: settled.contractId,
        });

        this.lastOutcome = {
            status: settled.status,
            stage: 'execution',
            reason: `${MODE_LABELS[this.mode]} contract ${update.contractId} settled — ${
                settled.status === 'won' ? 'win' : settled.tie ? 'tie counted as a loss' : 'loss'
            } of ${Math.abs(settled.profit ?? 0).toFixed(2)} ${settled.currency}.`,
            at: this.clock(),
        };
        this.onChange();
    }

    snapshot(): EngineSnapshot {
        const modes = EXECUTION_MODES.reduce(
            (accumulator, mode) => {
                const book = this.books[mode];
                const stats = this.journal.stats(mode);
                const account =
                    mode === 'virtual'
                        ? { ...book.account, balance: Number((VIRTUAL_START_BALANCE + stats.netProfit).toFixed(2)) }
                        : book.account;

                accumulator[mode] = {
                    mode,
                    state: book.state,
                    emergency: book.emergency,
                    realArmed: book.realArmed,
                    account,
                    risk: riskSnapshot(book.risk),
                    openContract: book.openContract,
                    pendingContract: book.pendingContract,
                    stats,
                    haltReason: book.haltReason,
                } satisfies ModeSnapshot;
                return accumulator;
            },
            {} as Record<ExecutionMode, ModeSnapshot>
        );

        return { mode: this.mode, modes, lastOutcome: this.lastOutcome };
    }

    journalEntries(mode: ExecutionMode = this.mode) {
        return this.journal.entries(mode);
    }

    clearJournal(mode: ExecutionMode = this.mode): void {
        this.journal.clear(mode);
        this.onChange();
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private writeOpenJournal(
        contract: VirtualContract,
        signal: RiseFallSignal,
        estimated: boolean,
        contractId: string | null = contract.contractId
    ) {
        const book = this.books[contract.mode];
        this.journal.append(contract.mode, {
            id: contract.id,
            mode: contract.mode,
            source: contract.source,
            contractId,
            symbol: contract.symbol,
            strategyId: signal.strategyId,
            direction: contract.direction,
            durationTicks: contract.durationTicks,
            stake: contract.stake,
            currency: contract.currency,
            entryEpoch: contract.entryEpoch,
            entryQuote: contract.entryQuote,
            exitEpoch: null,
            exitQuote: null,
            status: 'open',
            profit: null,
            estimated,
            tie: false,
            signalScore: contract.signalScore,
            regime: contract.regime,
            explanation: contract.explanation,
            fingerprint: contract.fingerprint,
            riskSnapshot: riskSnapshot(book.risk),
        });
    }

    /**
     * Sends the purchase through the authenticated broker. The acknowledgement
     * decides whether the entry stands; a timeout is an UNKNOWN outcome, which
     * halts the mode instead of ever resubmitting the same order.
     */
    private async dispatchPurchase(contract: VirtualContract, signal: RiseFallSignal): Promise<void> {
        const broker = this.broker;
        if (!broker || contract.mode === 'virtual') return;

        const book = this.books[contract.mode];
        const ticket: BrokerTicket = {
            entryId: contract.id,
            mode: contract.mode,
            symbol: contract.symbol,
            contractType: contract.contractType,
            stake: contract.stake,
            currency: contract.currency,
            durationTicks: contract.durationTicks,
        };

        let result: BrokerBuyResult;
        try {
            result = await broker.buy(ticket);
        } catch (error) {
            result = {
                ok: false,
                contractId: null,
                payout: null,
                reason: (error as Error)?.message ?? 'The purchase request failed.',
                unknown: true,
            };
        }

        // The mode may have been switched or halted while the buy was in flight.
        if (book.openContract?.id !== contract.id) return;

        if (result.ok && result.contractId) {
            book.openContract = {
                ...contract,
                contractId: result.contractId,
                payout: result.payout,
                awaitingBroker: false,
            };
            this.writeOpenJournal(
                { ...contract, contractId: result.contractId, payout: result.payout, awaitingBroker: false },
                signal,
                false,
                result.contractId
            );
            this.lastOutcome = {
                status: 'opened',
                stage: 'execution',
                reason: `${MODE_LABELS[contract.mode]} contract ${result.contractId} bought for ${contract.stake} ${contract.currency}.`,
                at: this.clock(),
            };
            this.onChange();
            return;
        }

        book.openContract = null;
        if (result.unknown) {
            book.state = 'halted';
            book.haltReason =
                `UNKNOWN execution status for ${contract.id}: ${result.reason ?? 'the buy timed out'}. ` +
                'Nothing was resubmitted — check the Deriv statement before trading this mode again.';
            this.lastOutcome = { status: 'unknown', stage: 'execution', reason: book.haltReason, at: this.clock() };
            this.onChange();
            return;
        }

        this.lastOutcome = {
            status: 'rejected',
            stage: 'execution',
            reason: result.reason ?? 'Deriv refused the purchase.',
            at: this.clock(),
        };
        this.onChange();
    }
}

export type { RiskConfig };
