/**
 * Step F: tell the user, in plain language, what the generated bot does and which registered blocks
 * implement each part. Every line is derived from the spec and the block tree, never written
 * separately, so the explanation cannot drift from what the workspace actually contains.
 */

import { allBlocks, CONTRACTS } from './builder';
import { CATEGORY_LABELS, type Registry } from './registry';
import { filterText, indicatorText, normalizeSpec } from './spec-model';
import type { BlockUse, BuiltWorkspace, Explanation, FlowStep, StrategySpec } from './types';

const MODE_TEXT: Record<StrategySpec['mode'], string> = {
    observation: 'Observation only. It never buys a contract; it records what it sees and stops itself.',
    signal: 'Signal detection only. It reports when the entry condition is met and never buys a contract.',
    demo_trading:
        'Demo trading, started only by you. Loading the bot does not start it. Press Start; a Real account needs an extra explicit confirmation.',
};

const strategyText = (spec: StrategySpec): string =>
    `${spec.observation.strategyLabel}${spec.entry.strategy === 'even' || spec.entry.strategy === 'odd' ? ' digits' : ''}`;

/** True when the two legs buy different contract families — the two-market engine's own switch. */
const familiesDiffer = (spec: StrategySpec): boolean =>
    !!spec.secondLeg && CONTRACTS[spec.entry.strategy].tradeType !== CONTRACTS[spec.secondLeg.strategy].tradeType;

