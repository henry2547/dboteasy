import { DEFAULT_CONFIG } from '../config';
import {
    abortRecoveryAttempt,
    activateRecovery,
    createRecoveryRuntime,
    evaluateRecoveryTick,
    markRecoveryPurchasePending,
    recoveryFrequency,
    settleRecovery,
} from '../recovery';
import type { ParityStats, RecoveryRuntime } from '../types';

function parity(evenPercent: number, total = 1000): ParityStats {
    const even = Math.round((evenPercent / 100) * total);
    const odd = total - even;
    return {
        even,
        odd,
        evenPercent: (even / total) * 100,
        oddPercent: (odd / total) * 100,
        evenDelta: (even / total) * 100 - 50,
        oddDelta: (odd / total) * 100 - 50,
        total,
        baseline: 50,
    };
}

function activated(contractId = '101'): RecoveryRuntime {
    return activateRecovery(createRecoveryRuntime(), contractId, DEFAULT_CONFIG).runtime;
}

function feed(runtime: RecoveryRuntime, digits: number[], parityStats = parity(50)) {
    let current = runtime;
    let lastSignal = null as ReturnType<typeof evaluateRecoveryTick>['signal'];
    digits.forEach(digit => {
        const result = evaluateRecoveryTick(current, { digit, parity: parityStats, config: DEFAULT_CONFIG });
        current = result.runtime;
        if (result.signal) lastSignal = result.signal;
    });
    return { runtime: current, signal: lastSignal };
}

describe('recovery activation', () => {
    it('opens evaluation exactly once per losing contract', () => {
        const first = activateRecovery(createRecoveryRuntime(), '9001', DEFAULT_CONFIG);
        expect(first.activated).toBe(true);
        expect(first.runtime.state).toBe('PRIMARY_LOSS_DETECTED');

        const second = activateRecovery(first.runtime, '9001', DEFAULT_CONFIG);
        expect(second.activated).toBe(false);
        expect(second.runtime.activatedContracts).toEqual(['9001']);
    });

    it('does not open evaluation for a different contract after the attempt limit', () => {
        const exhausted: RecoveryRuntime = { ...createRecoveryRuntime(), attempts: DEFAULT_CONFIG.maxRecoveryTrades };
        const result = activateRecovery(exhausted, '9002', DEFAULT_CONFIG);
        expect(result.activated).toBe(false);
        expect(result.runtime.state).toBe('RECOVERY_LIMIT_REACHED');
    });

    it('ignores ticks when recovery is not active', () => {
        const { signal } = feed(createRecoveryRuntime(), [2, 4]);
        expect(signal).toBeNull();
    });
});

describe('Even/Odd parity patterns', () => {
    it('two consecutive even digits select the ODD contract', () => {
        const { signal } = feed(activated(), [2, 4]);
        expect(signal?.pattern).toBe('even_even');
        expect(signal?.direction).toBe('ODD');
    });

    it('two consecutive odd digits select the EVEN contract', () => {
        const { signal } = feed(activated(), [3, 5]);
        expect(signal?.pattern).toBe('odd_odd');
        expect(signal?.direction).toBe('EVEN');
    });

    it('a mixed parity pair never triggers a recovery entry', () => {
        const { signal, runtime } = feed(activated(), [2, 3]);
        expect(signal).toBeNull();
        expect(runtime.state).toBe('WAITING_FOR_EVEN_ODD_PATTERN');
    });

    it('only consecutive genuine ticks count', () => {
        // 2 then 5 then 4: the even digits are not consecutive.
        const { signal } = feed(activated(), [2, 5, 4]);
        expect(signal).toBeNull();
    });

    it('needs two ticks observed after activation', () => {
        // The first digit while active cannot pair with pre-activation history.
        const { signal } = feed(activated(), [4]);
        expect(signal).toBeNull();
    });
});

