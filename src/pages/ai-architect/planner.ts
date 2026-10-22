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

import type {
    AppliedDefault,
    Clarification,
    ExecutionMode,
    PlanResult,
    StrategyKind,
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
    /** The prompt named a contract more than once with different meanings. */
    ambiguous: StrategyKind[];
}

/**
 * Removes phrases that describe a statistical filter or a window, so the words "below"/"above"/
 * "last N digits" in them are not read as a contract. "digit 0 is below 10%" is a filter on a
 * percentage; it is never an Under contract.
 */
function maskNonContractPhrases(text: string): string {
    return text
        .replace(/\d+(?:\.\d+)?\s*%/g, ' PERCENT ')
        .replace(new RegExp(`digit\\s*${NUMBER_TOKEN}\\s*(?:frequency|share|percentage)?\\s*(?:is\\s*)?(?:below|under|above|over|less than|more than|at least|at most)\\s*PERCENT`, 'g'), ' FILTER ')
        .replace(new RegExp(`(?:below|under|above|over|less than|more than)\\s*PERCENT`, 'g'), ' FILTER ')
        .replace(new RegExp(`streak[^,.;]{0,20}?(?:at most|no more than|below|under|<=?)\\s*${NUMBER_TOKEN}`, 'g'), ' STREAKFILTER ')
        .replace(new RegExp(`(?:last|past|previous|latest|recent)\\s+${NUMBER_TOKEN}\\s*(?:digits?|ticks?|samples?)`, 'g'), ' WINDOW ');
}

function readContract(rawText: string): ContractRead {
    const text = maskNonContractPhrases(rawText);
    const found: { strategy: StrategyKind; barrier: number | null }[] = [];
    const add = (strategy: StrategyKind, barrier: number | null) => {
        if (!found.some(item => item.strategy === strategy && item.barrier === barrier)) found.push({ strategy, barrier });
    };

    for (const match of text.matchAll(new RegExp(`\\b(over|under|above|below)\\s*(?:digit\\s*)?${NUMBER_TOKEN}\\b`, 'g'))) {
        add(match[1] === 'over' || match[1] === 'above' ? 'over' : 'under', readNumber(match[2]));
    }
    for (const match of text.matchAll(new RegExp(`\\b(matches?|differs?|match|differ)\\s*(?:digit\\s*|from\\s*)?${NUMBER_TOKEN}\\b`, 'g'))) {
        add(match[1].startsWith('match') ? 'matches' : 'differs', readNumber(match[2]));
    }
    if (/\beven\b/.test(text) && !/\beven\s+(?:if|when|then)\b/.test(text)) add('even', null);
    if (/\bodd\b/.test(text)) add('odd', null);

    // A bare "over"/"under" with no number is a contract family without a barrier.
    if (found.length === 0) {
        if (/\bover\b/.test(text)) add('over', null);
        else if (/\bunder\b/.test(text)) add('under', null);
        else if (/\bmatches\b/.test(text)) add('matches', null);
        else if (/\bdiffers\b/.test(text)) add('differs', null);
    }

    if (found.length === 0) return { strategy: null, barrier: null, ambiguous: [] };
    const first = found[0];
    const families = [...new Set(found.map(item => item.strategy))];
    return { strategy: first.strategy, barrier: first.barrier, ambiguous: families.length > 1 ? families : [] };
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

function readFrequencyFilter(text: string): { digit: number; operator: 'below' | 'above'; percent: number } | null {
    const match =
        text.match(new RegExp(`digit\\s*${NUMBER_TOKEN}\\s*(?:frequency|share|percentage)?\\s*(?:is\\s*)?(below|under|above|over|less than|more than|at least|at most)\\s*(\\d+(?:\\.\\d+)?)\\s*%`)) ??
        null;
    if (!match) return null;
    const digit = readNumber(match[1]);
    if (digit === null || digit < 0 || digit > 9) return null;
    const below = /below|under|less|at most/.test(match[2]);
    return { digit, operator: below ? 'below' : 'above', percent: Number(match[3]) };
}

function readStreak(text: string): number | null {
    const match = text.match(new RegExp(`streak\\s*(?:of|is)?\\s*(?:at most|no more than|below|under|<=?)\\s*${NUMBER_TOKEN}`));
    const value = readNumber(match?.[1]);
    return value !== null && value >= 1 ? Math.floor(value) : null;
}

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
        frequency: { digit: number; operator: 'below' | 'above'; percent: number } | null;
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
        entry: { strategy, barrier, trigger: 'last_digit_entry' },
        filters: {
            window: clamp(Math.round(partial.window ?? DEFAULT_WINDOW), MIN_WINDOW, MAX_WINDOW),
            frequency: partial.frequency ?? null,
            streakAtMost: partial.streakAtMost ?? null,
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
            };
        }

        const unsupported = readUnsupported(text);

        // ── Contract: essential, so a missing or conflicting one is a question ──────────────────
        const contract = readContract(text);
        if (!contract.strategy) {
            clarifications.push({
                id: 'contract',
                question: 'Which digit contract should the bot trade or observe?',
                options: ['Over 1', 'Under 8', 'Even', 'Odd', 'Matches 5', 'Differs 4'],
            });
        } else if (contract.ambiguous.length > 1) {
            clarifications.push({
                id: 'contract_conflict',
                question: `The request names several contracts (${contract.ambiguous.map(item => STRATEGY_LABEL[item]).join(', ')}). Which one should the bot use?`,
                options: contract.ambiguous.map(item => STRATEGY_LABEL[item]),
            });
        }

        const strategy = contract.strategy;
        const range = strategy ? BARRIER_RANGE[strategy] : null;
        let barrier = contract.barrier;

        if (strategy && range) {
            if (barrier === null) {
                const fallback = strategy === 'over' ? 1 : strategy === 'under' ? 8 : 5;
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

        if (clarifications.length > 0 || !strategy) {
            return {
                spec: null,
                defaults,
                clarifications,
                unsupported,
                reasoning: ['A detail the strategy cannot be built without is missing or unclear, so no workspace was generated.'],
            };
        }

        reasoning.push(
            `Contract: ${STRATEGY_LABEL[strategy]}${barrier !== null ? ` ${barrier}` : ''} (the contract barrier, kept separate from the entry trigger).`
        );

        // ── Discovery / market ────────────────────────────────────────────────────────────────────
        const symbol = readSymbol(text);
        const multi = !symbol && MULTI_MARKET.test(text);
        if (multi) {
            reasoning.push('Market discovery: every supported volatility market is discovered dynamically and scanned with Switch active market.');
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

        // ── Filters ───────────────────────────────────────────────────────────────────────────────
        const frequency = readFrequencyFilter(text);
        const streakAtMost = readStreak(text);
        if (frequency) {
            reasoning.push(
                `Statistical filter: digit ${frequency.digit} share ${frequency.operator} ${frequency.percent}% over the window (a filter, not the barrier).`
            );
        }
        if (streakAtMost !== null) reasoning.push(`Streak filter: at most ${streakAtMost} identical digits in a row.`);

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
            frequency,
            streakAtMost,
            reporting: !/\bno (?:report|log|journal)/.test(text),
            purpose,
        });

        return { spec, defaults, clarifications: [], unsupported, reasoning };
    },
};

export function planStrategy(prompt: string, planner: StrategyPlanner = deterministicPlanner): PlanResult {
    return planner.plan(prompt);
}
