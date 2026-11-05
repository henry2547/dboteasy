/**
 * Unit tests for the trade-sync ledger store — the persistence behind the AI
 * Bot's Transactions and Journal views.
 *
 * The ledger must survive a reload and hold the history of BOTH trading
 * accounts, so these tests exercise the save → load round-trip directly against
 * jsdom's localStorage, including the rule that an open contract is never
 * restored (which would leave a phantom position counting against
 * `maxConcurrentContracts`).
 */

import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../constants';
import { applySettlement, createPosition } from '../trade-ledger';
import { loadLedger, saveLedger } from '../trade-sync';
import type { AccountMode, ExecutionResult, JournalEntry, TradePosition, TradingSettings } from '../types';

const baseSettings: TradingSettings = { ...DEFAULT_SETTINGS, accountMode: 'demo' };

function settingsFor(accountMode: AccountMode): TradingSettings {
    return { ...baseSettings, accountMode };
}

function openPosition(contractId: number, accountMode: AccountMode = 'demo'): TradePosition {
    return createPosition({
        contractId,
        buyPrice: 1,
        payout: 1.9,
        contractType: 'DIGITOVER',
        symbol: 'R_100',
        strategyLabel: 'Over 1',
        settings: settingsFor(accountMode),
        loginid: accountMode === 'demo' ? 'VRT990001' : 'CR990002',
        openedAt: 1_700_000_000_000 + contractId,
    });
}

function settledPosition(contractId: number, accountMode: AccountMode): TradePosition {
    const result: ExecutionResult = {
        contractId,
        state: 'settled',
        buyPrice: 1,
        payout: 1.9,
        profit: 0.9,
        status: 'won',
        message: 'Contract settled: won 0.90',
        timestamp: 1_700_000_060_000 + contractId,
    };
    return applySettlement([openPosition(contractId, accountMode)], result)[0];
}

function journalLine(id: string, accountMode: AccountMode): JournalEntry {
    return {
        id,
        timestamp: 1_700_000_000_000,
        level: 'trade',
        category: 'execution',
        message: id,
        accountMode,
        loginid: accountMode === 'demo' ? 'VRT990001' : 'CR990002',
    };
}

describe('trade sync ledger', () => {
    beforeEach(() => localStorage.removeItem(STORAGE_KEYS.ledger));

    it('round-trips the settled positions and journal of BOTH accounts', () => {
        const positions = [settledPosition(990001, 'demo'), settledPosition(990002, 'real')];
        const journal = [journalLine('j_demo', 'demo'), journalLine('j_real', 'real')];

        saveLedger(positions, journal);
        const loaded = loadLedger();

        expect(loaded.positions.map(p => p.contractId).sort()).toEqual([990001, 990002]);
        expect(loaded.positions.map(p => p.accountMode).sort()).toEqual(['demo', 'real']);
        // Each line keeps the account it happened on.
        expect(loaded.journal.map(j => j.id)).toEqual(['j_demo', 'j_real']);
        expect(loaded.journal.map(j => j.accountMode)).toEqual(['demo', 'real']);
    });

    it('never restores a still-open position (no phantom open contract)', () => {
        saveLedger([openPosition(555), settledPosition(990003, 'demo')], []);

        expect(loadLedger().positions.map(p => p.contractId)).toEqual([990003]);
    });

    it('persists only settled positions', () => {
        saveLedger([openPosition(777), settledPosition(888, 'real')], []);

        const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.ledger) as string);
        expect(raw.positions.map((p: TradePosition) => p.contractId)).toEqual([888]);
    });

    it('returns an empty ledger for missing or corrupt storage', () => {
        expect(loadLedger()).toEqual({ positions: [], journal: [] });

        localStorage.setItem(STORAGE_KEYS.ledger, 'not json');
        expect(loadLedger()).toEqual({ positions: [], journal: [] });
    });

    it('caps the ledger so a long-lived one cannot grow without bound', () => {
        const positions = Array.from({ length: 220 }, (_, i) => settledPosition(1_000_000 + i, 'demo'));
        const journal = Array.from({ length: 260 }, (_, i) => journalLine(`j${i}`, 'demo'));

        saveLedger(positions, journal);
        const loaded = loadLedger();

        expect(loaded.positions).toHaveLength(200);
        expect(loaded.journal).toHaveLength(200);
        // The newest entries are the ones kept.
        expect(loaded.positions[loaded.positions.length - 1].contractId).toBe(1_000_219);
    });
});
