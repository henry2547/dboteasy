/**
 * The session rules behind the execution, control and reporting blocks. Pure functions only: no
 * socket, no engine, no clock.
 */
import {
    createSessionState,
    journalLevel,
    lastTradeResult,
    normalizeStopReason,
    recordSessionEntry,
    recordSessionSettlement,
    sessionSummary,
    tradeLimitReached,
} from '../session-control';

describe('session control rules', () => {
    it('starts empty instead of reporting a result that never happened', () => {
        const state = createSessionState();

        expect(state.bought).toBe(0);
        expect(state.settled).toBe(0);
        expect(lastTradeResult(state)).toBe('');
        expect(sessionSummary(state)).toContain('no contracts taken yet');
    });

    it('counts a contract when it is bought, before it settles', () => {
        const state = recordSessionEntry(createSessionState());

        expect(state.bought).toBe(1);
        expect(state.settled).toBe(0);
        expect(lastTradeResult(state)).toBe('');
    });

    it('records the settlement the engine booked, flat contracts counting as losses', () => {
        let state = recordSessionEntry(createSessionState());
        state = recordSessionSettlement(state, { profit: 2.5, stake: 1 });
        state = recordSessionSettlement(state, { profit: 0, stake: 1 });

        expect(state.settled).toBe(2);
        expect(state.wins).toBe(1);
        expect(state.losses).toBe(1);
        expect(state.profit).toBe(2.5);
        expect(lastTradeResult(state)).toBe('loss');
        expect(state.last_profit).toBe(0);
    });

    it('reports the market, the counts and the profit of the run', () => {
        let state = recordSessionEntry(createSessionState());
        state = recordSessionSettlement(state, { profit: 5, stake: 1 });

        const summary = sessionSummary(state, { symbol: 'R_100', currency: 'USD', open: 0 });

        expect(summary).toBe('Session on R_100: 1 contract(s) taken · 1 settled · 1W/0L · profit 5.00 USD · 0 open.');
    });

    it('treats a limit of 0 as not set and only counts contracts really taken', () => {
        let state = createSessionState();
        state = recordSessionEntry(state);
        state = recordSessionEntry(state);

        expect(tradeLimitReached(state, 0)).toBe(false);
        expect(tradeLimitReached(state, 2)).toBe(true);
        expect(tradeLimitReached(state, 3)).toBe(false);
    });

    it('always has a readable stop reason and a known journal level', () => {
        expect(normalizeStopReason('  ')).toBe('Stopped by the program.');
        expect(normalizeStopReason('  Target reached ')).toBe('Target reached');
        expect(journalLevel('warn')).toBe('warn');
        expect(journalLevel('shout')).toBe('info');
        expect(journalLevel(undefined)).toBe('info');
    });
});
