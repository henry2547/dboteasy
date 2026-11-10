/**
 * Central Rise/Fall execution service — the one account-aware path to an entry.
 *
 * Every entry, from every strategy and every future Blockly block, passes these
 * checks in this order: engine state → signal → duplicate guard → market-data
 * integrity → risk engine → account verification → contract validation → entry.
 *
 * Virtual mode simulates fills against genuine ticks: no purchase is sent to
 * Deriv and the record says so (`source: 'VIRTUAL'`, `contractId: null`). Demo
 * and Real purchases live in later phases of the brief; until they are wired the
 * service refuses them explicitly instead of pretending a trade happened.
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
    EngineSnapshot,
    EngineState,
    EntryStage,
    ExecutionMode,
    MarketIntegrity,
    ModeSnapshot,
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

/** Honest, explicit phase gates for the two purchase modes. */
const PHASE_GATE: Record<Exclude<ExecutionMode, 'virtual'>, string> = {
    demo: 'Demo purchases are Phase B of the brief and are not wired in this build — the account was not verified and no purchase was sent to Deriv.',
    real: 'Real-money execution is locked: the Phase E activation gates are not implemented — no account was verified and no purchase was sent to Deriv.',
};

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
    | { status: 'opened'; stage: 'execution'; reason: null; contract: VirtualContract };

interface ModeBook {
    state: EngineState;
    emergency: boolean;
    haltReason: string | null;
    account: AccountVerification;
    risk: RiskConfig;
    openContract: VirtualContract | null;
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
    const account =
        mode === 'virtual'
            ? virtualAccount(now)
            : unverifiedAccount(
                  mode,
                  mode === 'demo'
                      ? 'No Demo account is verified in this build (Phase B).'
                      : 'No Real account is verified in this build (Phase E).'
              );

    return {
        state: 'idle',
        emergency: false,
        haltReason: null,
        account,
        risk: { ...DEFAULT_RISK[mode] },
        openContract: null,
        usedFingerprints: new Set<string>(),
        nextId: 1,
    };
}

export interface ExecutionServiceOptions {
    journal?: RiseFallJournal;
    clock?: () => number;
}

export class RiseFallExecutionService {
    private readonly journal: RiseFallJournal;
    private readonly clock: () => number;
    private readonly books: Record<ExecutionMode, ModeBook>;
    private mode: ExecutionMode = 'virtual';
    private lastOutcome: EngineSnapshot['lastOutcome'] = null;

