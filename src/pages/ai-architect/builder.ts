/**
 * StrategySpec -> block tree -> Blockly XML (Steps C and D).
 *
 * The builder works on a `BlockNode` tree, never on free text, and only the serialiser at the end
 * writes XML. Every structural rule here comes from how the engine really runs a canvas:
 *
 *  - The stake is seeded in the trade definition's INITIALIZATION statement. `Bot.start()` reads
 *    the AMOUNT input before `before_purchase` runs, so a stake first set there would be NaN on
 *    the first proposal.
 *  - Digit and observer conditions live INSIDE `before_purchase`; that is where the engine
 *    evaluates them against the active market's genuine ticks.
 *  - `switch_active_market` wraps the entry condition, and the confirmation re-checks the same
 *    condition on the market the scan froze, so a digit from another market never decides a buy.
 *  - A bot that is not meant to trade has NO `purchase` and NO `trade_again`, so loading and
 *    pressing Start cannot buy anything. It ends with `bot_stop`.
 *  - The observer's entry blocks (`obs_entry`, ...) raise a trade-entry gate, so they are never
 *    placed (see FORBIDDEN_BLOCKS). The Virtual Hook is `obs_configure_* + obs_evaluate_*`, which
 *    arm a genuine next-tick observation without raising that gate.
 */

import type { BlockNode, BuiltWorkspace, StrategyKind, StrategyLeg, StrategySpec } from './types';
import { legsOf, normalizeSpec } from './spec-model';

// ── Contract table ──────────────────────────────────────────────────────────────────────────────

interface ContractInfo {
    contractType: string;
    tradeType: 'overunder' | 'evenodd' | 'matchesdiffers';
    label: string;
}

export const CONTRACTS: Record<StrategyKind, ContractInfo> = {
    over: { contractType: 'DIGITOVER', tradeType: 'overunder', label: 'Over' },
    under: { contractType: 'DIGITUNDER', tradeType: 'overunder', label: 'Under' },
    matches: { contractType: 'DIGITMATCH', tradeType: 'matchesdiffers', label: 'Matches' },
    differs: { contractType: 'DIGITDIFF', tradeType: 'matchesdiffers', label: 'Differs' },
    even: { contractType: 'DIGITEVEN', tradeType: 'evenodd', label: 'Even' },
    odd: { contractType: 'DIGITODD', tradeType: 'evenodd', label: 'Odd' },
};

// ── Variables ───────────────────────────────────────────────────────────────────────────────────

const VAR_IDS = {
    stake: 'aa-var-stake',
    profit: 'aa-var-profit',
    won: 'aa-var-won',
    stop: 'aa-var-stop',
    initialised: 'aa-var-initialised',
    losses: 'aa-var-losses',
    leg: 'aa-var-leg',
    prediction: 'aa-var-prediction',
    entryStake: 'aa-var-entry-stake',
} as const;
type VarKey = keyof typeof VAR_IDS;

const VAR_NAMES: Record<VarKey, string> = {
    stake: 'architect:stake',
    profit: 'architect:profit',
    won: 'architect:won',
    stop: 'architect:stop',
    initialised: 'architect:initialised',
    losses: 'architect:losses',
    leg: 'architect:leg',
    prediction: 'architect:prediction',
    // The stake one entry really spends: the base stake plus/minus the configured variation. The
    // name ends in `:stake` on purpose — the validator's "stake is seeded before the first quote"
    // check reads that suffix.
    entryStake: 'architect:live:stake',
};

// ── Node helpers ────────────────────────────────────────────────────────────────────────────────

class Ids {
    private n = 0;
    next(prefix: string): string {
        this.n += 1;
        return `aa-${prefix}-${this.n}`;
    }
}

const node = (id: string, type: string, rest: Omit<BlockNode, 'id' | 'type'> = {}): BlockNode => ({ id, type, ...rest });

const num = (ids: Ids, value: number, shadow = false, type = 'math_number'): BlockNode =>
    node(ids.next('num'), type, { fields: { NUM: value }, ...(shadow ? { shadow: true } : {}) });

