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

/**
 * True when the digit does not carry the red (coldest) bar. A bar that cannot be read — no ticks
 * yet — is `unknown`, which answers false: an unreadable bar is never treated as "not cold".
 */
export const hasNoRedBar = (digits, digit, sample) => {
    const state = digitBarState(digits, digit, sample);
    return state === 'hottest' || state === 'neutral';
};

/**
 * True when the digit carries the red (coldest) bar of the newest `sample` ticks — the inverse of
 * `hasNoRedBar`. A bar that cannot be read answers false, so an unreadable bar never looks cold.
 */
export const hasRedBar = (digits, digit, sample) => digitBarState(digits, digit, sample) === 'coldest';

/** The fair share of one digit on a ten-digit wheel, in percent. */
const FAIR_SHARE_PERCENT = 10;

/**
 * The cold-share ceiling bots 8 and 9 really gate on, adapted to the window they are reading.
 *
 * The configured ceiling is never loosened; it is TIGHTENED by how much more lopsided the newest
 * `sample` ticks are than a fair ten-digit wheel would be (the spread of the ten shares against the
 * spread chance alone produces). A calm window leaves the ceiling as configured, a lopsided one makes
 * the bot demand colder digits before it trades. `null` means nothing could be read — the caller must
 * fail closed rather than trade on a parameter it never measured.
 */
export const adaptiveShareLimit = (digits, percent, sample) => {
    const ceiling = Number(percent);
    if (!Number.isFinite(ceiling) || ceiling <= 0) return null;

    const window = lastDigitsOfSample(digits, sample);
    if (!window.length) return null;

    const counts = new Array(10).fill(0);
    window.forEach(digit => {
        counts[digit] += 1;
    });

    const mean = window.length / 10;
    const variance = counts.reduce((total, count) => total + (count - mean) ** 2, 0) / 10;
    const shareSpread = (Math.sqrt(variance) / window.length) * 100;

    const chance = FAIR_SHARE_PERCENT / 100;
    const fairSpread = 100 * Math.sqrt((chance * (1 - chance)) / window.length);

    // Half of the excess spread tightens the ceiling; a fair window tightens it by nothing.
    const tightening = Math.max(0, shareSpread - fairSpread) * 0.5;
    const floor = Math.min(ceiling, 5);
    const limit = Math.min(ceiling, Math.max(floor, ceiling - tightening));
    return Math.round(limit * 10) / 10;
};

/** The two losing-digit pairs the Over 1 / Under 8 setups wait for: the low 0–1 and the high 8–9. */
export const DIGIT_SETS = { '0_1': [0, 1], '8_9': [8, 9] };

/**
 * How many of the newest ticks in a row ended in a digit from `set` (`'0_1'` or `'8_9'`).
 *
 * The run is the tail of the real tick sequence, so any other digit in between stops it — 0, 0, 1
 * reports 3, while 1, 5, 0 reports 1. An unknown set measures nothing and reports 0.
 */
export const digitsInSetRun = (digits, set) => {
    const allowed = DIGIT_SETS[set];
    if (!allowed) return 0;

    const list = toDigitList(digits);
    let run = 0;
    for (let index = list.length - 1; index >= 0; index -= 1) {
        if (!allowed.includes(list[index])) break;
        run += 1;
    }
    return run;
};

/**
 * True when the newest tick confirms a losing-pair setup: the last two digits were a pair from
 * `set` and the newest tick ended in `set` too.
 *
 * Other digits may pass between the pair and its confirmation — 0, 1, 5, 4, 1 is a confirmed pair —
 * but a digit from `set` inside that gap uses the pattern up, so the two most recent in-set ticks
 * before the confirmation have to sit next to each other. 0, 1 alone (no confirmation yet) and
 * 0, 0, 5, 1, 0 (the 1 already confirmed the pair) both answer false.
 */
export const pairConfirmation = (digits, set) => {
    const allowed = DIGIT_SETS[set];
    if (!allowed) return false;

    const list = toDigitList(digits);
    if (list.length < 3 || !allowed.includes(list[list.length - 1])) return false;

    const in_set = [];
    for (let index = list.length - 2; index >= 0 && in_set.length < 2; index -= 1) {
        if (allowed.includes(list[index])) in_set.push(index);
    }
    return in_set.length === 2 && in_set[0] - in_set[1] === 1;
};

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
