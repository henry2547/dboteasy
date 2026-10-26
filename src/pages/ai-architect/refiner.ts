/**
 * Conversational refinement (Step 13).
 *
 * A follow-up such as "change the window to 250 ticks and stop after three consecutive losses" is
 * applied as a PATCH to the existing `StrategySpec`, and the workspace is rebuilt from the patched
 * spec. Everything the instruction does not mention is carried over untouched, so refining can
 * never produce an unrelated bot. Each applied change is reported, and an instruction that no
 * registered block can represent is returned in `unsupported` instead of being approximated.
 */

import { MAX_WINDOW, MIN_WINDOW } from './planner';
import { filterText, normalizeSpec } from './spec-model';
import type { ExecutionMode, FrequencyFilter, StrategySpec } from './types';

export interface SpecChange {
    field: string;
    from: string;
    to: string;
}

export interface RefineResult {
    spec: StrategySpec;
    changes: SpecChange[];
    /** Parts of the instruction that were understood but cannot be built with registered blocks. */
    unsupported: string[];
    /** Parts of the instruction that were not recognised at all. */
    unrecognised: string[];
}

const NUMBER = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)';
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNumber = (token: string | undefined): number | null => {
    if (!token) return null;
    if (WORDS[token] !== undefined) return WORDS[token];
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
};

const clone = (spec: StrategySpec): StrategySpec => JSON.parse(JSON.stringify(normalizeSpec(spec))) as StrategySpec;
const DIGIT_LIST = '\\d(?:\\s*(?:,|and|or|&)\\s*\\d)*';
const digitsOf = (value: string): number[] => [...new Set((value.match(/\d/g) ?? []).map(Number).filter(digit => digit >= 0 && digit <= 9))];
const modeLabel = (mode: ExecutionMode) => (mode === 'demo_trading' ? 'Demo trading' : mode === 'signal' ? 'Signal only' : 'Observation only');