const bool = (ids: Ids, value: boolean): BlockNode => node(ids.next('bool'), 'logic_boolean', { fields: { BOOL: value ? 'TRUE' : 'FALSE' } });

const getVar = (ids: Ids, key: VarKey): BlockNode => node(ids.next('get'), 'variables_get', { fields: { VAR: VAR_NAMES[key] } });

const setVar = (ids: Ids, key: VarKey, value: BlockNode): BlockNode =>
    node(ids.next('set'), 'variables_set', { fields: { VAR: VAR_NAMES[key] }, values: { VALUE: [value] } });

const compare = (ids: Ids, op: string, a: BlockNode, b: BlockNode): BlockNode =>
    node(ids.next('cmp'), 'logic_compare', { fields: { OP: op }, values: { A: [a], B: [b] } });

const not = (ids: Ids, value: BlockNode): BlockNode => node(ids.next('not'), 'logic_negate', { values: { BOOL: [value] } });

const and = (ids: Ids, a: BlockNode, b: BlockNode): BlockNode =>
    node(ids.next('and'), 'logic_operation', { fields: { OP: 'AND' }, values: { A: [a], B: [b] } });

const or = (ids: Ids, a: BlockNode, b: BlockNode): BlockNode =>
    node(ids.next('or'), 'logic_operation', { fields: { OP: 'OR' }, values: { A: [a], B: [b] } });

const text = (ids: Ids, value: string): BlockNode => node(ids.next('text'), 'text', { fields: { TEXT: value } });

const ifThen = (ids: Ids, condition: BlockNode, body: BlockNode[], otherwise?: BlockNode[], role?: string): BlockNode =>
    node(ids.next('if'), 'controls_if', {
        ...(otherwise ? { mutation: { else: '1' } } : {}),
        values: { IF0: [condition] },
        statements: { DO0: body, ...(otherwise ? { ELSE: otherwise } : {}) },
        ...(role ? { role } : {}),
    });

const journal = (ids: Ids, message: BlockNode, level: 'info' | 'warn' | 'error' = 'info', role?: string): BlockNode =>
    node(ids.next('log'), 'report_journal', { fields: { LEVEL: level }, values: { MESSAGE: [message] }, ...(role ? { role } : {}) });

const arithmetic = (ids: Ids, op: 'ADD' | 'MINUS' | 'MULTIPLY' | 'DIVIDE', a: BlockNode, b: BlockNode): BlockNode =>
    node(ids.next('math'), 'math_arithmetic', { fields: { OP: op }, values: { A: [a], B: [b] } });

const randomFraction = (ids: Ids): BlockNode => node(ids.next('random'), 'math_random_float');

const roundNumber = (ids: Ids, value: BlockNode): BlockNode =>
    node(ids.next('round'), 'math_round', { fields: { OP: 'ROUND' }, values: { NUM: [value] } });

/** "Run after a wait": the pacing block that keeps entries off a fixed, per-tick cadence. */
const waitThen = (ids: Ids, seconds: BlockNode, body: BlockNode[], role?: string): BlockNode =>
    node(ids.next('wait'), 'timeout', { values: { SECONDS: [seconds] }, statements: { TIMEOUTSTACK: body }, ...(role ? { role } : {}) });

// ── Entry condition: the trigger, kept separate from the barrier and the filters ────────────────

/**
 * The digit rule the bot waits for. Mirrors the shipped Multi-Market templates exactly. When the user
 * listed the entry digits ("entry is 5 and 6") each of them is accepted on its own, so the entry is an
 * OR of those digits instead of the barrier comparison.
 */
function entryTrigger(ids: Ids, leg: StrategyLeg): BlockNode {
    const { strategy, barrier, digits } = leg;
    if (digits.length) {
        return digits
            .map(digit => compare(ids, 'EQ', node(ids.next('digit'), 'last_digit'), num(ids, digit, true)))
            .reduce((all, digit) => or(ids, all, digit));
    }
    if (strategy === 'over') {
        return compare(ids, 'LTE', node(ids.next('digit'), 'last_digit'), num(ids, barrier as number, true));
    }
    if (strategy === 'under') {
        return compare(ids, 'GTE', node(ids.next('digit'), 'last_digit'), num(ids, barrier as number, true));
    }
    if (strategy === 'matches' || strategy === 'differs') {
        return node(ids.next('md'), 'digits_matches_differs', { fields: { MODE: strategy, DIGIT: String(barrier) } });
    }
    return node(ids.next('eo'), 'digits_even_odd', { fields: { PARITY: strategy } });
}