describe('recovery frequency filter', () => {
    it('is always eligible when disabled, while still reporting both shares', () => {
        const frequency = recoveryFrequency('ODD', parity(70), {
            ...DEFAULT_CONFIG,
            recoveryFilterEnabled: false,
        });
        expect(frequency.eligible).toBe(true);
        expect(frequency.enabled).toBe(false);
        expect(frequency.evenPercent).toBeCloseTo(70, 5);
        expect(frequency.oddPercent).toBeCloseTo(30, 5);
    });

    it('blocks an ODD contract while the even share is above its ceiling', () => {
        const frequency = recoveryFrequency('ODD', parity(60), { ...DEFAULT_CONFIG, maxEvenPercent: 52 });
        expect(frequency.eligible).toBe(false);
        expect(frequency.reason).toContain('even share');
    });

    it('blocks an EVEN contract while the odd share is above its ceiling', () => {
        const frequency = recoveryFrequency('EVEN', parity(45), { ...DEFAULT_CONFIG, maxOddPercent: 52 });
        expect(frequency.eligible).toBe(false);
    });

    it('passes when the losing side is at or below the configured ceiling', () => {
        expect(recoveryFrequency('ODD', parity(50), DEFAULT_CONFIG).eligible).toBe(true);
        expect(recoveryFrequency('EVEN', parity(52), DEFAULT_CONFIG).eligible).toBe(true);
    });

    it('carries the eligibility result on the signal', () => {
        const { signal } = feed(activated(), [2, 4], parity(70));
        expect(signal?.pattern).toBe('even_even');
        expect(signal?.frequency.eligible).toBe(false);
        expect(signal?.frequency.reason).toBeTruthy();
    });
});

describe('a recovery entry that never reaches a purchase', () => {
    it('records why it did not buy and keeps the leg monitoring', () => {
        const pending = markRecoveryPurchasePending(activated());
        expect(pending.state).toBe('RECOVERY_PURCHASE_PENDING');

        // A blocked purchase (open contract, stake cap, disconnect) has to clear the
        // pending state at once, with its reason visible in the recovery monitor.
        const released = abortRecoveryAttempt(pending, 'Open-contract limit reached (1/1).');
        expect(released.state).toBe('WAITING_FOR_EVEN_ODD_PATTERN');
        expect(released.active).toBe(true);
        expect(released.lastReason).toBe('Open-contract limit reached (1/1).');
        expect(released.previousDigit).toBeNull();
        // The next two parity digits can still enter.
        expect(feed(released, [2, 4]).signal?.direction).toBe('ODD');
    });
});

describe('finite recovery sequence', () => {
    it('a recovery win resets the attempt counters and closes the episode', () => {
        const state: RecoveryRuntime = { ...activated(), attempts: 2, consecutiveLosses: 4 };
        const result = settleRecovery(state, 'won', DEFAULT_CONFIG);
        expect(result.runtime.state).toBe('RECOVERY_WON');
        expect(result.runtime.active).toBe(false);
        expect(result.runtime.attempts).toBe(0);
        expect(result.runtime.consecutiveLosses).toBe(0);
        expect(result.limitReached).toBe(false);
    });

    it('a recovery loss consumes one attempt and keeps monitoring while attempts remain', () => {
        const result = settleRecovery(activated(), 'lost', { ...DEFAULT_CONFIG, maxRecoveryTrades: 3 });
        expect(result.runtime.state).toBe('RECOVERY_LOST');
        expect(result.runtime.attempts).toBe(1);
        expect(result.runtime.active).toBe(true);
        expect(result.limitReached).toBe(false);
    });

    it('stops at the configured recovery limit instead of looping forever', () => {
        const state: RecoveryRuntime = { ...activated(), attempts: 2 };
        const result = settleRecovery(state, 'lost', { ...DEFAULT_CONFIG, maxRecoveryTrades: 3 });
        expect(result.runtime.state).toBe('RECOVERY_LIMIT_REACHED');
        expect(result.runtime.active).toBe(false);
        expect(result.limitReached).toBe(true);
    });
});
