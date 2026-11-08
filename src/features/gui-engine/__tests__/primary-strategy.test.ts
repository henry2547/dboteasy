import { PRIMARY_DIGIT_CEILING } from '../config';
import {
    createPrimaryRuntime,
    evaluatePrimaryTick,
    frequencyPermission,
    rejectConfirmedSetup,
} from '../primary-strategy';
import type { DigitWindowStats, PrimaryEvent, PrimaryRuntime } from '../types';

/**
 * Builds a 1,000-observation window whose digit shares are given as percentages.
 * The remaining share is spread evenly over the digits not mentioned.
 */
function statsFrom(percentByDigit: Partial<Record<number, number>>): DigitWindowStats {
    const counts = Array.from({ length: 10 }, () => 0);
    const specified = Object.keys(percentByDigit).map(Number);
    const usedPercent = specified.reduce((total, digit) => total + (percentByDigit[digit] ?? 0), 0);
    const remainingDigits = 10 - specified.length;
    const remainingPercent = remainingDigits > 0 ? (100 - usedPercent) / remainingDigits : 0;

    counts.forEach((_, digit) => {
        const percent = percentByDigit[digit] ?? remainingPercent;
        counts[digit] = Math.round((percent / 100) * 1000);
    });

    const total = counts.reduce((sum, count) => sum + count, 0);
    return { counts, percent: counts.map(count => (count / total) * 100), total };
}

const PASSING = statsFrom({ 0: 9.5, 1: 9.7 });
const FAILING_ZERO = statsFrom({ 0: 11.4, 1: 9.7 });
const FAILING_ONE = statsFrom({ 0: 9.4, 1: 12.1 });
const PASSING_HIGH = statsFrom({ 8: 9.2, 9: 10.1 });
const FAILING_EIGHT = statsFrom({ 8: 11.9, 9: 9.1 });
const FAILING_NINE = statsFrom({ 8: 9.4, 9: 13.2 });

function feed(
    runtime: PrimaryRuntime,
    digits: number[],
    stats: DigitWindowStats = PASSING
): { runtime: PrimaryRuntime; events: PrimaryEvent[] } {
    let current = runtime;
    const events: PrimaryEvent[] = [];
    digits.forEach((digit, index) => {
        const result = evaluatePrimaryTick(current, {
            digit,
            epoch: 1_700_000_000 + index,
            now: 1_700_000_000_000 + index * 1000,
            stats,
            market: 'R_100',
            marketName: 'Volatility 100 Index',
        });
        current = result.runtime;
        events.push(...result.events);
    });
    return { runtime: current, events };
}

describe('Over 1 frequency permission filter', () => {
    it('passes when both digits 0 and 1 are at or below 10.2%', () => {
        const permission = frequencyPermission('over1', PASSING);
        expect(permission.passed).toBe(true);
        expect(permission.readings.map(reading => reading.digit)).toEqual([0, 1]);
    });

    it('blocks when digit 0 alone is above the ceiling', () => {
        const permission = frequencyPermission('over1', FAILING_ZERO);
        expect(permission.passed).toBe(false);
        expect(permission.readings[0].passed).toBe(false);
        expect(permission.readings[1].passed).toBe(true);
        expect(permission.reason).toContain('digit 0');
    });

    it('blocks when digit 1 alone is above the ceiling', () => {
        const permission = frequencyPermission('over1', FAILING_ONE);
        expect(permission.passed).toBe(false);
        expect(permission.readings[1].passed).toBe(false);
    });

    it('uses the individual shares, never an average of the two', () => {
        // Digit 0 at 13% and digit 1 at 7% averages to 10%, but digit 0 fails on its own.
        const permission = frequencyPermission('over1', statsFrom({ 0: 13, 1: 7 }));
        expect(permission.passed).toBe(false);
        expect(PRIMARY_DIGIT_CEILING).toBe(10.2);
    });

    it('fails closed until the window holds 1,000 observations', () => {
        const permission = frequencyPermission('over1', { counts: [], percent: [], total: 400 });
        expect(permission.passed).toBe(false);
        expect(permission.reason).toContain('1000');
    });
});

describe('Under 8 frequency permission filter', () => {
    it('passes when digits 8 and 9 are both at or below the ceiling', () => {
        expect(frequencyPermission('under8', PASSING_HIGH).passed).toBe(true);
    });

    it('blocks on digit 8 alone', () => {
        expect(frequencyPermission('under8', FAILING_EIGHT).passed).toBe(false);
    });

    it('blocks on digit 9 alone', () => {
        expect(frequencyPermission('under8', FAILING_NINE).passed).toBe(false);
    });
});