/**
 * Every statistical filter the user stated, over the leg's own historical window — one frequency
 * comparison per digit, one bar-neutral read per digit, plus the streak rule. All are ANDed.
 */
function filterConditions(ids: Ids, leg: StrategyLeg): BlockNode[] {
    const conditions: BlockNode[] = [];
    const { frequencies, streakAtMost, window, barNeutral } = leg.filters;

    frequencies.forEach(filter => {
        conditions.push(
            compare(
                ids,
                filter.operator === 'below' ? 'LTE' : 'GTE',
                node(ids.next('freq'), 'digits_frequency', {
                    fields: { DIGIT: String(filter.digit) },
                    values: { SAMPLE: [num(ids, window, true)] },
                }),
                num(ids, filter.percent, true)
            )
        );
    });
    barNeutral.forEach(digit => {
        conditions.push(
            node(ids.next('bar'), 'digits_bar_neutral', {
                fields: { DIGIT: String(digit) },
                values: { SAMPLE: [num(ids, window, true)] },
                role: `Digit ${digit} carries neither the hot nor the cold bar.`,
            })
        );
    });
    if (streakAtMost !== null) {
        conditions.push(compare(ids, 'LTE', node(ids.next('streak'), 'digits_streak'), num(ids, streakAtMost, true)));
    }
    conditions.push(...indicatorConditions(ids, leg));
    return conditions;
}

/**
 * The custom indicators of a leg, each as its own real block. They are ANDed with the rest of the
 * entry, so the same rule gates the market scan and the buy that follows it.
 */
function indicatorConditions(ids: Ids, leg: StrategyLeg): BlockNode[] {
    return (leg.indicators ?? []).map(indicator => {
        if (indicator.kind === 'high_run') {
            return node(ids.next('run'), 'digits_high_run', {
                fields: { MODE: indicator.mode, DIGIT: String(indicator.digit) },
                values: { COUNT: [num(ids, indicator.count ?? 3, true)] },
                role: indicator.label,
            });
        }
        return compare(
            ids,
            'EQ',
            node(ids.next('hotcold'), 'digits_hot_cold', {
                fields: { MODE: indicator.mode },
                values: { SAMPLE: [num(ids, indicator.window, true)] },
                role: `Indicator: the ${indicator.mode} digit of the window is ${indicator.digit}.`,
            }),
            num(ids, indicator.digit, true)
        );
    });
}

/** Trigger AND every filter, as one Boolean the switch block and the confirmation both use. */
function entryCondition(ids: Ids, leg: StrategyLeg): BlockNode {
    return filterConditions(ids, leg).reduce((all, filter) => and(ids, all, filter), entryTrigger(ids, leg));
}

// ── Trade definition ────────────────────────────────────────────────────────────────────────────

