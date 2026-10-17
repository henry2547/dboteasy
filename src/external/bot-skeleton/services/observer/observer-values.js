/**
 * Pure digit maths for the observer runtime.
 *
 * Digits are always chronological: index 0 is the oldest tick, the last item is the newest.
 * Nothing here invents data — `NaN` / `null` mean "not enough genuine ticks yet", which the
 * runtime reports as Inconclusive instead of a guess.
 */

/** Digits of a comma/space separated field, e.g. `0,1,2` (never more than 1000). */
export const parseDigits = value =>
    String(value ?? '')
        .split(/[^0-9]+/)
        .filter(part => part !== '')
        .map(Number)
        .slice(0, 1000);

export const lastDigit = digits => (digits.length ? Number(digits[digits.length - 1]) : null);

/** Nth tick back: 0 is the newest, 1 the one before it. */
export const digitAgo = (digits, ticks_ago = 1) => {
    const index = digits.length - 1 - Math.max(0, Math.trunc(Number(ticks_ago) || 0));
    return index >= 0 ? Number(digits[index]) : null;
};

export const windowOf = (digits, size) => digits.slice(-Math.max(1, Math.trunc(Number(size) || 1)));

export const countOf = (digits, digit) => digits.filter(value => Number(value) === Number(digit)).length;

export const percentage = (hits, total) => (total > 0 ? (hits / total) * 100 : NaN);

export const frequencyOf = (digits, digit) => percentage(countOf(digits, digit), digits.length);

export const combinedFrequency = (digits, list) =>
    percentage(
        digits.filter(value => list.includes(Number(value))).length,
        digits.length
    );

export const isEven = digit => Number(digit) % 2 === 0;

export const parityOf = digit => (isEven(digit) ? 'Even' : 'Odd');

export const parityFrequency = (digits, parity) => {
    const wanted = String(parity).toLowerCase() === 'even';
    return percentage(
        digits.filter(value => isEven(value) === wanted).length,
        digits.length
    );
};

export const countsPerDigit = digits => {
    const counts = new Array(10).fill(0);
    digits.forEach(value => {
        const digit = Number(value);
        if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit] += 1;
    });
    return counts;
};

/** Ties choose the lower digit, so the answer is stable for a given window. */
export const mostFrequentDigit = digits => {
    if (!digits.length) return null;
    const counts = countsPerDigit(digits);
    return counts.reduce((best, count, digit) => (count > counts[best] ? digit : best), 0);
};

export const leastFrequentDigit = digits => {
    if (!digits.length) return null;
    const counts = countsPerDigit(digits);
    return counts.reduce((worst, count, digit) => (count < counts[worst] ? digit : worst), 0);
};

export const currentStreak = digits => {
    if (!digits.length) return { digit: null, length: 0 };
    const digit = lastDigit(digits);
    let length = 0;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
        if (Number(digits[index]) !== digit) break;
        length += 1;
    }
    return { digit, length };
};

export const longestRun = (digits, matches) => {
    let best = 0;
    let run = 0;
    digits.forEach(value => {
        run = matches(Number(value)) ? run + 1 : 0;
        best = Math.max(best, run);
    });
    return best;
};

/** Longest run of one repeating digit anywhere in the window. */
export const longestDigitStreak = digits => {
    let best = 0;
    let run = 0;
    let previous = null;
    digits.forEach(value => {
        const digit = Number(value);
        run = digit === previous ? run + 1 : 1;
        previous = digit;
        best = Math.max(best, run);
    });
    return best;
};

export const longestRunOfDigit = (digits, digit) => longestRun(digits, value => value === Number(digit));

/** Every adjacent A -> B pair, counted over the whole window. */
export const transitionStats = (digits, from, to) => {
    let observations = 0;
    let hits = 0;
    for (let index = 0; index < digits.length - 1; index += 1) {
        if (Number(digits[index]) !== Number(from)) continue;
        observations += 1;
        if (Number(digits[index + 1]) === Number(to)) hits += 1;
    }
    return { observations, hits };
};

export const transitionFrequency = (digits, from, to) => {
    const { observations, hits } = transitionStats(digits, from, to);
    return percentage(hits, observations);
};