describe('Over 1 pair detection and delayed confirmation', () => {
    it('confirms pair 10 after intervening digits 5, 6, 7 and a confirming 1', () => {
        const { events, runtime } = feed(createPrimaryRuntime('over1'), [1, 0, 5, 6, 7, 1]);

        const pair = events.find(event => event.type === 'pair');
        const confirmation = events.find(event => event.type === 'confirmation');

        expect(pair).toBeDefined();
        expect((pair as Extract<PrimaryEvent, { type: 'pair' }>).setup.pair).toBe('10');
        expect(confirmation).toBeDefined();
        const confirmed = confirmation as Extract<PrimaryEvent, { type: 'confirmation' }>;
        expect(confirmed.digit).toBe(1);
        expect(confirmed.ticksWaited).toBe(3);
        expect(confirmed.setup.interveningDigits).toEqual([5, 6, 7]);
        expect(runtime.state).toBe('CONFIRMATION_RECEIVED');
        expect(runtime.pending).toBeNull();
    });

    it('confirms pair 11 immediately with 0', () => {
        const { events } = feed(createPrimaryRuntime('over1'), [1, 1, 0]);
        const confirmation = events.find(event => event.type === 'confirmation') as
            | Extract<PrimaryEvent, { type: 'confirmation' }>
            | undefined;
        expect(confirmation?.setup.pair).toBe('11');
        expect(confirmation?.digit).toBe(0);
        expect(confirmation?.ticksWaited).toBe(0);
    });

    it('confirms pair 01 by a zero after 4, 8 and 3', () => {
        const { events } = feed(createPrimaryRuntime('over1'), [0, 1, 4, 8, 3, 0]);
        const confirmation = events.find(event => event.type === 'confirmation') as
            | Extract<PrimaryEvent, { type: 'confirmation' }>
            | undefined;
        expect(confirmation?.setup.pair).toBe('01');
        expect(confirmation?.setup.interveningDigits).toEqual([4, 8, 3]);
        expect(confirmation?.digit).toBe(0);
    });

    it('keeps the setup pending while non-confirmation digits arrive', () => {
        const { runtime } = feed(createPrimaryRuntime('over1'), [1, 0, 5, 6, 7]);
        expect(runtime.pending).not.toBeNull();
        expect(runtime.pending?.pair).toBe('10');
        expect(runtime.pending?.interveningDigits).toEqual([5, 6, 7]);
        expect(runtime.state).toBe('WAITING_FOR_CONFIRMATION');
    });

    it('never expires a setup — it waits for its confirmation digit', () => {
        // No tick limit any more: any number of intervening digits only adds to the wait.
        const { events, runtime } = feed(
            createPrimaryRuntime('over1'),
            [1, 0, 5, 6, 7, 2, 3, 4, 5, 6, 7, 8, 9, 4, 2, 6, 7, 5, 3, 4]
        );
        expect(events.some(event => event.type === 'pair')).toBe(true);
        expect(runtime.pending?.pair).toBe('10');
        expect(runtime.pending?.ticksWaited).toBe(18);
        expect(runtime.state).toBe('WAITING_FOR_CONFIRMATION');

        const confirmed = feed(runtime, [1]);
        const confirmation = confirmed.events.find(event => event.type === 'confirmation') as
            | Extract<PrimaryEvent, { type: 'confirmation' }>
            | undefined;
        expect(confirmation?.setup.pair).toBe('10');
        expect(confirmation?.ticksWaited).toBe(18);
    });

    it('never overwrites a pending setup with a newer pair', () => {
        // Pair 10 is pending. A second digit of the target group would CONFIRM it,
        // never start a new pair — that is what keeps one setup from being reused.
        const confirmed = feed(createPrimaryRuntime('over1'), [1, 0, 1, 1]);
        const events = confirmed.events.map(event => event.type);
        expect(events[0]).toBe('pair');
        expect(events[1]).toBe('confirmation');

        // A pair from outside the confirmation group can never replace it either.
        const pending = feed(createPrimaryRuntime('over1'), [1, 0, 7, 7]);
        expect(pending.runtime.pending?.pair).toBe('10');
        expect(pending.runtime.pending?.interveningDigits).toEqual([7, 7]);
        expect(pending.events.filter(event => event.type === 'pair')).toHaveLength(1);
    });

    it('never forms a pair across the engine start boundary', () => {
        // The first digit while running cannot pair with pre-start history.
        const { events } = feed(createPrimaryRuntime('over1'), [0, 1, 0]);
        const pairs = events.filter(event => event.type === 'pair') as Array<Extract<PrimaryEvent, { type: 'pair' }>>;
        expect(pairs.map(pair => pair.setup.pair)).toEqual(['01']);
    });

    it('records the frequency readings on the setup', () => {
        const { runtime } = feed(createPrimaryRuntime('over1'), [1, 0]);
        expect(runtime.pending?.frequencyAtDetection.passed).toBe(true);
        expect(runtime.pending?.frequencyAtDetection.readings).toHaveLength(2);
    });
});

