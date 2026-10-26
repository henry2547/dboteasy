/**
 * Natural language -> structured strategy specification (Steps A and B).
 *
 * The planner is deterministic: it reads the prompt for the concepts the strategy needs and fills
 * a `StrategySpec`. It is deliberately conservative about three things the brief calls out:
 *
 *  - An entry *trigger* ("waits for Over 1") is not a contract *barrier* and not a statistical
 *    filter. They are parsed into separate fields so they cannot be confused.
 *  - A missing essential detail (which contract?) becomes a clarification question; a missing
 *    non-essential detail becomes a documented default shown to the user. Nothing is silently
 *    invented, and every default is listed.
 *  - Asking for something no registered block can do is reported in `unsupported`, never replaced
 *    by a different rule.
 *
 * It sits behind `StrategyPlanner` so a language model can replace it later without touching the
 * registry, builder or validator: they only ever see a `StrategySpec`.
 */

import { menuBlockNamedIn, menuBlocksNamedIn } from './block-menu';
import { CONTRACTS } from './builder';
import type {
    AppliedDefault,
    Clarification,
    ExecutionMode,
    FrequencyFilter,
    PlanResult,
    Requirement,
    StrategyKind,
    StrategyLeg,
    StrategySpec,
} from './types';

export interface StrategyPlanner {
    plan: (prompt: string) => PlanResult;
}

export const DEFAULT_MARKET = '1HZ25V';

export const DEFAULT_WINDOW = 100;
export const MAX_WINDOW = 1000;
export const MIN_WINDOW = 10;

/** Conservative, Demo-first defaults. Flat staking unless the user asks for a multiplier. */
export const DEFAULT_RISK = {
    stake: 1,
    takeProfit: 5,
    stopLoss: 10,
    maxConsecutiveLosses: 3,
    multiplier: 1,
    tradeLimit: 0,
    cooldownMinutes: 0,
    cooldownCycles: 0,
} as const;

const BARRIER_RANGE: Record<StrategyKind, { min: number; max: number } | null> = {
    over: { min: 0, max: 8 },
    under: { min: 1, max: 9 },
    matches: { min: 0, max: 9 },
    differs: { min: 0, max: 9 },
    even: null,
    odd: null,
};

const STRATEGY_LABEL: Record<StrategyKind, string> = {
    over: 'Over',
    under: 'Under',
    matches: 'Matches',
    differs: 'Differs',
    even: 'Even',
    odd: 'Odd',
};

const WORD_NUMBERS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const norm = (prompt: string): string => prompt.toLowerCase().replace(/\s+/g, ' ').trim();