function tradeDefinition(ids: Ids, spec: StrategySpec): BlockNode {
    const legs = legsOf(spec);
    const primary = legs[0];
    const info = CONTRACTS[primary.strategy];
    const hasPrediction = legs.some(leg => leg.barrier !== null);
    const twoLegs = legs.length > 1;
    const contracts = [...new Set(legs.map(leg => CONTRACTS[leg.strategy].contractType))];
    // One contract type for a single-leg bot; `both` lets each leg's Purchase block name its own
    // contract, exactly like the shipped two-leg recovery template.
    const contractType = contracts.length === 1 ? contracts[0] : 'both';
    const locked = { deletable: 'false', movable: 'false' };

    const options: BlockNode[] = [
        node('aa-market', 'trade_definition_market', {
            attrs: locked,
            fields: { MARKET_LIST: 'synthetic_index', SUBMARKET_LIST: 'random_index', SYMBOL_LIST: spec.defaultMarket },
            role: 'Starting market; Switch active market re-points it during a scan.',
        }),
        node('aa-tradetype', 'trade_definition_tradetype', { attrs: locked, fields: { TRADETYPECAT_LIST: 'digits', TRADETYPE_LIST: info.tradeType } }),
        node('aa-contracttype', 'trade_definition_contracttype', {
            attrs: locked,
            fields: { TYPE_LIST: contractType },
            role: twoLegs ? 'Both legs buy their own contract.' : `${info.label} contract.`,
        }),
        node('aa-candle', 'trade_definition_candleinterval', { attrs: locked, fields: { CANDLEINTERVAL_LIST: '60' } }),
        node('aa-restartbuysell', 'trade_definition_restartbuysell', { attrs: locked, fields: { TIME_MACHINE_ENABLED: 'FALSE' } }),
        node('aa-restartonerror', 'trade_definition_restartonerror', { attrs: locked, fields: { RESTARTONERROR: 'TRUE' } }),
    ];

    // The stake is seeded here (run once) so the first proposal never sees an undefined amount.
    const seed: BlockNode[] = [
        setVar(ids, 'initialised', bool(ids, true)),
        setVar(ids, 'stake', num(ids, spec.risk.stake)),
        setVar(ids, 'profit', num(ids, 0)),
        setVar(ids, 'losses', num(ids, 0)),
        setVar(ids, 'stop', bool(ids, false)),
    ];
    if (twoLegs) {
        seed.push(setVar(ids, 'leg', num(ids, 0)));
        if (hasPrediction) seed.push(setVar(ids, 'prediction', num(ids, primary.barrier ?? 0)));
    }
    if (spec.realism.stakeJitterPercent > 0) seed.push(setVar(ids, 'entryStake', num(ids, spec.risk.stake)));
    const initialisation = ifThen(ids, not(ids, getVar(ids, 'initialised')), seed, undefined, 'Seeds the stake and counters before the first quote.');

    // A two-leg bot carries its barrier in a variable, because the leg that will trade next decides
    // it; the trade options are generated at the top of every loop, so the variable is always current.
    const prediction = twoLegs
        ? getVar(ids, 'prediction')
        : num(ids, primary.barrier as number, true, 'math_number_positive');

    const tradeOptions = node('aa-tradeoptions', 'trade_definition_tradeoptions', {
        mutation: { has_first_barrier: 'false', has_second_barrier: 'false', has_prediction: String(hasPrediction) },
        fields: { DURATIONTYPE_LIST: 't', CURRENCY_LIST: 'USD', AMOUNT_LIMITS: '' },
        values: {
            DURATION: [num(ids, 1, true, 'math_number_positive')],
            AMOUNT: [num(ids, spec.risk.stake, true, 'math_number_positive'), getVar(ids, spec.realism.stakeJitterPercent > 0 ? 'entryStake' : 'stake')],
            ...(hasPrediction ? { PREDICTION: [prediction] } : {}),
        },
        role: 'One-tick duration, the stake variable and the barrier digit.',
    });

    return node('aa-definition', 'trade_definition', {
        attrs: { x: '0', y: '0' },
        statements: { TRADE_OPTIONS: options, INITIALIZATION: [initialisation], SUBMARKET: [tradeOptions] },
    });
}

// ── Virtual Hook ────────────────────────────────────────────────────────────────────────────────

/**
 * Records the qualifying setup in the run log and arms a genuine next-tick observation. The
 * observation never reads a tick that did not arrive, and it never counts as a purchased contract.
 */
function virtualHook(ids: Ids, spec: StrategySpec, leg: StrategyLeg = legsOf(spec)[0]): BlockNode[] {
    const { strategy, barrier } = leg;
    const where = spec.market.scope === 'all' ? 'the active market' : spec.market.symbol;
    const configure: BlockNode[] = [node(ids.next('cfg'), `obs_configure_${strategy}`, { role: 'Tells the observer which contract the next observation is about.' })];
    if ((strategy === 'matches' || strategy === 'differs') && barrier !== null) {
        configure.unshift(node(ids.next('digit'), 'obs_set_digit', { fields: { DIGIT: barrier }, role: 'Digit the observation is about.' }));
    }
    return [
        journal(
            ids,
            text(ids, `Virtual setup: ${leg.label} entry condition met on ${where}; observing the next genuine tick (not a purchased contract).`),
            'info',
            'Records the setup in the run log.'
        ),
        ...configure,
        node(ids.next('eval'), `obs_evaluate_${strategy}`, { role: 'Observes the next genuine tick of the same market and records the outcome.' }),
    ];
}

