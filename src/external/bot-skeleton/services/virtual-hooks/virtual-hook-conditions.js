/**
 * Condition evaluation of the Virtual Hook language.
 *
 * Pure functions over genuine tick data: a condition never invents a tick, a frequency or a
 * pattern. When the data is not there the condition is not met, and the reason says why.
 */

/** Parse a comma/space separated digit list ("0,0,1" or "0 0 1"). */
export const parseDigits = value =>
    String(value ?? '')
        .split(/[^0-9]+/)
        .filter(part => part.length === 1)
        .map(Number);

const digitOf = value => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 9 ? number : null;
};

const frequencyOf = (ctx, digit, sample) => {
    const size = Math.max(1, Math.floor(Number(sample) || 100));
    const window = ctx.digits.slice(-size);
    if (!window.length) return { percent: null, window: [] };
    const hits = window.filter(value => value === digit).length;
    return { percent: (hits / window.length) * 100, window };
};

const shareOf = (ctx, digits, sample) => {
    const size = Math.max(1, Math.floor(Number(sample) || 100));
    const window = ctx.digits.slice(-size);
    if (!window.length) return null;
    const hits = window.filter(value => digits.includes(value)).length;
    return (hits / window.length) * 100;
};

const fail = reason => ({ passed: false, reason, pattern: null });
const pass = (reason, pattern = null) => ({ passed: true, reason, pattern });

/**
 * @param {import('./virtual-hook-types').VirtualHookConditionConfig} config
 * @param {import('./virtual-hook-types').VirtualHookDataContext} ctx
 * @returns {import('./virtual-hook-types').VirtualHookConditionResult}
 */
export const evaluateVirtualHookCondition = (config, ctx) => {
    if (!config) return pass('No condition configured.');
    const digits = Array.isArray(ctx?.digits) ? ctx.digits : [];
    const lastDigit = digits.length ? digits[digits.length - 1] : null;

    switch (config.type) {
        case 'feed_valid': {
            if (!ctx.validTicks) return fail('No valid tick has been received yet.');
            if (lastDigit === null) return fail('The feed has not produced a usable last digit.');
            return pass(`${ctx.symbol || 'Market'} feed is valid; last digit ${lastDigit}.`);
        }

        case 'min_valid_ticks': {
            const required = Math.max(1, Math.floor(Number(config.count) || 1));
            return ctx.validTicks >= required
                ? pass(`${ctx.validTicks} valid tick(s) received (needed ${required}).`)
                : fail(`Only ${ctx.validTicks} valid tick(s) received; ${required} are needed.`);
        }

        case 'last_digit_equals': {
            const digit = digitOf(config.digit);
            if (digit === null) return fail('The condition has no digit configured.');
            if (lastDigit === null) return fail('No last digit has been received yet.');
            return lastDigit === digit
                ? pass(`Last digit is ${lastDigit}.`, [lastDigit])
                : fail(`Last digit is ${lastDigit}, not ${digit}.`);
        }

        case 'last_digit_in_set': {
            const set = config.digits ?? [];
            if (!set.length) return fail('The digit set is empty.');
            if (lastDigit === null) return fail('No last digit has been received yet.');
            return set.includes(lastDigit)
                ? pass(`Last digit ${lastDigit} is in the set ${set.join(',')}.`, [lastDigit])
                : fail(`Last digit ${lastDigit} is not in the set ${set.join(',')}.`);
        }

        case 'consecutive_match': {
            const count = Math.max(2, Math.floor(Number(config.count) || 2));
            const wanted = digitOf(config.digit);
            if (digits.length < count) return fail(`Only ${digits.length} digit(s) received; ${count} are needed.`);
            const tail = digits.slice(-count);
            const allSame = tail.every(value => value === tail[0]);
            if (!allSame) return fail(`Last ${count} digits are ${tail.join(',')}, not a run.`);
            if (wanted !== null && tail[0] !== wanted) {
                return fail(`Run of ${tail[0]} is not the configured digit ${wanted}.`);
            }
            return pass(`${count} consecutive ${tail[0]} digits: ${tail.join(',')}.`, tail);
        }

        case 'confirm_sequence': {
            const sequence = config.sequence ?? [];
            if (sequence.length < 2) return fail('The confirmation sequence needs at least two digits.');
            if (digits.length < sequence.length) {
                return fail(`Only ${digits.length} digit(s) received; the sequence needs ${sequence.length}.`);
            }
            const tail = digits.slice(-sequence.length);
            const matches = tail.every((value, index) => value === sequence[index]);
            return matches
                ? pass(`Sequence ${sequence.join(',')} completed.`, tail)
                : fail(`Last ${sequence.length} digits are ${tail.join(',')}, not ${sequence.join(',')}.`);
        }

        case 'frequency_above':
        case 'frequency_below': {
            const digit = digitOf(config.digit);
            if (digit === null) return fail('The condition has no digit configured.');
            const threshold = Number(config.threshold);
            if (!Number.isFinite(threshold)) return fail('The condition has no percentage threshold configured.');
            const { percent, window } = frequencyOf(ctx, digit, config.sample);
            if (percent === null) return fail('No ticks are available for the frequency window.');
            const reading = `${digit} is ${percent.toFixed(2)}% of the last ${window.length} tick(s)`;
            if (config.type === 'frequency_above') {
                return percent > threshold
                    ? pass(`${reading}, above ${threshold}%.`)
                    : fail(`${reading}, not above ${threshold}%.`);
            }
            return percent < threshold
                ? pass(`${reading}, below ${threshold}%.`)
                : fail(`${reading}, not below ${threshold}%.`);
        }

        case 'losing_set_below': {
            const set = config.digits ?? [];
            if (!set.length) return fail('The digit set is empty.');
            const threshold = Number(config.threshold);
            if (!Number.isFinite(threshold)) return fail('The condition has no percentage threshold configured.');
            const share = shareOf(ctx, set, config.sample);
            if (share === null) return fail('No ticks are available for the frequency window.');
            return share < threshold
                ? pass(`Digits ${set.join(',')} are ${share.toFixed(2)}% of the window, below ${threshold}%.`)
                : fail(`Digits ${set.join(',')} are ${share.toFixed(2)}% of the window, not below ${threshold}%.`);
        }

        default:
            return fail(`Unsupported condition "${config.type}".`);
    }
};
