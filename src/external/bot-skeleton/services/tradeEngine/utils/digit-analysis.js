/**
 * Digit-window analysis behind the Digits blocks: how long a digit has been away, its longest run,
 * parity share, digit-to-digit transitions and how often the newest digit repeats the previous one.
 *
 * Pure functions over a plain list of last digits, so the rules are measurable without a WebSocket
 * and every block reports a number computed from ticks the engine genuinely received. Nothing here
 * predicts a next digit or scores a market.
 */

/** Digits only, as whole numbers 0–9 — anything else in the list is ignored. */
const toDigitList = digits => {
    if (!Array.isArray(digits)) return [];
    return digits
        .map(value => Number(value))
        .filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9);
};

/**
 * The newest `sample` digits. A sample larger than the loaded history simply uses what exists, and
 * an unusable sample falls back to 100 — the same convention as the other digit blocks.
 */
export const lastDigitsOfSample = (digits, sample) => {
    const size = Math.max(1, Number(sample) || 100);
    return toDigitList(digits).slice(-size);
};

/**
 * How many ticks ago the digit last appeared. 0 means the newest tick ended in it; -1 means it did
 * not appear in the loaded ticks at all, which is reported instead of pretending it just appeared.
 */
export const digitGap = (digits, digit) => {
    const list = toDigitList(digits);
    const wanted = Number(digit);
    for (let index = list.length - 1; index >= 0; index -= 1) {
        if (list[index] === wanted) return list.length - 1 - index;
    }
    return -1;
};

/** Longest run of consecutive ticks ending in the digit. 0 when the digit never appeared. */
export const longestDigitRun = (digits, digit) => {
    const wanted = Number(digit);
    let best = 0;
    let current = 0;
    toDigitList(digits).forEach(value => {
        current = value === wanted ? current + 1 : 0;
        if (current > best) best = current;
    });
    return best;
};

/** Share of even (0, 2, 4, 6, 8) or odd (1, 3, 5, 7, 9) digits, in percent. 0 when empty. */
export const parityShare = (digits, parity) => {
    const list = toDigitList(digits);
    if (!list.length) return 0;
    const wants_odd = parity === 'odd';
    const hits = list.filter(digit => (digit % 2 === 1) === wants_odd).length;
    return (hits / list.length) * 100;
};

/** How often `from` was immediately followed by `to` on the next tick. */
export const transitionCount = (digits, from, to) => {
    const list = toDigitList(digits);
    const source = Number(from);
    const target = Number(to);
    let count = 0;
    for (let index = 0; index < list.length - 1; index += 1) {
        if (list[index] === source && list[index + 1] === target) count += 1;
    }
    return count;
};

/**
 * Share of ticks whose digit equals the previous tick's digit, in percent. The first tick has no
 * predecessor, so a window below two ticks has nothing to measure and reports 0.
 */
export const repeatShare = (digits, sample) => {
    const list = lastDigitsOfSample(digits, sample);
    if (list.length < 2) return 0;
    let repeats = 0;
    for (let index = 1; index < list.length; index += 1) {
        if (list[index] === list[index - 1]) repeats += 1;
    }
    return (repeats / (list.length - 1)) * 100;
};
