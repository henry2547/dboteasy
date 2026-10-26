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
 * How many of the newest ticks in a row ended in a digit above — or at or above — `threshold`.
 *
 * The run is the tail of the real tick sequence, so an intervening digit below the threshold stops
 * the count (6, 5, 9 reports 1, not 2). A threshold that is not a whole digit reports 0: nothing can
 * be measured, and an absent measurement must never look like a satisfied condition.
 */
export const highDigitRun = (digits, threshold, mode = 'at_or_above') => {
    const list = toDigitList(digits);
    const wanted = Number(threshold);
    if (!Number.isInteger(wanted)) return 0;
    const qualifies =
        mode === 'above'
            ? digit => digit > wanted
            : mode === 'below'
              ? digit => digit < wanted
              : mode === 'at_or_below'
                ? digit => digit <= wanted
                : digit => digit >= wanted;

    let run = 0;
    for (let index = list.length - 1; index >= 0; index -= 1) {
        if (!qualifies(list[index])) break;
        run += 1;
    }
    return run;
};

/** Occurrence count of every digit inside the newest `sample` ticks. */
const digitCounts = (digits, sample) => {
    const counts = new Array(10).fill(0);
    lastDigitsOfSample(digits, sample).forEach(digit => {
        counts[digit] += 1;
    });
    return counts;
};

/**
 * The digit that appeared most (hottest) or least (coldest) often in the newest `sample` ticks —
 * ties choose the lower digit, the same rule as the Digits page's green/red bar.
 */
export const hotColdDigit = (digits, sample, mode = 'hottest') => {
    const counts = digitCounts(digits, sample);
    const wants_coldest = mode === 'coldest';
    return counts.reduce(
        (best, count, digit) =>
            wants_coldest ? (count < counts[best] ? digit : best) : count > counts[best] ? digit : best,
        0
    );
};

/**
 * Where a digit's bar stands: `hottest` (green), `coldest` (red), `neutral` (neither) or `unknown`
 * when there is no tick to measure. `unknown` is deliberately distinct from `neutral` — a bar that
 * cannot be read must never be treated as an absent/neutral one.
 */
export const digitBarState = (digits, digit, sample) => {
    const window = lastDigitsOfSample(digits, sample);
    if (window.length === 0) return 'unknown';

    const wanted = Number(digit);
    if (!Number.isInteger(wanted) || wanted < 0 || wanted > 9) return 'unknown';

    if (wanted === hotColdDigit(window, window.length, 'hottest')) return 'hottest';
    if (wanted === hotColdDigit(window, window.length, 'coldest')) return 'coldest';
    return 'neutral';
};

/** True only when the digit's bar is genuinely neutral: present, and neither hottest nor coldest. */
export const isDigitBarNeutral = (digits, digit, sample) => digitBarState(digits, digit, sample) === 'neutral';

/** A digit's share of the newest `sample` ticks, in percent. 0 when the window is empty. */
export const digitShare = (digits, digit, sample) => {
    const window = lastDigitsOfSample(digits, sample);
    if (!window.length) return 0;
    const wanted = Number(digit);
    return (window.filter(value => value === wanted).length / window.length) * 100;
};

/**
 * True when every digit in `wanted` is strictly below `percent` of the newest `sample` ticks.
 *
 * Strictly below: a digit sitting exactly on the threshold does not pass, and an empty window
 * reports false (undecided) rather than a share that was never measured.
 */
export const areDigitsBelowShare = (digits, wanted, percent, sample) => {
    const window = lastDigitsOfSample(digits, sample);
    if (!window.length) return false;

    const threshold = Number(percent);
    if (!Number.isFinite(threshold)) return false;

    const list = (Array.isArray(wanted) ? wanted : [wanted]).map(value => Number(value));
    if (!list.length || list.some(digit => !Number.isInteger(digit) || digit < 0 || digit > 9)) return false;

    // Compared as counts (hits × 100 against percent × window) so a digit sitting exactly on the
    // threshold cannot slip through on a floating-point rounding error.
    return list.every(digit => window.filter(value => value === digit).length * 100 < threshold * window.length);
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