    constructor(options: ExecutionServiceOptions = {}) {
        this.journal = options.journal ?? new RiseFallJournal();
        this.clock = options.clock ?? (() => Date.now());
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

    /**
     * Switching stops new entries. An open contract belongs to the mode that
     * opened it, so the switch is refused until it has settled.
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
        return { ok: true, reason: null };
    }

    setRisk(patch: Partial<RiskConfig>): RiskConfig {
        const book = this.books[this.mode];
        book.risk = sanitiseRiskConfig(patch, book.risk);
        return { ...book.risk };
    }

    /** Called by the auth layer. An identity change halts new entries. */
    verifyAccount(mode: ExecutionMode, verification: Omit<AccountVerification, 'mode'>): void {
        const book = this.books[mode];
        if (mode === 'virtual') return;

        const previous = book.account.maskedLoginId;
        const next = { ...verification, mode };
        book.account = next;

        if (previous && next.maskedLoginId && previous !== next.maskedLoginId) {
            book.haltReason = 'The authorized account changed — new entries are halted until the account is re-verified.';
            book.state = 'halted';
        }
    }

    start(): { ok: boolean; reason: string | null } {
        const book = this.books[this.mode];
        if (book.emergency) {
            return { ok: false, reason: 'Emergency stop is engaged — release it before starting again.' };
        }
        if (book.haltReason) {
            return { ok: false, reason: book.haltReason };
        }
        if (book.state === 'paused') {
            book.state = 'running';
            return { ok: true, reason: null };
        }
        book.state = 'running';
        return { ok: true, reason: null };
    }

    pause(): void {
        const book = this.books[this.mode];
        if (book.state === 'running') book.state = 'paused';
    }

    /** Stop the bot: no new entries. An open contract keeps being monitored. */
    stop(): void {
        const book = this.books[this.mode];
        book.state = 'stopped';
    }

    /** Emergency stop: halts this mode and keeps monitoring its open contract. */
    emergencyStop(): void {
        const book = this.books[this.mode];
        book.emergency = true;
        book.state = 'halted';
        book.haltReason = 'Emergency stop engaged by the user.';
    }

    releaseEmergencyStop(): void {
        const book = this.books[this.mode];
        book.emergency = false;
        book.haltReason = null;
        book.state = 'idle';
    }

    clearHalt(): void {
        const book = this.books[this.mode];
        if (book.emergency) return;
        book.haltReason = null;
        book.state = 'idle';
    }

    openContractAnywhere(): VirtualContract | null {
        const found = EXECUTION_MODES.map(mode => this.books[mode].openContract).find(Boolean);
        return found ?? null;
    }

    enter(request: EntryRequest): EntryOutcome {
        const book = this.books[this.mode];
        const { signal, stake, durationTicks, entryTick, integrity, now } = request;

        const fail = (status: 'rejected' | 'halted', stage: EntryStage, reason: string): EntryOutcome => {
            this.lastOutcome = { status, stage, reason, at: now };
            return { status, stage, reason } as EntryOutcome;
        };

        // 1. Engine state
        if (book.emergency) return fail('halted', 'execution', 'Emergency stop is engaged.');
        if (book.haltReason) return fail('halted', 'account', book.haltReason);
        if (book.state !== 'running') return fail('halted', 'execution', 'The engine is not running.');
        if (book.openContract) return fail('halted', 'execution', 'A contract is already open.');

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

        // 3. Duplicate-entry guard: one entry per tick per direction
        if (book.usedFingerprints.has(signal.fingerprint)) {
            return fail('rejected', 'duplicate', 'This signal has already been acted on — no duplicate entry.');
        }

        // 4. Market-data integrity
        if (!integrity.healthy) {
            return fail('rejected', 'market-data', integrity.issue ?? 'Market data is not healthy.');
        }

        // 5. Risk engine
        const stats = this.journal.stats(this.mode);
        const open = book.openContract;
        const decision = evaluateRisk(book.risk, {
            sessionPnl: stats.netProfit,
            sessionPeakPnl: stats.netProfit + stats.maxDrawdown,
            consecutiveLosses: stats.consecutiveLosses,
            tradesTaken: stats.trades,
            openContracts: open ? 1 : 0,
            exposure: open ? open.stake : 0,
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
            if (!book.account.verified || !book.account.tradePermitted) {
                return fail(
                    'halted',
                    'account',
                    `${PHASE_GATE[this.mode]} ${book.account.reason ?? ''}`.trim()
                );
            }
            return fail('halted', 'account', PHASE_GATE[this.mode]);
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
        if (book.account.currency !== VIRTUAL_CURRENCY) {
            return fail('rejected', 'contract', 'The ledger currency does not match the account currency.');
        }

        // 8. Record the simulated entry. Nothing was purchased on Deriv.
        const id = `rf-${this.mode}-${book.nextId}`;
        book.nextId += 1;

        const contract: VirtualContract = {
            id,
            mode: this.mode,
            source: 'VIRTUAL',
            contractId: null,
            symbol: signal.symbol,
            direction: signal.direction,
            contractType: signal.direction === 'rise' ? 'CALL' : 'PUT',
            stake,
            currency: VIRTUAL_CURRENCY,
            durationTicks,
            ticksRemaining: durationTicks,
            lastAppliedEpoch: entryTick.epoch,
            entryEpoch: entryTick.epoch,
            entryQuote: entryTick.quote,
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

        book.openContract = contract;
        book.usedFingerprints.add(signal.fingerprint);
        this.journal.append(this.mode, {
            id,
            mode: this.mode,
            source: 'VIRTUAL',
            contractId: null,
            symbol: contract.symbol,
            strategyId: signal.strategyId,
            direction: contract.direction,
            durationTicks,
            stake,
            currency: VIRTUAL_CURRENCY,
            entryEpoch: contract.entryEpoch,
            entryQuote: contract.entryQuote,
            exitEpoch: null,
            exitQuote: null,
            status: 'open',
            profit: null,
            estimated: true,
            tie: false,
            signalScore: contract.signalScore,
            regime: contract.regime,
            explanation: contract.explanation,
            fingerprint: contract.fingerprint,
            riskSnapshot: riskSnapshot(book.risk),
        });

        this.lastOutcome = { status: 'opened', stage: 'execution', reason: null, at: now };
        return { status: 'opened', stage: 'execution', reason: null, contract };
    }

    /**
     * Feeds one genuine tick to the open contract. Settlement happens only when
     * the promised number of ticks has actually arrived — a quiet feed delays
     * settlement rather than inventing a price, and a replayed tick is ignored.
     */
    onTick(tick: Tick): VirtualContract | null {
        const book = this.books[this.mode];
        const contract = book.openContract;
        if (!contract || contract.status !== 'open') return null;
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

        return settled;
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
                    account,
                    risk: riskSnapshot(book.risk),
                    openContract: book.openContract,
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
    }
}

export type { RiskConfig };
