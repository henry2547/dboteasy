/**
 * The Even/Odd rules behind the Digits palette's Even/Odd blocks, tested without a WebSocket.
 *
 * Every number here comes from digits and tick epochs the engine genuinely received: an incomplete
 * window is never "ready", a repeated or out-of-order tick never counts twice, and a parity below the
 * threshold never becomes a signal — so nothing in this file can buy on invented data.
 */
import {
    EO_DEFAULT_PERCENT,
    EO_DEFAULT_TICKS,
    EO_EVEN,
    EO_NO_SIGNAL,
    EO_ODD,
    configureEvenOdd,
    createEvenOddState,
    evenOddSnapshot,
    feedEvenOddTick,
    invalidateEvenOdd,
    meetsThreshold,
    parityPercentages,
    rememberSignal,
    resolveSignal,
    signalKey,
    signalUsed,
    startEvenOddMonitoring,
    validateEvenOddConfig,
} from '../even-odd';

/** A monitored window fed with genuine ticks, one per epoch, newest last. */
const windowOf = (digits, { size = digits.length, symbol = 'R_100', first_epoch = 1 } = {}) =>
    digits.reduce(
        (state, digit, index) => feedEvenOddTick(state, { digit, epoch: first_epoch + index, symbol }).state,
        startEvenOddMonitoring(createEvenOddState(), size)
    );

describe('configured Even/Odd settings', () => {
    it('keeps a usable configuration untouched', () => {
        const { ok, errors, config } = validateEvenOddConfig({ ticks: 20, percent: 65, direction: 'even' });

        expect(ok).toBe(true);
        expect(errors).toEqual([]);
        expect(config).toEqual({ ticks: 20, percent: 65, direction: 'even' });
    });

    it('falls back to the documented default and reports what was unusable', () => {
        const { ok, errors, config } = validateEvenOddConfig({ ticks: 'twenty', percent: 0, direction: 'sideways' });

        expect(ok).toBe(false);
        expect(errors).toHaveLength(3);
        expect(config).toEqual({ ticks: EO_DEFAULT_TICKS, percent: EO_DEFAULT_PERCENT, direction: 'both' });
        expect(configureEvenOdd(createEvenOddState(), { ticks: 0 }).state.config.ticks).toBe(EO_DEFAULT_TICKS);
    });
});

describe('parity percentages', () => {
    it('measures the even and odd share of the window', () => {
        expect(parityPercentages([1, 2, 3, 4, 5])).toEqual({ even: 40, odd: 60, total: 5 });
    });

    it('is exact for a whole-number window, so 13 of 20 even means exactly 65%', () => {
        const digits = [...Array(13).fill(2), ...Array(7).fill(3)];

        expect(parityPercentages(digits)).toEqual({ even: 65, odd: 35, total: 20 });
    });

    it('reports nothing measured for an empty window instead of an invented share', () => {
        expect(parityPercentages([])).toEqual({ even: 0, odd: 0, total: 0 });
    });

    it('ignores values that are not a whole digit', () => {
        expect(parityPercentages([2, 3, 12, '4', 7.5]).total).toBe(3);
    });
});

describe('threshold test', () => {
    it('qualifies at the threshold and never below it', () => {
        expect(meetsThreshold(65, 65)).toBe(true);
        expect(meetsThreshold(64.9, 65)).toBe(false);
        expect(meetsThreshold(undefined, 65)).toBe(false);
    });
});

describe('signal direction', () => {
    it('signals only the configured parity, and only above the threshold', () => {
        expect(resolveSignal({ evenPercent: 70, oddPercent: 30, threshold: 65, direction: 'even' }).direction).toBe(EO_EVEN);
        expect(resolveSignal({ evenPercent: 60, oddPercent: 40, threshold: 65, direction: 'even' }).direction).toBe(
            EO_NO_SIGNAL
        );
        expect(resolveSignal({ evenPercent: 30, oddPercent: 70, threshold: 65, direction: 'odd' }).direction).toBe(EO_ODD);
        expect(resolveSignal({ evenPercent: 60, oddPercent: 40, threshold: 65, direction: 'odd' }).direction).toBe(
            EO_NO_SIGNAL
        );
    });

    it('resolves BOTH to one direction — the higher share, and EVEN on an exact tie', () => {
        const higher_odd = resolveSignal({ evenPercent: 66, oddPercent: 70, threshold: 65, direction: 'both' });
        const tie = resolveSignal({ evenPercent: 65, oddPercent: 65, threshold: 65, direction: 'both' });

        expect(higher_odd.direction).toBe(EO_ODD);
        expect(higher_odd.conflict).toBe(true);
        expect(tie.direction).toBe(EO_EVEN);
        expect(tie.conflict).toBe(true);
    });
});

describe('the rolling tick window', () => {
    it('counts one genuine tick per epoch and keeps the newest window only', () => {
        const state = windowOf([2, 4, 6, 8], { size: 3 });

        expect(state.window).toEqual([4, 6, 8]);
        expect(evenOddSnapshot(state)).toMatchObject({ ready: true, collected: 3, window: 3, evenPercent: 100 });
    });

    it('is not ready until the window is complete', () => {
        const state = windowOf([2, 4], { size: 3 });

        expect(evenOddSnapshot(state)).toMatchObject({ ready: false, collected: 2, signal: EO_NO_SIGNAL });
    });

    it('drops a repeated tick instead of counting it twice', () => {
        const state = windowOf([2, 4, 6]);
        const repeated = feedEvenOddTick(state, { digit: 6, epoch: 3, symbol: 'R_100' });

        expect(repeated.accepted).toBe(false);
        expect(repeated.reason).toBe('tick already processed');
        expect(repeated.state.window).toEqual([2, 4, 6]);
    });

    it('invalidates the window when a tick arrives out of order', () => {
        const state = windowOf([2, 4, 6]);
        const late = feedEvenOddTick(state, { digit: 8, epoch: 2, symbol: 'R_100' });

        expect(late.accepted).toBe(false);
        expect(late.state.window).toEqual([]);
        expect(late.state.stale).toBe(true);
        expect(evenOddSnapshot(late.state).ready).toBe(false);
    });

    it('never counts another market\u2019s digits towards the current window', () => {
        const state = windowOf([2, 4, 6]);
        const switched = feedEvenOddTick(state, { digit: 3, epoch: 4, symbol: 'R_50' });

        expect(switched.accepted).toBe(true);
        expect(switched.reason).toBe('market changed \u2014 window restarted');
        expect(switched.state.window).toEqual([3]);
    });

    it('never signals on a stale or disconnected feed', () => {
        const complete = windowOf([2, 4, 6]);

        expect(evenOddSnapshot(invalidateEvenOdd(complete)).ready).toBe(false);
        expect(evenOddSnapshot(complete, { connected: false }).ready).toBe(false);
    });
});

describe('one entry per signal', () => {
    const key = epoch => signalKey({ symbol: 'R_100', window: 3, threshold: 65, direction: 'both', epoch });

    it('identifies a signal by its tick, so a new tick is a new signal', () => {
        expect(key(3)).not.toBe(key(4));
        expect(key(3)).toBe(signalKey({ symbol: 'R_100', window: 3, threshold: 65, direction: 'both', epoch: 3 }));
    });

    it('remembers a used signal once', () => {
        const state = rememberSignal(createEvenOddState(), key(3));

        expect(signalUsed(state, key(3))).toBe(true);
        expect(signalUsed(state, key(4))).toBe(false);
        expect(signalUsed(rememberSignal(state, key(3)), key(3))).toBe(true);
    });
});