// ── Session realism (pacing, cooldown, stake variation) ───────────────────────────────────────

/** Seconds a bot waits before buying: the fixed delay plus a random part, so entries are not on one cadence. */
const entryWaitSeconds = (spec: StrategySpec): number => spec.realism.entryDelaySeconds + spec.realism.entryJitterSeconds;

function entryWait(ids: Ids, spec: StrategySpec): BlockNode {
    const base = num(ids, spec.realism.entryDelaySeconds, true);
    if (spec.realism.entryJitterSeconds <= 0) return base;
    return arithmetic(ids, 'ADD', base, arithmetic(ids, 'MULTIPLY', randomFraction(ids), num(ids, spec.realism.entryJitterSeconds, true)));
}

/**
 * The stake one entry really spends: the current stake moved by a random share of itself, rounded to
 * a whole unit. A losing run still grows the base stake (the martingale), so variation never replaces
 * the risk plan — it only stops every contract being the identical size.
 */
function jitteredStake(ids: Ids, spec: StrategySpec): BlockNode {
    const span = (spec.realism.stakeJitterPercent / 100) * 2; // ±share around the current stake
    const offset = arithmetic(
        ids,
        'MULTIPLY',
        arithmetic(ids, 'MINUS', randomFraction(ids), num(ids, 0.5)),
        num(ids, span)
    );
    const factor = arithmetic(ids, 'ADD', num(ids, 1), offset);
    return roundNumber(ids, arithmetic(ids, 'MULTIPLY', getVar(ids, 'stake'), factor));
}

// ── Before purchase ─────────────────────────────────────────────────────────────────────────────

function riskGuard(ids: Ids): BlockNode {
    return node(ids.next('risk'), 'risk_can_trade', { role: 'Blocks entries once a configured risk limit has been breached.' });
}