/** Only full, non-overlapping windows count — a partial window would bias stability. */
export const completeWindows = (digits, size) => {
    const width = Math.max(1, Math.trunc(Number(size) || 1));
    const windows = [];
    for (let end = width; end <= digits.length; end += width) windows.push(digits.slice(end - width, end));
    return windows;
};

export const digitWindowFrequencies = (digits, digit, size) =>
    completeWindows(digits, size).map(window => frequencyOf(window, digit));

export const digitWindowCounts = (digits, digit, size) =>
    completeWindows(digits, size).map(window => countOf(window, digit));

/** Max minus min frequency across the windows, or NaN without two full windows. */
export const frequencySpread = frequencies =>
    frequencies.length >= 2 && frequencies.every(Number.isFinite) ? Math.max(...frequencies) - Math.min(...frequencies) : NaN;

/** Newest window's frequency minus the one before it, or NaN without two full windows. */
export const frequencyChange = frequencies =>
    frequencies.length >= 2 && frequencies.every(Number.isFinite)
        ? frequencies[frequencies.length - 1] - frequencies[frequencies.length - 2]
        : NaN;

export const parityWindowFrequencies = (digits, parity, size) =>
    completeWindows(digits, size).map(window => parityFrequency(window, parity));

/** null when the window is too short to compare, otherwise true/false. */
export const matchesSequence = (digits, sequence) => {
    if (!sequence.length || digits.length < sequence.length) return null;
    const tail = digits.slice(-sequence.length).map(Number);
    return tail.every((digit, index) => digit === Number(sequence[index]));
};

export const matchesParitySequence = (digits, parities) => {
    if (!parities.length || digits.length < parities.length) return null;
    const tail = digits.slice(-parities.length);
    return tail.every((digit, index) => parityOf(digit).toLowerCase() === String(parities[index]).toLowerCase());
};

/** The observational meaning of a strategy, evaluated on one tick's final digit. */
export const outcome = (strategy, digit, selected, barrier) => {
    switch (strategy) {
        case 'matches':
            return Number(digit) === Number(selected);
        case 'differs':
            return Number(digit) !== Number(selected);
        case 'over':
            return Number(digit) > Number(barrier);
        case 'under':
            return Number(digit) < Number(barrier);
        case 'even':
            return isEven(digit);
        case 'odd':
            return !isEven(digit);
        default:
            return null;
    }
};

/** The strategies an observation can be armed with, in the order the palette lists them. */
export const STRATEGIES = ['over', 'under', 'matches', 'differs', 'even', 'odd'];

/** Share of a set of completed observations that qualified, or NaN for an empty set. */
export const qualifiedFrequency = rows => percentage(rows.filter(record => record.qualified).length, rows.length);

/**
 * The observed outcomes of one strategy in this session, older half against newer half.
 *
 * Nothing is re-simulated or predicted: these are the observations the running bot genuinely
 * completed. `minimum` is how many completed observations each half needs before the comparison is
 * worth reading, and `window` (optional) keeps only the newest 2×N ticks of them.
 */
export const observedComparison = (completed, { strategy, digit, minimum = 1, window } = {}) => {
    let rows = completed.filter(record => record.strategy === strategy);
    if (strategy === 'matches' || strategy === 'differs') rows = rows.filter(record => Number(record.digit) === Number(digit));
    if (Number.isFinite(window) && rows.length) {
        const newest = Number(rows[rows.length - 1].tick_index) || 0;
        rows = rows.filter(record => Number(record.tick_index) > newest - Number(window) * 2);
    }
    const half = Math.floor(rows.length / 2);
    const older = rows.slice(0, half);
    const newer = rows.slice(half);
    const required = Math.max(1, Math.trunc(Number(minimum) || 1));
    return {
        strategy,
        completed: rows.length,
        passes: rows.filter(record => record.qualified).length,
        frequency: rows.length ? qualifiedFrequency(rows) : NaN,
        older: { completed: older.length, frequency: older.length ? qualifiedFrequency(older) : NaN },
        newer: { completed: newer.length, frequency: newer.length ? qualifiedFrequency(newer) : NaN },
        sufficient: older.length >= required && newer.length >= required,
    };
};

/** Every strategy compared on its own completed observations, for the Strategy Comparison blocks. */
export const compareObservedStrategies = (completed, options = {}) =>
    STRATEGIES.map(strategy => observedComparison(completed, { ...options, strategy }));