export function refineSpec(current: StrategySpec, instruction: string): RefineResult {
    const text = instruction.toLowerCase().replace(/\s+/g, ' ').trim();
    const next = clone(current);
    const changes: SpecChange[] = [];
    const unsupported: string[] = [];
    let recognised = 0;

    const change = (field: string, from: unknown, to: unknown) => {
        if (String(from) === String(to)) return;
        changes.push({ field, from: String(from), to: String(to) });
    };

    // ── Analysis window ──────────────────────────────────────────────────────────────────────────
    const windowMatch =
        text.match(new RegExp(`(?:window|history|sample|lookback)[^.]{0,40}?(?:to|=|of)\\s*${NUMBER}\\s*(?:ticks?|digits?)?`)) ??
        text.match(new RegExp(`(?:last|past)\\s+${NUMBER}\\s*(?:ticks?|digits?)`)) ??
        text.match(new RegExp(`from\\s+${NUMBER}\\s*(?:ticks?)?\\s+to\\s+${NUMBER}\\s*ticks?`));
    if (windowMatch) {
        const raw = toNumber(windowMatch[2] ?? windowMatch[1]);
        if (raw !== null && raw >= 1) {
            recognised += 1;
            const value = Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, Math.round(raw)));
            change('History window', `${next.filters.window} ticks`, `${value} ticks`);
            next.filters.window = value;
        }
    }

    // ── Risk limits ──────────────────────────────────────────────────────────────────────────────
    const lossMatch =
        text.match(new RegExp(`stop(?:s)?\\s+after\\s+${NUMBER}\\s*(?:consecutive\\s+)?loss`)) ??
        text.match(new RegExp(`${NUMBER}\\s+consecutive\\s+loss`));
    if (lossMatch) {
        const value = toNumber(lossMatch[1]);
        if (value !== null && value >= 1) {
            recognised += 1;
            change('Stop after consecutive losses', next.risk.maxConsecutiveLosses, Math.floor(value));
            next.risk.maxConsecutiveLosses = Math.floor(value);
        }
    }

    const stake = text.match(/(?:stake|staking)\s*(?:to|of|at|=)\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (stake) {
        recognised += 1;
        change('Stake', next.risk.stake, Number(stake[1]));
        next.risk.stake = Number(stake[1]);
    }
    const takeProfit = text.match(/take[- ]profit\s*(?:to|of|at|=)?\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (takeProfit) {
        recognised += 1;
        change('Take profit', next.risk.takeProfit, Number(takeProfit[1]));
        next.risk.takeProfit = Number(takeProfit[1]);
    }
    const stopLoss = text.match(/stop[- ]loss\s*(?:to|of|at|=)?\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (stopLoss) {
        recognised += 1;
        change('Stop loss', next.risk.stopLoss, Number(stopLoss[1]));
        next.risk.stopLoss = Number(stopLoss[1]);
    }
    const tradeLimit = text.match(new RegExp(`(?:stop|limit)\\s+(?:after|to|at)\\s+${NUMBER}\\s+trades?`));
    if (tradeLimit) {
        const value = toNumber(tradeLimit[1]);
        if (value !== null && value >= 1) {
            recognised += 1;
            change('Trade limit', next.risk.tradeLimit || 'none', Math.floor(value));
            next.risk.tradeLimit = Math.floor(value);
        }
    }

    // Removing a martingale = flat staking. This is a real, supported change.
    if (/\b(?:remove|drop|disable|no)\b[^.]{0,20}\b(?:martingale|progression|multiplier)\b/.test(text)) {
        recognised += 1;
        change('Stake progression', next.risk.multiplier === 1 ? 'Flat (x1)' : `x${next.risk.multiplier}`, 'Flat (x1)');
        next.risk.multiplier = 1;
    }

    // ── Cooldown ─────────────────────────────────────────────────────────────────────────────────
    if (/\b(?:add|include|use|enable)\b[^.]{0,30}\bcool[- ]?down\b/.test(text)) {
        recognised += 1;
        change('Market cooldown', next.risk.cooldownCycles > 0 ? 'On' : 'Off', 'On');
        next.risk.cooldownCycles = Math.max(1, next.risk.cooldownCycles);
        next.risk.cooldownMinutes = Math.max(1, next.risk.cooldownMinutes);
    }

    // ── Filters ──────────────────────────────────────────────────────────────────────────────────
    const frequency = text.match(
        new RegExp(`digits?\\s*(${DIGIT_LIST})[^.]{0,40}?(below|under|above|over|less than|more than|at least|at most)\\s*(\\d+(?:\\.\\d+)?)\\s*%`)
    );
    if (frequency) {
        const operator: FrequencyFilter['operator'] = /below|under|less|at most/.test(frequency[2]) ? 'below' : 'above';
        const percent = Number(frequency[3]);
        const filters = digitsOf(frequency[1]).map(digit => ({ digit, operator, percent }));
        if (filters.length && percent > 0 && percent <= 100) {
            recognised += 1;
            change('Frequency filters', filterText(next.filters), filters.map(item => `digit ${item.digit} ${item.operator} ${item.percent}%`).join(', '));
            next.filters.frequencies = filters;
        }
    } else if (/\b(?:remove|drop|clear|delete)\b[^.]{0,30}\b(?:digit )?(?:frequency|filters?)\b/.test(text)) {
        recognised += 1;
        change('Frequency filters', filterText(next.filters), 'None');
        next.filters.frequencies = [];
        next.filters.barNeutral = [];
    }

    const barDigits = text.match(new RegExp(`digits?\\s*(${DIGIT_LIST})[^.]{0,40}?(?:no|not|without)[^.]{0,30}?\\bbars?\\b`));
    if (barDigits) {
        recognised += 1;
        const digits = digitsOf(barDigits[1]);
        change('Digit bar filters', next.filters.barNeutral.join(', ') || 'none', digits.join(', '));
        next.filters.barNeutral = digits;
    }

    const entryDigits = text.match(new RegExp(`\\bentr(?:y|ies)\\b[^.]{0,30}?\\b(?:is|are|=|:)?\\s*(${DIGIT_LIST})`));
    if (entryDigits) {
        recognised += 1;
        const digits = digitsOf(entryDigits[1]);
        change('Entry digits', next.entry.digits.join(', ') || 'the contract rule', digits.join(' or '));
        next.entry.digits = digits;
    }

    const streak = text.match(new RegExp(`streak[^.]{0,20}?(?:at most|no more than|below|under|<=?)\\s*${NUMBER}`));
    if (streak) {
        const value = toNumber(streak[1]);
        if (value !== null && value >= 1) {
            recognised += 1;
            change('Streak filter', next.filters.streakAtMost ?? 'none', `at most ${value}`);
            next.filters.streakAtMost = Math.floor(value);
        }
    }

    // ── Virtual Hook and mode ────────────────────────────────────────────────────────────────────
    if (/\b(?:add|include|enable|use)\b[^.]{0,30}\b(?:virtual hook|setup observer|next[- ]tick)\b|\brecord the next tick\b/.test(text)) {
        recognised += 1;
        change('Virtual Hook', next.observation.virtualHook ? 'On' : 'Off', 'On');
        next.observation.virtualHook = true;
    }
    if (/\b(?:remove|drop|disable)\b[^.]{0,20}\b(?:virtual hook|setup observer)\b/.test(text)) {
        recognised += 1;
        change('Virtual Hook', next.observation.virtualHook ? 'On' : 'Off', 'Off');
        next.observation.virtualHook = false;
    }
    if (/\bobservation[- ]only\b|\bobserve only\b|\bstop trading\b|\bwithout trading\b|\bdo not trade\b/.test(text)) {
        recognised += 1;
        change('Execution mode', modeLabel(next.mode), modeLabel('observation'));
        next.mode = 'observation';
    } else if (/\bsignal[- ]only\b/.test(text)) {
        recognised += 1;
        change('Execution mode', modeLabel(next.mode), modeLabel('signal'));
        next.mode = 'signal';
    } else if (/\b(?:enable|allow|start|turn on)\b[^.]{0,20}\btrad(?:e|ing)\b|\bdemo trading\b/.test(text)) {
        recognised += 1;
        change('Execution mode', modeLabel(next.mode), modeLabel('demo_trading'));
        next.mode = 'demo_trading';
    }

    // ── Switching behaviour ──────────────────────────────────────────────────────────────────────
    if (/\bswitch markets? only after\b|\bcompleted its evaluation\b/.test(text)) {
        recognised += 1;
        unsupported.push(
            'Holding the scan until the current market finishes its evaluation is already how Switch active market behaves: it waits for the market\'s history and a live tick before judging it, and it does not switch while an entry is being confirmed.'
        );
    }

    // ── Things no registered block can do ────────────────────────────────────────────────────────
    if (/\b(?:remove|drop|without)\b[^.]{0,20}\b(?:risk|stop[- ]loss|take[- ]profit)\b/.test(text)) {
        recognised += 1;
        unsupported.push('Risk controls cannot be removed from a trading bot. Change their values instead, for example "stop loss 20".');
    }
    if (/\b(?:rsi|macd|moving average|bollinger|ema|sma)\b/.test(text)) {
        recognised += 1;
        unsupported.push('Indicator-based rules (RSI, MACD, moving averages) are not available as digit-strategy blocks, so nothing was changed for that part. I can add the missing block if you want it built.');
    }

    // The name and plan follow the spec, so a refinement keeps them in step.
    if (changes.length) {
        const label = next.observation.strategyLabel;
        next.name = `${next.market.scope === 'all' ? 'Multi-Market ' : ''}${label}${next.observation.virtualHook ? ' Virtual Hook' : ''} Bot`;
    }

    const unrecognised = recognised === 0 ? [instruction.trim()] : [];

    return { spec: next, changes, unsupported, unrecognised };
}