/** Reads "3", "three" or "3rd" as a number. */
function readNumber(token: string | undefined): number | null {
    if (!token) return null;
    const word = WORD_NUMBERS[token.toLowerCase()];
    if (word !== undefined) return word;
    const parsed = Number(token.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && token.replace(/[^0-9.]/g, '') !== '' ? parsed : null;
}

const NUMBER_TOKEN = '(\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)';

// ── Concept readers ─────────────────────────────────────────────────────────────────────────────

interface ContractRead {
    strategy: StrategyKind | null;
    barrier: number | null;
    /** Every contract the prompt names, in the order it names them. */
    mentions: ContractMention[];
}

export interface ContractMention {
    strategy: StrategyKind;
    barrier: number | null;
    /** Offset in the prompt where the mention starts, so the rules can be split by clause. */
    index: number;
}

/**
 * Removes phrases that describe a statistical filter or a window, so the words "below"/"above"/
 * "last N digits" in them are not read as a contract. "digit 0 is below 10%" is a filter on a
 * percentage; it is never an Under contract.
 */
/** A comma/and/or separated run of single digits, e.g. `8, 9` or `5 and 6`. */
const DIGIT_LIST = '\\d(?:\\s*(?:,|and|or|&)\\s*\\d)*';

/**
 * Blanks out every phrase that describes a filter rather than a contract. Each replacement keeps the
 * length of what it replaced, so an offset into the masked text is still an offset into the prompt —
 * that is how the two rules of a two-contract request are split apart.
 */
const maskedPercent = (match: string) => 'p'.repeat(match.length);
const maskedPhrase = (match: string) => ' '.repeat(match.length);

function maskNonContractPhrases(text: string): string {
    return text
        .replace(/\d+(?:\.\d+)?\s*(?:%|percent\w*|percentage\w*)/g, maskedPercent)
        .replace(new RegExp(`\\b(?:digits?|numbers?)\\s*${DIGIT_LIST}[^.]{0,45}?(?:below|under|above|over|less than|more than|at least|at most)\\s*p+`, 'g'), maskedPhrase)
        .replace(new RegExp(`digit\\s*${NUMBER_TOKEN}\\s*(?:frequency|share|percentage)?\\s*(?:is\\s*)?(?:below|under|above|over|less than|more than|at least|at most)\\s*p+`, 'g'), maskedPhrase)
        .replace(new RegExp(`(?:below|under|above|over|less than|more than)\\s*p+`, 'g'), maskedPhrase)
        // "digits 5 and 6 should not have the green or red bar" is a bar rule, never a contract.
        .replace(/\b(?:no|not|without|neither|never)\b[^.]{0,40}?\b(?:green|red|hot|cold)\b/g, maskedPhrase)
        .replace(/\bbars?\b[^.]{0,20}?\b(?:green|red|hot|cold)\b/g, maskedPhrase)
        // "entry is 5 and 6" lists the last digits the bot waits for; it is not a contract either.
        .replace(new RegExp(`\\bentr(?:y|ies)\\b[^.]{0,30}?\\b${DIGIT_LIST}`, 'g'), maskedPhrase)
        .replace(new RegExp(`streak[^,.;]{0,20}?(?:at most|no more than|below|under|<=?)\\s*${NUMBER_TOKEN}`, 'g'), maskedPhrase)
        .replace(new RegExp(`(?:last|past|previous|latest|recent)\\s+${NUMBER_TOKEN}\\s*(?:digits?|ticks?|samples?)`, 'g'), maskedPhrase);
}

/** Every contract the prompt names, in the order it names them. Filter phrases are ignored. */
export function contractMentions(rawText: string): ContractMention[] {
    const text = maskNonContractPhrases(rawText);
    const mentions: ContractMention[] = [];
    const add = (strategy: StrategyKind, barrier: number | null, index: number) => mentions.push({ strategy, barrier, index });

    for (const match of text.matchAll(new RegExp(`\\b(over|under|above|below)\\s*(?:digit\\s*)?${NUMBER_TOKEN}\\b`, 'g'))) {
        add(match[1] === 'over' || match[1] === 'above' ? 'over' : 'under', readNumber(match[2]), match.index ?? 0);
    }
    for (const match of text.matchAll(new RegExp(`\\b(matches?|differs?|match|differ)\\s*(?:digit\\s*|from\\s*)?${NUMBER_TOKEN}\\b`, 'g'))) {
        add(match[1].startsWith('match') ? 'matches' : 'differs', readNumber(match[2]), match.index ?? 0);
    }
    const even = /\beven\b(?!\s+(?:if|when|then)\b)/.exec(text);
    if (even) add('even', null, even.index);
    const odd = /\bodd\b/.exec(text);
    if (odd) add('odd', null, odd.index);

    return mentions.sort((a, b) => a.index - b.index);
}

/** The distinct contracts a prompt names, keeping the first mention of each, in prompt order. */
function distinctMentions(mentions: ContractMention[]): ContractMention[] {
    const seen = new Set<StrategyKind>();
    return mentions.filter(mention => {
        if (seen.has(mention.strategy)) return false;
        seen.add(mention.strategy);
        return true;
    });
}

const defaultBarrierFor = (strategy: StrategyKind): number => (strategy === 'over' ? 1 : strategy === 'under' ? 8 : 5);

/** Whether the engine can run both contracts in one bot: they must share a Trade type. */
const shareTradeType = (a: StrategyKind, b: StrategyKind): boolean => CONTRACTS[a].tradeType === CONTRACTS[b].tradeType;

function readContract(rawText: string): ContractRead {
    const text = maskNonContractPhrases(rawText);
    const mentions = contractMentions(rawText);

    // A bare "over"/"under" with no number is a contract family without a barrier.
    if (mentions.length === 0) {
        if (/\bover\b/.test(text)) return { strategy: 'over', barrier: null, mentions: [{ strategy: 'over', barrier: null, index: text.search(/\bover\b/) }] };
        if (/\bunder\b/.test(text)) return { strategy: 'under', barrier: null, mentions: [{ strategy: 'under', barrier: null, index: text.search(/\bunder\b/) }] };
        if (/\bmatches\b/.test(text)) return { strategy: 'matches', barrier: null, mentions: [{ strategy: 'matches', barrier: null, index: text.search(/\bmatches\b/) }] };
        if (/\bdiffers\b/.test(text)) return { strategy: 'differs', barrier: null, mentions: [{ strategy: 'differs', barrier: null, index: text.search(/\bdiffers\b/) }] };
        return { strategy: null, barrier: null, mentions: [] };
    }

    const first = mentions[0];
    return { strategy: first.strategy, barrier: first.barrier, mentions };
}

function readWindow(text: string): number | null {
    const patterns = [
        new RegExp(`(?:last|past|previous|latest|recent)\\s+${NUMBER_TOKEN}\\s*(?:digits?|ticks?|samples?)`),
        new RegExp(`(?:window|sample|history|lookback)\\s*(?:of|size)?\\s*(?:to|=|:)?\\s*${NUMBER_TOKEN}\\s*(?:digits?|ticks?)?`),
        new RegExp(`${NUMBER_TOKEN}\\s*[- ](?:tick|digit)\\s*(?:window|history|sample)`),
        new RegExp(`analy[sz]e\\s+${NUMBER_TOKEN}\\s*(?:digits?|ticks?)`),
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        const value = readNumber(match?.[1]);
        if (value !== null && value >= 1) return value;
    }
    return null;
}

function readStake(text: string): number | null {
    const match = text.match(/(?:stake|stakes|staking|bet)\s*(?:of|at|=|:)?\s*\$?\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
}

function readMaxLosses(text: string): number | null {
    const match =
        text.match(new RegExp(`stop(?:s)?\\s+after\\s+${NUMBER_TOKEN}\\s*(?:consecutive\\s+)?loss`)) ??
        text.match(new RegExp(`${NUMBER_TOKEN}\\s+consecutive\\s+loss`)) ??
        text.match(new RegExp(`(?:max(?:imum)?|limit)\\s+(?:of\\s+)?${NUMBER_TOKEN}\\s+(?:consecutive\\s+)?loss`));
    const value = readNumber(match?.[1]);
    return value !== null && value >= 1 ? Math.floor(value) : null;
}

function readTakeProfit(text: string): number | null {
    const match = text.match(/take[- ]profit\s*(?:of|at|=|:)?\s*\$?\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
}

function readStopLoss(text: string): number | null {
    const match = text.match(/stop[- ]loss\s*(?:of|at|=|:)?\s*\$?\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
}

function readTradeLimit(text: string): number | null {
    const match =
        text.match(new RegExp(`(?:stop|limit)\\s+(?:after|to|at)\\s+${NUMBER_TOKEN}\\s+trades?`)) ??
        text.match(new RegExp(`(?:max(?:imum)?)\\s+(?:of\\s+)?${NUMBER_TOKEN}\\s+trades?`));
    const value = readNumber(match?.[1]);
    return value !== null && value >= 1 ? Math.floor(value) : null;
}

function readMultiplier(text: string): number | null {
    const match = text.match(/(?:multiplier|martingale)\s*(?:of|x|=|:)?\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
}

function readSymbol(text: string): string | null {
    const match = text.match(/\b(1hz\d{2,3}v|r_\d{2,3}|jd\d{2,3}|rdbear|rdbull)\b/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Every digit-frequency condition in the prompt, not just the first one. "digits 8 and 9 should have
 * at least 10.3%" yields one filter per digit; all of them are ANDed into the entry.
 */
function readFrequencies(text: string): FrequencyFilter[] {
    const filters: FrequencyFilter[] = [];
    const add = (digit: number, operator: 'below' | 'above', percent: number) => {
        if (digit < 0 || digit > 9 || !Number.isFinite(percent) || percent < 0 || percent > 100) return;
        if (!filters.some(item => item.digit === digit && item.operator === operator && item.percent === percent)) {
            filters.push({ digit, operator, percent });
        }
    };
    // The gap between the digit list and its operator never contains another digit, so a filter
    // written after an entry list ("entry digits 7, 8 or 9, digits 8 and 9 at least 10.3%") binds
    // to the list nearest its own operator instead of swallowing the entry digits.
    const pattern = new RegExp(
        `\\b(?:digits?|numbers?)\\s*(${DIGIT_LIST})[^.\\d]{0,45}?` +
            `(below|under|above|over|less than|more than|at least|at most|>=?|<=?)\\s*` +
            `(\\d+(?:\\.\\d+)?)\\s*(?:%|percent\\w*|percentage\\w*)?`,
        'g'
    );
    for (const match of text.matchAll(pattern)) {
        const below = /below|under|less|at most|<=/.test(match[2]);
        (match[1].match(/\d/g) ?? []).forEach(digit => add(Number(digit), below ? 'below' : 'above', Number(match[3])));
    }
    return filters;
}

/** Every digit list in `text`, with the offset it starts at. */
function digitGroups(text: string): { index: number; digits: number[] }[] {
    const groups: { index: number; digits: number[] }[] = [];
    for (const match of text.matchAll(new RegExp(`\\b(?:digits?|numbers?)\\s*(${DIGIT_LIST})`, 'g'))) {
        groups.push({ index: match.index ?? 0, digits: (match[1].match(/\d/g) ?? []).map(Number) });
    }
    for (const match of text.matchAll(/(?:\b(?:entry|entries|is|are|only|be)\b\s*)(\d(?:\s*(?:,|and|or)\s*\d)+)/g)) {
        groups.push({ index: (match.index ?? 0) + match[0].indexOf(match[1]), digits: (match[1].match(/\d/g) ?? []).map(Number) });
    }
    return groups.sort((a, b) => a.index - b.index);
}

/**
 * The digits the user said must carry neither the hot (green) nor the cold (red) bar. The digits are
 * the nearest list stated before the bar rule ("digits 5 and 6 should not have a green or red bar").
 */
function readBarNeutral(text: string): number[] {
    const digits: number[] = [];
    for (const clause of text.split(/[.;]/)) {
        const bar = Math.min(
            ...[clause.search(/\bbars?\b/), clause.search(/\bgreen\b/), clause.search(/\bred\b/)].filter(index => index >= 0)
        );
        if (!Number.isFinite(bar) || bar < 0) continue;
        if (!/\b(no|not|without|neither|never)\b/.test(clause)) continue;
        const before = clause.slice(0, clause.search(/\bbars?\b/) >= 0 ? clause.search(/\bbars?\b/) : bar);
        const group = digitGroups(before).pop();
        if (group) digits.push(...group.digits);
    }
    return [...new Set(digits)];
}

/**
 * The last digits the entry accepts when the user states them ("entry is 5 and 6", "entries are
 * 7, 4 or 8", "entry is any 2 digits above or equal 7"). Empty when the contract rule decides.
 */
function readEntryDigits(text: string): number[] {
    // A list needs at least two digits and a separator — "entry is any 2 digits" is not a list.
    const listed = text.match(new RegExp(`\\bentr(?:y|ies)\\b[^.]{0,30}?\\b(\\d(?:\\s*(?:,|and|or|&)\\s*\\d)+)`));
    if (listed) return [...new Set((listed[1].match(/\d/g) ?? []).map(Number))];

    const range = text.match(
        /\bentr(?:y|ies)\b[^.]{0,45}?\b(above|over|below|under|at least|at most|less than|more than)\b(?:\s+or\s+equal\s*(?:to\s*)?)?\s*(\d)\b/
    );
    if (range) {
        const edge = Number(range[2]);
        const inclusive = /or\s+equal/i.test(range[0]);
        const above = /above|over|at least|more than/.test(range[1]);
        const digits: number[] = [];
        for (let digit = 0; digit <= 9; digit += 1) {
            if (above ? (inclusive ? digit >= edge : digit > edge) : inclusive ? digit <= edge : digit < edge) digits.push(digit);
        }
        return digits;
    }

    const single = text.match(/\bentr(?:y|ies)\b[^.]{0,20}?\b(?:is|are|=|:)\s*(?:digit\s*)?(\d)\b/);
    return single ? [Number(single[1])] : [];
}

// ── Coverage: every clause the user wrote, and what became of it ───────────────────────────────

const CLAUSE_CONCEPTS: { test: RegExp; detail: string }[] = [
    { test: /\b(over|under|above|below|matches?|differs?|even|odd)\b/, detail: 'Contract' },
    { test: /\b(markets?|volatilit\w*|symbols?|indices|1hz\d+|r_\d+|jd\d+)\b/, detail: 'Market' },
    { test: /\b(last|past|previous|recent|window|history|sample|lookback|analy[sz]e)\b|\b\d+\s*(?:digits?|ticks?)\b/, detail: 'History window' },
    { test: /\d(?:\.\d+)?\s*(?:%|percent\w*|percentage\w*)/, detail: 'Digit frequency' },
    { test: /\bbars?\b|\bgreen\b|\bred\b/, detail: 'Digit bar rule' },
    { test: /\bstreak\b/, detail: 'Streak rule' },
    { test: /\bentr(?:y|ies)\b/, detail: 'Entry digits' },
    { test: /\bvirtual hook\b|\bobserv\w*\b|\bnext (?:genuine )?tick\b|\brecord\b/, detail: 'Setup observation' },
    { test: /\bstake\b|\btake[- ]profit\b|\bstop[- ]loss\b|\bloss\w*\b|\btrades?\b|\bmartingale\b|\bmultiplier\b|\bcool[- ]?down\b/, detail: 'Risk controls' },
    { test: /\b(observation[- ]only|signal[- ]only|do not trade|don'?t trade|without trading|demo|real (?:account|money)|buy|purchase|trade)\b/, detail: 'Execution mode' },
];

const FILLER_WORDS = new Set([
    'a', 'an', 'the', 'bot', 'build', 'make', 'create', 'me', 'my', 'please', 'i', 'want', 'need', 'it', 'that', 'which',
    'this', 'these', 'those', 'then', 'also', 'and', 'or', 'so', 'with', 'for', 'on', 'in', 'to', 'of', 'is', 'are', 'be',
    'should', 'must', 'would', 'can', 'will', 'all', 'every', 'each', 'supported', 'use', 'using', 'only', 'when', 'if',
    'they', 'them', 'have', 'has', 'at', 'least', 'most', 'not', 'no', 'as', 'like', 'from', 'into', 'up', 'very', 'just',
]);

/** Marks a clause that is only a digit list; it is merged into the rule beside it and never shown. */
const PART_OF_LIST = '\u0000digit-list';
const isFiller = (clause: string): boolean => {
    if (/\d/.test(clause)) return false;
    return clause
        .toLowerCase()
        .replace(/[^a-z' ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .every(word => FILLER_WORDS.has(word));
};

/** One entry per clause, so the user can see that nothing they wrote was dropped. */
function readRequirements(text: string, unsupported: { pattern: RegExp; message: string }[]): Requirement[] {
    // Split on sentence and clause boundaries, and on joining words — but never inside a decimal
    // number ("10.3%") and never inside a digit list, whose fragments are matched below.
    const clauses = text
        .split(/[;,]|\.(?!\d)|\b(?:and|or|then|also|but)\b/)
        .map(clause => clause.trim())
        .filter(clause => clause.length > 1);

    const entries: Requirement[] = clauses.map(clause => {
        const blocked = unsupported.find(item => item.pattern.test(clause));
        if (blocked) return { clause, status: 'unsupported', detail: blocked.message };
        // A clause that names a block from the Blocks menu is answered with that block, not with a
        // concept of the planner's own. Whether the generated bot really places it is decided
        // against the built workspace (`alignWithBlocksMenu` in the pipeline), never assumed here.
        const menuBlock = menuBlockNamedIn(clause);
        if (menuBlock) {
            return {
                clause,
                status: 'unsupported',
                detail: `Blocks menu · ${menuBlock.label} (${menuBlock.category}) — not placed by the Architect.`,
                menuBlock,
            };
        }
        if (/^(?:\d+|digits?\s*\d+(?:\s*(?:,|or)\s*\d+)*)$/.test(clause)) {
            return { clause, status: 'applied', detail: PART_OF_LIST };
        }
        const concept = CLAUSE_CONCEPTS.find(item => item.test.test(clause));
        if (concept) return { clause, status: 'applied', detail: concept.detail };
        if (isFiller(clause)) return { clause, status: 'applied', detail: 'Wording, not a rule.' };
        return {
            clause,
            status: 'unapplied',
            detail: 'I could not turn this into a registered block. Name the digit, market, window, filter or risk rule it means, and I will build it.',
        };
    });

    // "digits 0 and 1 should be above 10%" splits into a bare list and its rule; show them together.
    const merged: Requirement[] = [];
    entries.forEach((entry, index) => {
        if (entry.detail !== PART_OF_LIST) {
            merged.push(entry);
            return;
        }
        const next = entries[index + 1];
        if (next && next.detail !== PART_OF_LIST) {
            entries[index + 1] = { ...next, clause: `${entry.clause} ${next.clause}` };
            return;
        }
        const previous = merged[merged.length - 1];
        if (previous) merged[merged.length - 1] = { ...previous, clause: `${previous.clause} ${entry.clause}` };
    });
    return merged;
}

function readStreak(text: string): number | null {
    const match = text.match(new RegExp(`streak\\s*(?:of|is)?\\s*(?:at most|no more than|below|under|<=?)\\s*${NUMBER_TOKEN}`));
    const value = readNumber(match?.[1]);
    return value !== null && value >= 1 ? Math.floor(value) : null;
}

/** The Blocks-menu blocks that scan markets; naming one of them asks for the multi-market bot. */
const SCAN_BLOCKS = new Set(['switch_active_market', 'market_discover_eligible']);

/** The ways a prompt can say "scan more than one market". */
const MULTI_MARKET = /\b(all|every|each|multiple|several|many)\b[^.]{0,40}\b(markets?|volatilit\w*|symbols?|indices|synthetics?)\b|\bscan(?:s|ning)?\b[^.]{0,30}\bmarkets?\b|\bswitch(?:es|ing)?\b[^.]{0,30}\bmarkets?\b|\bnext market\b/;

// ── Things the registry cannot do — reported, never substituted ─────────────────────────────────

const UNSUPPORTED_ASKS: { pattern: RegExp; message: string }[] = [
    { pattern: /\bguarantee[sd]?\b|\bsure[- ]?win\b|\brisk[- ]free\b|\bnever lose\b/, message: 'No bot can guarantee profit, so no such rule was built.' },
    { pattern: /\bpredict(?:s|ion)?\b.{0,20}\bnext (?:digit|tick)\b|\bforecast\b/, message: 'Predicting the next digit is not supported; the bot only reacts to measured conditions and observes the next genuine tick.' },
    { pattern: /\b(?:rsi|macd|bollinger|moving average|ema|sma|stochastic)\b/, message: 'Indicator-based entries (RSI, MACD, moving averages, ...) are not part of the digit strategy blocks the architect builds.' },
    { pattern: /\b(?:accumulator|multiplier contract|rise\/?fall|higher\/?lower|touch|no touch|lookback|vanilla|turbo)\b/, message: 'Only digit contracts (Over/Under, Matches/Differs, Even/Odd) are supported.' },
    { pattern: /\bremove\s+(?:the\s+)?(?:risk|stop[- ]loss|take[- ]profit)\b|\bno\s+(?:risk|stop[- ]loss)\b|\bignore\s+(?:the\s+)?risk\b/, message: 'Risk controls cannot be removed from a trading bot; they stay in the generated workspace.' },
    { pattern: /\breal\s+(?:money|account|mode)\b|\bswitch to real\b|\btrade real\b/, message: 'Real trading is never selected at build time. The bot is built for Demo; a Real account needs an explicit confirmation when you press Start.' },
    { pattern: /\btelegram\b|\bemail\b|\bsms\b/, message: 'External notifications are not generated; only the in-app run log is used.' },
];

function readUnsupported(text: string): string[] {
    return UNSUPPORTED_ASKS.filter(item => item.pattern.test(text)).map(item => item.message);
}

// ── Mode ────────────────────────────────────────────────────────────────────────────────────────

function readMode(text: string): { mode: ExecutionMode | null; explicit: boolean } {
    if (/\bobservation[- ]only\b|\bobserve only\b|\bjust observe\b|\bwithout trading\b|\bdo not trade\b|\bdon'?t trade\b|\bno trad(?:e|ing)\b|\blearning only\b/.test(text)) {
        return { mode: 'observation', explicit: true };
    }
    if (/\bsignal[- ]only\b|\bsignals? only\b|\bjust (?:detect|alert|signal)\b|\bonly (?:detect|alert|signal)\b|\bdetect(?:ion)? only\b/.test(text)) {
        return { mode: 'signal', explicit: true };
    }
    if (/\b(?:trade|buy|purchase|place|execute|request a proposal|proposal|stake|demo)\b/.test(text)) {
        return { mode: 'demo_trading', explicit: true };
    }
    return { mode: null, explicit: false };
}

// ── The planner ─────────────────────────────────────────────────────────────────────────────────

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function strategyName(strategy: StrategyKind, barrier: number | null, multi: boolean, hook: boolean): string {
    const label = `${STRATEGY_LABEL[strategy]}${barrier !== null ? ` ${barrier}` : ''}`;
    const parts = [multi ? 'Multi-Market' : null, label, hook ? 'Virtual Hook' : null, 'Bot'].filter(Boolean);
    return parts.join(' ');
}

export function createSpec(
    partial: Partial<{
        strategy: StrategyKind;
        barrier: number | null;
        mode: ExecutionMode;
        multi: boolean;
        symbol: string | null;
        window: number;
        hook: boolean;
        stake: number;
        takeProfit: number;
        stopLoss: number;
        maxLosses: number;
        multiplier: number;
        tradeLimit: number;
        cooldownMinutes: number;
        cooldownCycles: number;
        frequencies: FrequencyFilter[];
        digits: number[];
        barNeutral: number[];
        streakAtMost: number | null;
        reporting: boolean;
        purpose: string;
    }> = {}
): StrategySpec {
    const strategy = partial.strategy ?? 'over';
    const range = BARRIER_RANGE[strategy];
    const barrier = range ? (partial.barrier ?? (strategy === 'over' ? 1 : strategy === 'under' ? 8 : 5)) : null;
    const multi = partial.multi ?? false;
    const hook = partial.hook ?? false;

    return {
        name: strategyName(strategy, barrier, multi, hook),
        purpose: partial.purpose ?? '',
        mode: partial.mode ?? 'demo_trading',
        market: {
            scope: multi ? 'all' : 'single',
            symbol: multi ? null : (partial.symbol ?? DEFAULT_MARKET),
            category: 'all',
            order: 'round_robin',
            maxSwitches: 0,
            minHistory: 20,
        },
        entry: { strategy, barrier, digits: partial.digits ?? [], trigger: 'last_digit_entry' },
        filters: {
            window: clamp(Math.round(partial.window ?? DEFAULT_WINDOW), MIN_WINDOW, MAX_WINDOW),
            frequencies: partial.frequencies ?? [],
            streakAtMost: partial.streakAtMost ?? null,
            barNeutral: partial.barNeutral ?? [],
        },
        observation: { virtualHook: hook, strategyLabel: `${STRATEGY_LABEL[strategy]}${barrier !== null ? ` ${barrier}` : ''}` },
        risk: {
            stake: partial.stake ?? DEFAULT_RISK.stake,
            takeProfit: partial.takeProfit ?? DEFAULT_RISK.takeProfit,
            stopLoss: partial.stopLoss ?? DEFAULT_RISK.stopLoss,
            maxConsecutiveLosses: partial.maxLosses ?? DEFAULT_RISK.maxConsecutiveLosses,
            multiplier: partial.multiplier ?? DEFAULT_RISK.multiplier,
            tradeLimit: partial.tradeLimit ?? DEFAULT_RISK.tradeLimit,
            cooldownMinutes: partial.cooldownMinutes ?? DEFAULT_RISK.cooldownMinutes,
            cooldownCycles: partial.cooldownCycles ?? DEFAULT_RISK.cooldownCycles,
        },
        account: 'demo',
        defaultMarket: partial.symbol ?? DEFAULT_MARKET,
        reporting: partial.reporting ?? true,
    };
}

export const deterministicPlanner: StrategyPlanner = {
    plan(prompt: string): PlanResult {
        const text = norm(prompt);
        const reasoning: string[] = [];
        const defaults: AppliedDefault[] = [];
        const clarifications: Clarification[] = [];

        if (text.length < 8) {
            return {
                spec: null,
                defaults,
                clarifications: [
                    {
                        id: 'describe',
                        question: 'Describe the strategy in a sentence: which contract (for example Over 1 or Under 8) and how it should find an entry?',
                        options: ['Over 1 on all volatility markets', 'Under 8 on one market', 'Even/Odd on all volatility markets'],
                    },
                ],
                unsupported: [],
                reasoning: ['The request was too short to identify a strategy.'],
                requirements: readRequirements(text, UNSUPPORTED_ASKS),
            };
        }

        const unsupported = readUnsupported(text);

        // ── Contract: essential, so a missing or conflicting one is a question ──────────────────
        const contract = readContract(text);
        const named = distinctMentions(contract.mentions);
        // Two contracts that share a Trade type run in ONE bot as two entry rules, so a request that
        // names both is built instead of one of them being dropped.
        const secondRule = named.length === 2 && shareTradeType(named[0].strategy, named[1].strategy) ? named[1] : null;

        if (!contract.strategy) {
            clarifications.push({
                id: 'contract',
                question: 'Which digit contract should the bot trade or observe?',
                options: ['Over 1', 'Under 8', 'Even', 'Odd', 'Matches 5', 'Differs 4'],
            });
        } else if (named.length > 1 && !secondRule) {
            const families = [...new Set(named.map(item => CONTRACTS[item.strategy].tradeType))];
            clarifications.push({
                id: 'contract_conflict',
                question:
                    families.length > 1
                        ? `The request names ${named.map(item => STRATEGY_LABEL[item.strategy]).join(' and ')}, but one bot has one Trade type. Which contract should the bot use?`
                        : `The request names several contracts (${named.map(item => STRATEGY_LABEL[item.strategy]).join(', ')}). Which one should the bot use?`,
                options: named.map(item => STRATEGY_LABEL[item.strategy]),
            });
        }

        const strategy = contract.strategy;
        const range = strategy ? BARRIER_RANGE[strategy] : null;
        let barrier = contract.barrier;

        if (strategy && range) {
            if (barrier === null) {
                const fallback = defaultBarrierFor(strategy);
                barrier = fallback;
                defaults.push({
                    field: 'Barrier digit',
                    value: String(fallback),
                    reason: `The request named ${STRATEGY_LABEL[strategy]} without a digit.`,
                });
            } else if (barrier < range.min || barrier > range.max) {
                clarifications.push({
                    id: 'barrier_range',
                    question: `${STRATEGY_LABEL[strategy]} accepts a digit from ${range.min} to ${range.max}; ${barrier} is outside that. Which digit should it use?`,
                    options: [String(range.min), String(Math.round((range.min + range.max) / 2)), String(range.max)],
                });
            }
        } else if (strategy && !range) {
            barrier = null;
        }

        // The second rule's own barrier, defaulted or questioned exactly like the first one.
        let secondBarrier = secondRule ? secondRule.barrier : null;
        const secondRange = secondRule ? BARRIER_RANGE[secondRule.strategy] : null;
        if (secondRule && secondRange) {
            if (secondBarrier === null) {
                secondBarrier = defaultBarrierFor(secondRule.strategy);
                defaults.push({
                    field: 'Second rule barrier',
                    value: String(secondBarrier),
                    reason: `The request named ${STRATEGY_LABEL[secondRule.strategy]} for the second rule without a digit.`,
                });
            } else if (secondBarrier < secondRange.min || secondBarrier > secondRange.max) {
                clarifications.push({
                    id: 'barrier_range',
                    question: `${STRATEGY_LABEL[secondRule.strategy]} accepts a digit from ${secondRange.min} to ${secondRange.max}; ${secondBarrier} is outside that. Which digit should the second rule use?`,
                    options: [String(secondRange.min), String(Math.round((secondRange.min + secondRange.max) / 2)), String(secondRange.max)],
                });
            }
        } else if (secondRule && !secondRange) {
            secondBarrier = null;
        }

        if (clarifications.length > 0 || !strategy) {
            return {
                spec: null,
                defaults,
                clarifications,
                unsupported,
                reasoning: ['A detail the strategy cannot be built without is missing or unclear, so no workspace was generated.'],
                requirements: readRequirements(text, UNSUPPORTED_ASKS),
            };
        }

        reasoning.push(
            `Contract: ${STRATEGY_LABEL[strategy]}${barrier !== null ? ` ${barrier}` : ''} (the contract barrier, kept separate from the entry trigger).`
        );
        if (secondRule) {
            reasoning.push(`Second contract: ${STRATEGY_LABEL[secondRule.strategy]}${secondBarrier !== null ? ` ${secondBarrier}` : ''} becomes this bot's second entry rule.`);
        }

        // ── Discovery / market ────────────────────────────────────────────────────────────────────
        const symbol = readSymbol(text);
        // Naming a scan block in the Blocks menu asks for the scan, even when the request never says
        // "scan all markets".
        const namedScanBlock = menuBlocksNamedIn(text).find(block => SCAN_BLOCKS.has(block.type)) ?? null;
        const multi = !symbol && (MULTI_MARKET.test(text) || !!namedScanBlock);
        if (multi) {
            reasoning.push(
                `Market discovery: every supported volatility market is discovered dynamically and scanned with Switch active market${
                    namedScanBlock && !MULTI_MARKET.test(text) ? `, the Blocks-menu block “${namedScanBlock.label}” the request names` : ''
                }.`
            );
        } else if (symbol) {
            reasoning.push(`Market: the single market ${symbol}.`);
        } else {
            defaults.push({ field: 'Market', value: DEFAULT_MARKET, reason: 'No market was named and no multi-market scan was requested.' });
            reasoning.push(`Market: one market (${DEFAULT_MARKET}); say "scan all markets" for a multi-market bot.`);
        }

        // ── Historical analysis ───────────────────────────────────────────────────────────────────
        const requestedWindow = readWindow(text);
        let window = requestedWindow ?? DEFAULT_WINDOW;
        if (requestedWindow === null) {
            defaults.push({ field: 'Analysis window', value: `${DEFAULT_WINDOW} ticks`, reason: 'No history length was given.' });
        } else if (requestedWindow < MIN_WINDOW || requestedWindow > MAX_WINDOW) {
            window = clamp(requestedWindow, MIN_WINDOW, MAX_WINDOW);
            defaults.push({
                field: 'Analysis window',
                value: `${window} ticks`,
                reason: `${requestedWindow} is outside the supported ${MIN_WINDOW}-${MAX_WINDOW} tick range.`,
            });
        }
        reasoning.push(`Historical analysis: the last ${window} genuine ticks.`);

        // ── Filters and entry digits: every condition the request states, not just the first ──────
        // A two-contract request splits at the second contract, so each rule keeps only the
        // conditions written beside it and never inherits the other rule's digits.
        const primaryText = secondRule ? text.slice(0, secondRule.index) : text;
        const secondaryText = secondRule ? text.slice(secondRule.index) : '';
        const filtersOf = (segment: string) => ({
            frequencies: readFrequencies(segment),
            streakAtMost: readStreak(segment),
            barNeutral: readBarNeutral(segment),
            digits: readEntryDigits(segment),
        });
        const primaryFilters = filtersOf(primaryText);
        const secondaryFilters = secondRule ? filtersOf(secondaryText) : null;
        const { frequencies, streakAtMost, barNeutral, digits } = primaryFilters;
        const secondWindow = secondRule ? clamp(Math.round(readWindow(secondaryText) ?? window), MIN_WINDOW, MAX_WINDOW) : window;

        const describeFilters = (values: ReturnType<typeof filtersOf>, prefix = '') => {
            values.frequencies.forEach(filter => {
                reasoning.push(
                    `${prefix}Statistical filter: digit ${filter.digit} share ${filter.operator} ${filter.percent}% over the window (a filter, not the barrier).`
                );
            });
            if (values.barNeutral.length) {
                reasoning.push(
                    `${prefix}Digit bar filter: digit${values.barNeutral.length > 1 ? 's' : ''} ${values.barNeutral.join(', ')} must carry neither the green (hottest) nor the red (coldest) bar of the grid.`
                );
            }
            if (values.streakAtMost !== null) reasoning.push(`${prefix}Streak filter: at most ${values.streakAtMost} identical digits in a row.`);
            if (values.digits.length) {
                reasoning.push(
                    `${prefix}Entry digits: the last digit must be ${values.digits.join(' or ')} (the digits you listed, kept separate from the contract barrier).`
                );
            }
        };
        describeFilters(primaryFilters);
        if (secondaryFilters) describeFilters(secondaryFilters, 'Second rule — ');

        // ── Observation (Virtual Hook) ────────────────────────────────────────────────────────────
        const hook = /\bvirtual hook\b|\bsetup observer\b|\brecord(?:s|ed|ing)?\b[^.]{0,30}\bsetup\b|\bobserve(?:s|d)?\b[^.]{0,30}\bnext\b[^.]{0,15}\b(?:genuine\s+)?tick\b|\bnext[- ]tick\b/.test(text);
        if (hook) reasoning.push('Setup observation: the qualifying setup is recorded and the next genuine tick of the same market is observed (never counted as a purchased contract).');

        // ── Mode ─────────────────────────────────────────────────────────────────────────────────
        const modeRead = readMode(text);
        let mode: ExecutionMode;
        if (modeRead.mode) {
            mode = modeRead.mode;
        } else if (hook) {
            mode = 'observation';
            defaults.push({ field: 'Execution mode', value: 'Observation only', reason: 'The request describes learning and observing, with no purchase.' });
        } else {
            mode = 'demo_trading';
            defaults.push({ field: 'Execution mode', value: 'Demo trading after you press Start', reason: 'The request did not say observe-only or signal-only.' });
        }
        reasoning.push(`Execution mode: ${mode === 'demo_trading' ? 'Demo trading, started only by you' : mode === 'observation' ? 'observation only' : 'signal detection only'}.`);
        if (secondRule && mode !== 'demo_trading') {
            unsupported.push(
                `A second entry rule only runs in a trading bot, and this request is ${mode === 'observation' ? 'observation only' : 'signal only'}, so only the ${STRATEGY_LABEL[strategy]} rule was built.`
            );
        }

        // ── Risk ─────────────────────────────────────────────────────────────────────────────────
        const stake = readStake(text);
        const maxLosses = readMaxLosses(text);
        const takeProfit = readTakeProfit(text);
        const stopLoss = readStopLoss(text);
        const tradeLimit = readTradeLimit(text);
        const multiplier = readMultiplier(text);
        const cooldown = /\b(?:market )?cool[- ]?down\b/.test(text);

        if (mode === 'demo_trading') {
            if (stake === null) defaults.push({ field: 'Stake', value: String(DEFAULT_RISK.stake), reason: 'No stake was given; flat staking.' });
            if (maxLosses === null) defaults.push({ field: 'Max consecutive losses', value: String(DEFAULT_RISK.maxConsecutiveLosses), reason: 'No loss limit was given; a stop is always included.' });
            if (takeProfit === null) defaults.push({ field: 'Take profit', value: String(DEFAULT_RISK.takeProfit), reason: 'No take-profit was given.' });
            if (stopLoss === null) defaults.push({ field: 'Stop loss', value: String(DEFAULT_RISK.stopLoss), reason: 'No stop-loss was given.' });
            if (multiplier === null) defaults.push({ field: 'Stake progression', value: 'Flat (x1)', reason: 'No martingale was requested.' });
        }

        const purpose = prompt.trim().replace(/\s+/g, ' ').slice(0, 240);

        const spec = createSpec({
            strategy,
            barrier,
            mode,
            multi,
            symbol,
            window,
            hook,
            stake: stake ?? undefined,
            takeProfit: takeProfit ?? undefined,
            stopLoss: stopLoss ?? undefined,
            maxLosses: maxLosses ?? undefined,
            multiplier: multiplier ?? undefined,
            tradeLimit: tradeLimit ?? undefined,
            cooldownMinutes: cooldown ? 1 : undefined,
            cooldownCycles: cooldown ? 1 : undefined,
            frequencies,
            digits,
            barNeutral,
            streakAtMost,
            reporting: !/\bno (?:report|log|journal)/.test(text),
            purpose,
        });

        if (secondRule && secondaryFilters && mode === 'demo_trading') {
            const leg: StrategyLeg = {
                strategy: secondRule.strategy,
                barrier: secondBarrier,
                digits: secondaryFilters.digits,
                filters: {
                    window: secondWindow,
                    frequencies: secondaryFilters.frequencies,
                    streakAtMost: secondaryFilters.streakAtMost,
                    barNeutral: secondaryFilters.barNeutral,
                },
                label: `${STRATEGY_LABEL[secondRule.strategy]}${secondBarrier !== null ? ` ${secondBarrier}` : ''}`,
            };
            spec.secondLeg = leg;
            spec.name = `${spec.name} + ${leg.label}`;
            reasoning.push(
                `Two entry rules in one bot: ${spec.observation.strategyLabel} trades while it is winning, and ${leg.label} takes over after a loss.`
            );
        }

        return { spec, defaults, clarifications: [], unsupported, reasoning, requirements: readRequirements(text, UNSUPPORTED_ASKS) };
    },
};

export function planStrategy(prompt: string, planner: StrategyPlanner = deterministicPlanner): PlanResult {
    return planner.plan(prompt);
}
