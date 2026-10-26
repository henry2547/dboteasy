/**
 * "Add this bot to another": one bot becomes the second entry rule of another, so both strategies
 * live in one workspace instead of two separate bots.
 *
 * The engine reads the trade options (stake and barrier) at the top of every trade loop, so a bot
 * cannot decide its contract from the tick it is about to trade. The two rules therefore alternate
 * the way the shipped two-leg recovery template does: the target bot trades while it is winning and
 * the added bot takes over after a loss, each keeping its own contract, entry digits and filters.
 *
 * A combination is refused, with the reason, when the engine cannot run both rules in one bot: a
 * different trade family needs a different Trade type, and a second market would need a second
 * subscription. Refusing is deliberate — the alternative would silently drop half of what the user
 * asked for.
 */

import { CONTRACTS } from './builder';
import { normalizeSpec } from './spec-model';
import type { StrategyLeg, StrategySpec } from './types';

export interface CombineOutcome {
    ok: boolean;
    spec?: StrategySpec;
    message: string;
}

const familyOf = (spec: StrategySpec) => CONTRACTS[spec.entry.strategy].tradeType;

export function combineSpecs(target: StrategySpec, addition: StrategySpec): CombineOutcome {
    const primary = normalizeSpec(target);
    const secondary = normalizeSpec(addition);
    const refuse = (message: string): CombineOutcome => ({ ok: false, message });

    if (primary.secondLeg || secondary.secondLeg) {
        return refuse('One of these bots already carries two rules. Generate a fresh bot from a prompt that describes both setups if you need a third.');
    }
    if (primary.mode !== 'demo_trading' || secondary.mode !== 'demo_trading') {
        return refuse('Only trading bots can be combined, because both rules have to place a Purchase. Make both bots Demo trading first.');
    }
    if (primary.market.scope !== secondary.market.scope) {
        return refuse(
            `"${primary.name}" trades ${primary.market.scope === 'all' ? 'every market' : primary.market.symbol} but "${secondary.name}" trades ${
                secondary.market.scope === 'all' ? 'every market' : secondary.market.symbol
            }. One bot follows one market selection; make both bots scan the same markets first.`
        );
    }
    if (primary.market.scope === 'single' && primary.market.symbol !== secondary.market.symbol) {
        return refuse(`One bot subscribes to one market: "${primary.name}" uses ${primary.market.symbol}, "${secondary.name}" uses ${secondary.market.symbol}.`);
    }
    if (familyOf(primary) !== familyOf(secondary)) {
        return refuse(
            `"${primary.name}" buys ${familyOf(primary)} contracts and "${secondary.name}" buys ${familyOf(secondary)} ones, and a bot has one Trade type. Combine bots from the same family (Over/Under with Over/Under, Even with Odd, Matches with Differs).`
        );
    }

    const leg: StrategyLeg = {
        strategy: secondary.entry.strategy,
        barrier: secondary.entry.barrier,
        digits: secondary.entry.digits,
        filters: secondary.filters,
        label: secondary.observation.strategyLabel,
    };

    const combined: StrategySpec = {
        ...primary,
        name: `${primary.name} + ${leg.label}`,
        purpose: [primary.purpose, secondary.purpose].filter(Boolean).join(' | ').slice(0, 240),
        secondLeg: leg,
    };

    return {
        ok: true,
        spec: combined,
        message: `${primary.observation.strategyLabel} now runs with ${leg.label} as its second rule: it trades ${primary.observation.strategyLabel} until a contract loses, then ${leg.label} until the next win. Risk settings come from ${primary.name}.`,
    };
}