export function explainBot(input: StrategySpec, workspace: BuiltWorkspace, registry: Registry): Explanation {
    const spec = normalizeSpec(input);
    const blocks = allBlocks(workspace);
    const has = (type: string) => blocks.some(block => block.type === type);
    const typesOf = (prefix: string) => [...new Set(blocks.filter(block => block.type.startsWith(prefix)).map(block => block.type))];
    const trading = spec.mode === 'demo_trading';
    const multi = spec.market.scope === 'all';

    // ── Summary ──────────────────────────────────────────────────────────────────────────────────
    const summary: string[] = [];
    summary.push(
        multi
            ? `Scans every supported volatility market, one at a time, and looks for the ${strategyText(spec)} entry on each market's own genuine ticks.`
            : `Watches ${spec.market.symbol} and looks for the ${strategyText(spec)} entry on its genuine ticks.`
    );
    summary.push(`Analyses the last ${spec.filters.window} ticks of the market it is on.`);
    spec.filters.frequencies.forEach(({ digit, operator, percent }) => {
        summary.push(`Requires digit ${digit}'s share of that window to be ${operator} ${percent}% (a statistical filter, separate from the contract barrier).`);
    });
    spec.filters.barNeutral.forEach(digit => {
        summary.push(`Requires digit ${digit} to carry neither the green (hottest) nor the red (coldest) bar of the digit grid.`);
    });
    if (spec.filters.streakAtMost !== null) summary.push(`Requires no more than ${spec.filters.streakAtMost} identical digits in a row.`);
    if (spec.entry.digits.length) summary.push(`Waits for the last digit to be ${spec.entry.digits.join(' or ')}.`);
    spec.indicators.forEach(indicator => summary.push(`Custom indicator — requires ${indicator.label.toLowerCase()} before it enters.`));
    if (spec.secondLeg) {
        summary.push(
            `Trades the ${spec.secondLeg.label} rule after a loss and returns to ${strategyText(spec)} after a win, so both rules you added run in one bot.${
                familiesDiffer(spec) ? ' Each leg buys its own contract family through the two-market engine.' : ''
            }`
        );
        spec.secondLeg.indicators.forEach(indicator => summary.push(`Second rule indicator — requires ${indicator.label.toLowerCase()}.`));
    }
    if (spec.analysis.bestParityMarket) summary.push('Analysis tool: measures every eligible market and moves to the strongest even/odd split before the entry gate.');
    if (spec.analysis.rankMarkets) summary.push('Analysis tool: ranks the discovered markets by how well the entry rule fits each one.');
    if (spec.analysis.strategyReport) summary.push('Analysis tool: labels each rule’s trades and writes the engine’s own per-strategy report when the session stops.');
    if (spec.realism.entryDelaySeconds + spec.realism.entryJitterSeconds > 0) {
        summary.push(
            `Pacing: waits ${spec.realism.entryDelaySeconds}s${
                spec.realism.entryJitterSeconds > 0 ? ` plus up to ${spec.realism.entryJitterSeconds}s of random spread` : ''
            } before each entry instead of buying on the first qualifying tick.`
        );
    }
    if (spec.realism.lossCooldownSeconds > 0) summary.push(`After a losing contract it waits ${spec.realism.lossCooldownSeconds}s before the next entry.`);
    if (spec.realism.stakeJitterPercent > 0) summary.push(`Varies the stake by up to ${spec.realism.stakeJitterPercent}% either way, so contracts are not all the same size.`);
    if (spec.observation.virtualHook) {
        summary.push('When the entry condition holds, it records the setup in the run log and observes the next genuine tick of the same market. That observation is not a purchased contract.');
    }
    summary.push(
        trading
            ? `Then it requests a ${strategyText(spec)} proposal and buys it only if the risk checks allow it, with a stake of ${spec.risk.stake}.`
            : 'It never places a trade.'
    );

    // ── Configuration ────────────────────────────────────────────────────────────────────────────
    const configuration: Explanation['configuration'] = [
        { label: 'Markets', value: multi ? `All supported volatility markets (${spec.market.order === 'round_robin' ? 'round-robin' : 'sequential'}, ${spec.market.maxSwitches === 0 ? 'each once per search' : `up to ${spec.market.maxSwitches}`})` : String(spec.market.symbol) },
        { label: 'Strategy', value: strategyText(spec) },
        { label: 'Barrier digit', value: spec.entry.barrier === null ? 'None (Even/Odd)' : String(spec.entry.barrier) },
        {
            label: 'Entry trigger',
            value: spec.entry.digits.length ? `Last digit is ${spec.entry.digits.join(' or ')}` : 'Last digit rule for the chosen contract',
        },
        { label: 'History window', value: `${spec.filters.window} ticks` },
        { label: 'Filters', value: filterText(spec.filters) },
        { label: 'Custom indicators', value: indicatorText(spec.indicators) || 'None' },
        {
            label: 'Analysis tools',
            value:
                [
                    spec.analysis.rankMarkets ? 'rank the discovered markets' : null,
                    spec.analysis.bestParityMarket ? 'best even/odd market scan' : null,
                    spec.analysis.strategyReport ? 'per-strategy results report' : null,
                ]
                    .filter(Boolean)
                    .join(', ') || 'None',
        },
        {
            label: 'Session pacing',
            value:
                [
                    spec.realism.entryDelaySeconds + spec.realism.entryJitterSeconds > 0
                        ? `wait ${spec.realism.entryDelaySeconds}s${spec.realism.entryJitterSeconds > 0 ? ` + up to ${spec.realism.entryJitterSeconds}s random` : ''} before entry`
                        : null,
                    spec.realism.lossCooldownSeconds > 0 ? `${spec.realism.lossCooldownSeconds}s pause after a loss` : null,
                    spec.realism.stakeJitterPercent > 0 ? `stake varies ±${spec.realism.stakeJitterPercent}%` : null,
                ]
                    .filter(Boolean)
                    .join(', ') || 'None (buys as soon as the entry holds)',
        },
        ...(spec.secondLeg
            ? [
                  { label: 'Second leg', value: spec.secondLeg.label },
                  {
                      label: 'Second leg entry',
                      value: spec.secondLeg.digits.length
                          ? `Last digit is ${spec.secondLeg.digits.join(' or ')}`
                          : 'Last digit rule for the chosen contract',
                  },
                  { label: 'Second leg filters', value: filterText(spec.secondLeg.filters) },
              ]
            : []),
        { label: 'Virtual Hook', value: spec.observation.virtualHook ? 'On (records the setup, observes the next tick)' : 'Off' },
        { label: 'Execution', value: spec.mode === 'demo_trading' ? 'Demo trading (you press Start)' : spec.mode === 'signal' ? 'Signal only' : 'Observation only' },
    ];
    if (trading) {
        configuration.push(
            { label: 'Stake', value: `${spec.risk.stake} (${spec.risk.multiplier === 1 ? 'flat' : `x${spec.risk.multiplier} after a loss`})` },
            { label: 'Duration', value: '1 tick' },
            { label: 'Take profit', value: String(spec.risk.takeProfit) },
            { label: 'Stop loss', value: String(spec.risk.stopLoss) },
            { label: 'Stop after losses', value: `${spec.risk.maxConsecutiveLosses} in a row` },
            { label: 'Trade limit', value: spec.risk.tradeLimit > 0 ? `${spec.risk.tradeLimit} trades` : 'None' }
        );
    }

    // ── Execution flow, in the order the blocks run ──────────────────────────────────────────────
    const flow: FlowStep[] = [];
    const add = (title: string, stage: FlowStep['stage'], types: string[]) => {
        const present = types.filter(type => has(type));
        if (present.length) flow.push({ order: flow.length + 1, title, stage, blocks: present });
    };

    add('Set up the trade and seed the stake', 'validation', ['trade_definition', 'trade_definition_market', 'trade_definition_tradetype', 'trade_definition_contracttype', 'trade_definition_tradeoptions']);
    add('Discover eligible markets', 'discovery', ['market_discover_eligible']);
    add('Switch market until the entry holds', 'discovery', ['switch_active_market']);
    add(`Analyse the last ${spec.filters.window} ticks`, 'analysis', ['digits_frequency', 'digits_bar_neutral', 'digits_streak']);
    add('Measure the market pool', 'analysis', ['market_rank', 'switch_best_parity_market']);
    add('Check the custom indicators', 'analysis', ['digits_high_run', 'digits_hot_cold']);
    add('Check the entry condition', 'entry', ['last_digit', 'digits_matches_differs', 'digits_even_odd', 'logic_compare']);
    add('Pace the entry and vary the stake', 'entry', ['timeout', 'math_random_float', 'math_round']);
    add('Record the setup and observe the next tick', 'observation', ['report_journal', ...typesOf('obs_configure_'), ...typesOf('obs_evaluate_'), 'obs_set_digit']);
    add('Validate the risk limits', 'validation', ['risk_can_trade']);
    add('Label the rule and request the proposal', 'purchase', ['learn_set_strategy', 'purchase']);
    add('Monitor the contract and apply the stop rules', 'monitoring', ['after_purchase', 'contract_check_result', 'read_details', 'bot_trade_limit_reached', 'trade_again']);
    add('Stop the bot', 'monitoring', ['bot_stop']);
    add('Report the session', 'reporting', ['report_session']);
    add('Report each strategy', 'reporting', ['learn_report']);

    // ── Blocks used, grouped by palette category ─────────────────────────────────────────────────
    const roles = new Map<string, string>();
    for (const block of blocks) if (block.role && !roles.has(block.type)) roles.set(block.type, block.role);

    const counts = new Map<string, number>();
    for (const block of blocks) counts.set(block.type, (counts.get(block.type) ?? 0) + 1);

    const used: BlockUse[] = [...counts.entries()]
        .map(([type, count]) => {
            const entry = registry.get(type);
            return {
                type,
                displayName: entry?.displayName ?? type,
                category: CATEGORY_LABELS[entry?.category ?? ''] ?? entry?.category ?? 'Other',
                count,
                role: roles.get(type) ?? entry?.semantics ?? '',
            };
        })
        .sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName));

    return { summary, configuration, flow, blocks: used, tradeBehaviour: MODE_TEXT[spec.mode] };
}