function beforePurchase(ids: Ids, spec: StrategySpec): BlockNode {
    const trading = spec.mode === 'demo_trading';
    const notStopped = not(ids, getVar(ids, 'stop'));
    const legs = trading ? legsOf(spec) : [legsOf(spec)[0]];
    const twoLegs = legs.length > 1;

    const body: BlockNode[] = [];

    // 1. Market selection. The parity scan measures every market's own even/odd split and moves the
    // bot to the strongest one; otherwise the ordinary discovery + scan runs. Both legs' conditions
    // count, so a market is chosen when either leg fits.
    if (trading && spec.analysis.bestParityMarket) {
        body.push(
            node(ids.next('parity'), 'switch_best_parity_market', {
                values: { TICKS: [num(ids, spec.filters.window, true)] },
                role: 'Analysis tool: measures every eligible market and uses the strongest even/odd split.',
            })
        );
    } else if (spec.market.scope === 'all') {
        body.push(
            node(ids.next('discover'), 'market_discover_eligible', {
                fields: { CATEGORY: spec.market.category, VERIFY: 'no' },
                values: { MIN_HISTORY: [num(ids, spec.market.minHistory, true)] },
                role: 'Discovers the eligible volatility markets dynamically.',
            })
        );
        if (spec.analysis.rankMarkets) {
            body.push(
                node(ids.next('rank'), 'market_rank', {
                    fields: { CRITERION: 'entry' },
                    values: { MIN_SAMPLE: [num(ids, spec.filters.window, true)] },
                    role: 'Analysis tool: ranks the discovered markets by how well the entry rule fits each one.',
                })
            );
        }
        body.push(
            node(ids.next('switch'), 'switch_active_market', {
                fields: { ORDER: spec.market.order },
                values: {
                    MAX_SWITCHES: [num(ids, spec.market.maxSwitches)],
                    CONDITION: [legs.map(leg => entryCondition(ids, leg)).reduce((all, condition) => or(ids, all, condition))],
                },
                role: 'Scans markets until the entry condition holds, using only each market\'s own ticks.',
            })
        );
    }

    // 2. Everything that happens on a confirmed entry.
    const onEntry = (leg: StrategyLeg): BlockNode[] => {
        const actions: BlockNode[] = [];
        if (spec.observation.virtualHook) actions.push(...virtualHook(ids, spec, leg));
        if (trading) {
            if (spec.analysis.strategyReport) {
                actions.push(
                    node(ids.next('label'), 'learn_set_strategy', {
                        fields: { NAME: leg.label },
                        role: `Labels these contracts as “${leg.label}” so the engine measures this rule's own results.`,
                    })
                );
            }
            if (spec.realism.stakeJitterPercent > 0) {
                actions.push({
                    ...setVar(ids, 'entryStake', jitteredStake(ids, spec)),
                    role: `Varies the stake by up to ${spec.realism.stakeJitterPercent}% so every contract is not the same size.`,
                });
            }
            const buy = node(ids.next('buy'), 'purchase', {
                fields: { PURCHASE_LIST: CONTRACTS[leg.strategy].contractType },
                role: `Requests the ${leg.label} proposal and buys it through the engine.`,
            });
            actions.push(
                entryWaitSeconds(spec) > 0
                    ? waitThen(ids, entryWait(ids, spec), [buy], 'Analysis-based pacing: waits before buying instead of firing on every tick.')
                    : buy
            );
            return actions;
        }
        if (!spec.observation.virtualHook) {
            actions.push(
                journal(
                    ids,
                    text(ids, `Signal: ${leg.label} entry condition met. No contract was bought (${spec.mode === 'signal' ? 'signal only' : 'observation only'}).`),
                    'info',
                    'Reports the signal; this bot never buys.'
                )
            );
        }
        actions.push(
            node(ids.next('stop'), 'bot_stop', {
                values: { REASON: [text(ids, `${spec.mode === 'signal' ? 'Signal' : 'Observation'} complete`)] },
                role: 'Ends the run once the signal has been reported.',
            })
        );
        return actions;
    };

    // 3. Confirm on the market the scan froze, with the SAME condition, behind the risk guard.
    if (twoLegs) {
        const [primary, secondary] = legs;
        body.push(
            ifThen(
                ids,
                compare(ids, 'EQ', getVar(ids, 'leg'), num(ids, 0, true)),
                [ifThen(ids, and(ids, riskGuard(ids), entryCondition(ids, primary)), onEntry(primary), undefined, 'Primary leg.')],
                [ifThen(ids, and(ids, riskGuard(ids), entryCondition(ids, secondary)), onEntry(secondary), undefined, 'Second leg, after a loss.')],
                'Trades the primary rule while it is winning and the second rule after a loss.'
            )
        );
    } else {
        const confirm = trading ? and(ids, riskGuard(ids), entryCondition(ids, legs[0])) : entryCondition(ids, legs[0]);
        body.push(ifThen(ids, confirm, onEntry(legs[0]), undefined, 'Confirms the entry on the market the scan stopped on.'));
    }

    return node('aa-before-purchase', 'before_purchase', {
        attrs: { x: '0', y: '740' },
        statements: { BEFOREPURCHASE_STACK: [ifThen(ids, notStopped, body, undefined, 'Does nothing once the bot has been told to stop.')] },
    });
}

// ── After purchase ──────────────────────────────────────────────────────────────────────────────