describe('Frequency revalidation around a pending setup', () => {
    it('blocks a setup when the filter fails before confirmation', () => {
        let runtime = createPrimaryRuntime('over1');
        runtime = feed(runtime, [1, 0], PASSING).runtime;
        expect(runtime.pending).not.toBeNull();

        const result = evaluatePrimaryTick(runtime, {
            digit: 5,
            epoch: 1_700_000_100,
            now: 1_700_000_100_000,
            stats: FAILING_ONE,
            market: 'R_100',
            marketName: 'Volatility 100 Index',
        });

        const blocked = result.events.find(event => event.type === 'blocked') as
            | Extract<PrimaryEvent, { type: 'blocked' }>
            | undefined;
        expect(blocked?.stage).toBe('pre_confirmation');
        expect(result.runtime.pending).toBeNull();
        expect(result.runtime.state).toBe('SETUP_BLOCKED');
    });

    it('blocks new pairs while the filter is failing', () => {
        const { events, runtime } = feed(createPrimaryRuntime('over1'), [1, 0], FAILING_ZERO);
        expect(events).toHaveLength(0);
        expect(runtime.pending).toBeNull();
        expect(runtime.state).toBe('FREQUENCY_FILTER_BLOCKED');
    });

    it('consumes a confirmed setup that fails the pre-purchase revalidation', () => {
        const { runtime } = feed(createPrimaryRuntime('over1'), [1, 0, 1]);
        expect(runtime.state).toBe('CONFIRMATION_RECEIVED');
        expect(runtime.pending).toBeNull();

        // The hook passes the *pending* setup into rejectConfirmedSetup; after
        // confirmation nothing is pending, so the call must be a no-op, never a reuse.
        const unchanged = rejectConfirmedSetup(runtime, 'freq failed');
        expect(unchanged.pending).toBeNull();
        expect(unchanged.state).toBe('CONFIRMATION_RECEIVED');
    });
});

describe('Under 8 sequences', () => {
    it('confirms pair 89 after 2, 4, 5 and a confirming 8', () => {
        const { events } = feed(createPrimaryRuntime('under8'), [8, 9, 2, 4, 5, 8], PASSING_HIGH);
        const confirmation = events.find(event => event.type === 'confirmation') as
            | Extract<PrimaryEvent, { type: 'confirmation' }>
            | undefined;
        expect(confirmation?.setup.pair).toBe('89');
        expect(confirmation?.setup.interveningDigits).toEqual([2, 4, 5]);
        expect(confirmation?.digit).toBe(8);
    });

    it('confirms pair 99 immediately with 8', () => {
        const { events } = feed(createPrimaryRuntime('under8'), [9, 9, 8], PASSING_HIGH);
        const confirmation = events.find(event => event.type === 'confirmation') as
            | Extract<PrimaryEvent, { type: 'confirmation' }>
            | undefined;
        expect(confirmation?.setup.pair).toBe('99');
        expect(confirmation?.ticksWaited).toBe(0);
    });

    it('confirms pair 88 after 3, 5, 2 and a confirming 9', () => {
        const { events } = feed(createPrimaryRuntime('under8'), [8, 8, 3, 5, 2, 9], PASSING_HIGH);
        const confirmation = events.find(event => event.type === 'confirmation') as
            | Extract<PrimaryEvent, { type: 'confirmation' }>
            | undefined;
        expect(confirmation?.setup.pair).toBe('88');
        expect(confirmation?.digit).toBe(9);
    });

    it('does not detect a pair outside the Under 8 set', () => {
        const { events } = feed(createPrimaryRuntime('under8'), [1, 0, 5, 6], PASSING_HIGH);
        expect(events.filter(event => event.type === 'pair')).toHaveLength(0);
    });
});
