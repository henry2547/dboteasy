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

import type { BlockNode, BuiltWorkspace, StrategyKind, StrategySpec } from './types';

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
} as const;
type VarKey = keyof typeof VAR_IDS;

const VAR_NAMES: Record<VarKey, string> = {
    stake: 'architect:stake',
    profit: 'architect:profit',
    won: 'architect:won',
    stop: 'architect:stop',
    initialised: 'architect:initialised',
    losses: 'architect:losses',
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

// ── Entry condition: the trigger, kept separate from the barrier and the filters ────────────────

/** The digit rule the bot waits for. Mirrors the shipped Multi-Market templates exactly. */
function entryTrigger(ids: Ids, spec: StrategySpec): BlockNode {
    const { strategy, barrier } = spec.entry;
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

/** Statistical filters over the historical window (the user's thresholds, never invented). */
function filterConditions(ids: Ids, spec: StrategySpec): BlockNode[] {
    const conditions: BlockNode[] = [];
    const { frequency, streakAtMost, window } = spec.filters;

    if (frequency) {
        conditions.push(
            compare(
                ids,
                frequency.operator === 'below' ? 'LTE' : 'GTE',
                node(ids.next('freq'), 'digits_frequency', {
                    fields: { DIGIT: String(frequency.digit) },
                    values: { SAMPLE: [num(ids, window, true)] },
                }),
                num(ids, frequency.percent, true)
            )
        );
    }
    if (streakAtMost !== null) {
        conditions.push(compare(ids, 'LTE', node(ids.next('streak'), 'digits_streak'), num(ids, streakAtMost, true)));
    }
    return conditions;
}

/** Trigger AND every filter, as one Boolean the switch block and the confirmation both use. */
function entryCondition(ids: Ids, spec: StrategySpec): BlockNode {
    return filterConditions(ids, spec).reduce((all, filter) => and(ids, all, filter), entryTrigger(ids, spec));
}

// ── Trade definition ────────────────────────────────────────────────────────────────────────────

function tradeDefinition(ids: Ids, spec: StrategySpec): BlockNode {
    const info = CONTRACTS[spec.entry.strategy];
    const hasPrediction = spec.entry.barrier !== null;
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
            fields: { TYPE_LIST: info.contractType },
            role: `${info.label} contract.`,
        }),
        node('aa-candle', 'trade_definition_candleinterval', { attrs: locked, fields: { CANDLEINTERVAL_LIST: '60' } }),
        node('aa-restartbuysell', 'trade_definition_restartbuysell', { attrs: locked, fields: { TIME_MACHINE_ENABLED: 'FALSE' } }),
        node('aa-restartonerror', 'trade_definition_restartonerror', { attrs: locked, fields: { RESTARTONERROR: 'TRUE' } }),
    ];

    // The stake is seeded here (run once) so the first proposal never sees an undefined amount.
    const initialisation = ifThen(
        ids,
        not(ids, getVar(ids, 'initialised')),
        [
            setVar(ids, 'initialised', bool(ids, true)),
            setVar(ids, 'stake', num(ids, spec.risk.stake)),
            setVar(ids, 'profit', num(ids, 0)),
            setVar(ids, 'losses', num(ids, 0)),
            setVar(ids, 'stop', bool(ids, false)),
        ],
        undefined,
        'Seeds the stake and counters before the first quote.'
    );

    const tradeOptions = node('aa-tradeoptions', 'trade_definition_tradeoptions', {
        mutation: { has_first_barrier: 'false', has_second_barrier: 'false', has_prediction: String(hasPrediction) },
        fields: { DURATIONTYPE_LIST: 't', CURRENCY_LIST: 'USD', AMOUNT_LIMITS: '' },
        values: {
            DURATION: [num(ids, 1, true, 'math_number_positive')],
            AMOUNT: [num(ids, spec.risk.stake, true, 'math_number_positive'), getVar(ids, 'stake')],
            ...(hasPrediction ? { PREDICTION: [num(ids, spec.entry.barrier as number, true, 'math_number_positive')] } : {}),
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
function virtualHook(ids: Ids, spec: StrategySpec): BlockNode[] {
    const { strategy, barrier } = spec.entry;
    const where = spec.market.scope === 'all' ? 'the active market' : spec.market.symbol;
    const configure: BlockNode[] = [node(ids.next('cfg'), `obs_configure_${strategy}`, { role: 'Tells the observer which contract the next observation is about.' })];
    if ((strategy === 'matches' || strategy === 'differs') && barrier !== null) {
        configure.unshift(node(ids.next('digit'), 'obs_set_digit', { fields: { DIGIT: barrier }, role: 'Digit the observation is about.' }));
    }
    return [
        journal(
            ids,
            text(ids, `Virtual setup: ${spec.observation.strategyLabel} entry condition met on ${where}; observing the next genuine tick (not a purchased contract).`),
            'info',
            'Records the setup in the run log.'
        ),
        ...configure,
        node(ids.next('eval'), `obs_evaluate_${strategy}`, { role: 'Observes the next genuine tick of the same market and records the outcome.' }),
    ];
}

// ── Before purchase ─────────────────────────────────────────────────────────────────────────────

function riskGuard(ids: Ids): BlockNode {
    return node(ids.next('risk'), 'risk_can_trade', { role: 'Blocks entries once a configured risk limit has been breached.' });
}

function beforePurchase(ids: Ids, spec: StrategySpec): BlockNode {
    const trading = spec.mode === 'demo_trading';
    const notStopped = not(ids, getVar(ids, 'stop'));

    const body: BlockNode[] = [];

    // 1. Discover + switch (or a single market's own condition).
    if (spec.market.scope === 'all') {
        body.push(
            node(ids.next('discover'), 'market_discover_eligible', {
                fields: { CATEGORY: spec.market.category, VERIFY: 'no' },
                values: { MIN_HISTORY: [num(ids, spec.market.minHistory, true)] },
                role: 'Discovers the eligible volatility markets dynamically.',
            }),
            node(ids.next('switch'), 'switch_active_market', {
                fields: { ORDER: spec.market.order },
                values: { MAX_SWITCHES: [num(ids, spec.market.maxSwitches)], CONDITION: [entryCondition(ids, spec)] },
                role: 'Scans markets until the entry condition holds, using only each market\'s own ticks.',
            })
        );
    }

    // 2. Everything that happens on a confirmed entry.
    const onEntry: BlockNode[] = [];

    if (spec.observation.virtualHook) onEntry.push(...virtualHook(ids, spec));

    if (trading) {
        onEntry.push(node(ids.next('buy'), 'purchase', { fields: { PURCHASE_LIST: CONTRACTS[spec.entry.strategy].contractType }, role: 'Requests the proposal and buys it through the engine.' }));
    } else {
        if (!spec.observation.virtualHook) {
            onEntry.push(
                journal(
                    ids,
                    text(ids, `Signal: ${spec.observation.strategyLabel} entry condition met. No contract was bought (${spec.mode === 'signal' ? 'signal only' : 'observation only'}).`),
                    'info',
                    'Reports the signal; this bot never buys.'
                )
            );
        }
        onEntry.push(
            node(ids.next('stop'), 'bot_stop', {
                values: { REASON: [text(ids, `${spec.mode === 'signal' ? 'Signal' : 'Observation'} complete`)] },
                role: 'Ends the run once the signal has been reported.',
            })
        );
    }

    // 3. Confirm on the frozen market with the SAME condition, behind the risk guard when trading.
    const confirm = trading ? and(ids, riskGuard(ids), entryCondition(ids, spec)) : entryCondition(ids, spec);
    body.push(ifThen(ids, confirm, onEntry, undefined, 'Confirms the entry on the market the scan stopped on.'));

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
        ),
    ];

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

    stack.push(ifThen(ids, not(ids, getVar(ids, 'stop')), [node(ids.next('again'), 'trade_again', { role: 'Starts the next cycle unless a stop was raised.' })], undefined, 'Trade again only while not stopped.'));

    return node('aa-after-purchase', 'after_purchase', {
        attrs: { x: '760', y: '0' },
        statements: { AFTERPURCHASE_STACK: stack },
    });
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────────

/** Builds the block tree for a spec. Pure and deterministic. */
export function buildWorkspace(spec: StrategySpec): BuiltWorkspace {
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