function afterPurchase(ids: Ids, spec: StrategySpec): BlockNode {
    const { risk } = spec;
    const stack: BlockNode[] = [
        setVar(ids, 'won', node(ids.next('result'), 'contract_check_result', { fields: { CHECK_RESULT: 'win' } })),
        setVar(
            ids,
            'profit',
            node(ids.next('sum'), 'math_arithmetic', {
                fields: { OP: 'ADD' },
                values: {
                    A: [getVar(ids, 'profit')],
                    B: [node(ids.next('detail'), 'read_details', { fields: { DETAIL_INDEX: '4' } })],
                },
            })
        ),
        ifThen(ids, compare(ids, 'GTE', getVar(ids, 'profit'), num(ids, risk.takeProfit, true)), [setVar(ids, 'stop', bool(ids, true))], undefined, 'Take profit.'),
        ifThen(ids, compare(ids, 'LTE', getVar(ids, 'profit'), num(ids, -risk.stopLoss, true)), [setVar(ids, 'stop', bool(ids, true))], undefined, 'Stop loss.'),
        ifThen(
            ids,
            getVar(ids, 'won'),
            [setVar(ids, 'losses', num(ids, 0))],
            [setVar(ids, 'losses', node(ids.next('inc'), 'math_arithmetic', { fields: { OP: 'ADD' }, values: { A: [getVar(ids, 'losses')], B: [num(ids, 1)] } }))],
            'Counts consecutive losses.'
        ),
        ifThen(
            ids,
            compare(ids, 'GTE', getVar(ids, 'losses'), num(ids, risk.maxConsecutiveLosses, true)),
            [setVar(ids, 'stop', bool(ids, true))],
            undefined,
            'Stops after the configured consecutive losses.'
        ),
    ];

    // A combined bot alternates: the second leg trades after a loss, the primary after a win. The
    // barrier variable is set here so the next loop's trade options carry the right prediction.
    if (spec.secondLeg) {
        const nextLeg = (index: 0 | 1, leg: StrategyLeg): BlockNode[] => [
            setVar(ids, 'leg', num(ids, index)),
            ...(leg.barrier !== null ? [setVar(ids, 'prediction', num(ids, leg.barrier))] : []),
        ];
        stack.push(
            ifThen(
                ids,
                getVar(ids, 'won'),
                nextLeg(0, legsOf(spec)[0]),
                nextLeg(1, spec.secondLeg),
                'Switches to the second leg after a loss; a win returns to the primary leg.'
            )
        );
    }

    stack.push(
        ifThen(
            ids,
            getVar(ids, 'won'),
            [setVar(ids, 'stake', num(ids, risk.stake))],
            [
                setVar(
                    ids,
                    'stake',
                    node(ids.next('mult'), 'math_arithmetic', {
                        fields: { OP: 'MULTIPLY' },
                        values: { A: [getVar(ids, 'stake')], B: [num(ids, risk.multiplier, true)] },
                    })
                ),
            ],
            'Resets the stake after a win; applies the multiplier (1 = flat) after a loss.'
        )
    );

    if (risk.tradeLimit > 0) {
        stack.push(
            ifThen(
                ids,
                node(ids.next('limit'), 'bot_trade_limit_reached', { values: { LIMIT: [num(ids, risk.tradeLimit, true)] } }),
                [setVar(ids, 'stop', bool(ids, true))],
                undefined,
                'Stops at the session trade limit.'
            )
        );
    }

    if (spec.reporting) {
        stack.push(journal(ids, node(ids.next('report'), 'report_session'), 'info', 'Writes one measured session summary.'));
    }

    // Analysis tool: when the session stops, the engine reports what each labelled strategy really did.
    if (spec.analysis.strategyReport) {
        stack.push(
            ifThen(
                ids,
                getVar(ids, 'stop'),
                [journal(ids, node(ids.next('learn'), 'learn_report'), 'info', 'Reports every strategy\'s own settled results when the session stops.')],
                undefined,
                'One strategy report per stopped session.'
            )
        );
    }

    const again = () => node(ids.next('again'), 'trade_again', { role: 'Starts the next cycle unless a stop was raised.' });
    if (spec.realism.lossCooldownSeconds > 0) {
        stack.push(
            ifThen(
                ids,
                not(ids, getVar(ids, 'stop')),
                [
                    ifThen(
                        ids,
                        compare(ids, 'GT', getVar(ids, 'losses'), num(ids, 0, true)),
                        [waitThen(ids, num(ids, spec.realism.lossCooldownSeconds, true), [again()], 'Waits after a loss before the next entry.')],
                        [again()],
                        'A losing contract is followed by a pause; a win re-enters at once.'
                    ),
                ],
                undefined,
                'Trade again only while not stopped.'
            )
        );
    } else {
        stack.push(ifThen(ids, not(ids, getVar(ids, 'stop')), [again()], undefined, 'Trade again only while not stopped.'));
    }

    return node('aa-after-purchase', 'after_purchase', {
        attrs: { x: '760', y: '0' },
        statements: { AFTERPURCHASE_STACK: stack },
    });
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────────

/** Builds the block tree for a spec. Pure and deterministic. */
export function buildWorkspace(input: StrategySpec): BuiltWorkspace {
    const spec = normalizeSpec(input);
    const ids = new Ids();
    const roots: BlockNode[] = [tradeDefinition(ids, spec), beforePurchase(ids, spec)];

    // A bot that never buys needs no result handler; adding trade_again there would restart it.
    if (spec.mode === 'demo_trading') roots.push(afterPurchase(ids, spec));

    return {
        roots,
        variables: (Object.keys(VAR_IDS) as VarKey[]).map(key => ({ id: VAR_IDS[key], name: VAR_NAMES[key] })),
    };
}

// ── Serialisation ───────────────────────────────────────────────────────────────────────────────

const esc = (value: string | number): string =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function attrString(attrs?: Record<string, string>): string {
    return attrs ? Object.entries(attrs).map(([key, value]) => ` ${key}="${esc(value)}"`).join('') : '';
}

function fieldXml(type: string, name: string, value: string | number): string {
    if (type === 'variables_get' || type === 'variables_set') {
        const key = (Object.keys(VAR_NAMES) as VarKey[]).find(candidate => VAR_NAMES[candidate] === value);
        return `<field name="${name}" id="${key ? VAR_IDS[key] : ''}" variabletype="">${esc(value)}</field>`;
    }
    return `<field name="${name}">${esc(value)}</field>`;
}

/** One block (and the statement chain after it) as XML. */
function blockXml(block: BlockNode, next?: string): string {
    const tag = block.shadow ? 'shadow' : 'block';
    const mutation = block.mutation
        ? `<mutation${Object.entries(block.mutation).map(([key, value]) => ` ${key}="${esc(value)}"`).join('')}></mutation>`
        : '';
    const fields = Object.entries(block.fields ?? {}).map(([name, value]) => fieldXml(block.type, name, value)).join('');

    const values = Object.entries(block.values ?? {})
        .map(([name, children]) => {
            // The first entry is the shadow placeholder when a real block replaces it.
            const inner = children.map(child => blockXml(child)).join('');
            return `<value name="${name}">${inner}</value>`;
        })
        .join('');

    const statements = Object.entries(block.statements ?? {})
        .map(([name, chain]) => `<statement name="${name}">${chainXml(chain)}</statement>`)
        .join('');

    return `<${tag} type="${block.type}" id="${esc(block.id)}"${attrString(block.attrs)}>${mutation}${fields}${values}${statements}${next ? `<next>${next}</next>` : ''}</${tag}>`;
}

/** A statement chain: each block carries the next in `<next>`. */
function chainXml(chain: BlockNode[]): string {
    return chain.reduceRight<string>((next, block) => blockXml(block, next || undefined), '');
}

export function workspaceToXml(workspace: BuiltWorkspace): string {
    const variables = workspace.variables
        .map(variable => `<variable type="" id="${variable.id}" islocal="false" iscloud="false">${esc(variable.name)}</variable>`)
        .join('');
    return [
        '<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">',
        `<variables>${variables}</variables>`,
        workspace.roots.map(root => blockXml(root)).join(''),
        '</xml>',
    ].join('');
}

/** Flattens a tree into every block it holds, in document order. */
export function allBlocks(workspace: BuiltWorkspace): BlockNode[] {
    const out: BlockNode[] = [];
    const visit = (block: BlockNode) => {
        out.push(block);
        Object.values(block.values ?? {}).forEach(children => children.forEach(visit));
        Object.values(block.statements ?? {}).forEach(chain => chain.forEach(visit));
    };
    workspace.roots.forEach(visit);
    return out;
}

export function buildBotXml(spec: StrategySpec): { workspace: BuiltWorkspace; xml: string } {
    const workspace = buildWorkspace(spec);
    return { workspace, xml: workspaceToXml(workspace) };
}
