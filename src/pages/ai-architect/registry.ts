/**
 * Block Capability Registry.
 *
 * Every block the architect is allowed to place is described here: exact type, fields with their
 * allowed values, inputs with the socket types they accept, shape, execution semantics and the
 * engine services it needs. The catalog is curated from the real block definitions in
 * `src/external/bot-skeleton/scratch/blocks`, and `buildRegistry()` then cross-checks each entry
 * against what is genuinely registered at run time:
 *
 *   - `Blockly.Blocks[type]` must exist (the block is really registered), and
 *   - `Blockly.JavaScript.javascriptGenerator.forBlock[type]` must exist (it can really run).
 *
 * An entry failing either check is kept but marked `unsupported`, with the reason, and the builder
 * and validator refuse to use it. Nothing here guesses a block into existence.
 */

import type { BlockCapability, FieldSpec, InputSpec, RegistryEntry, SocketType } from './types';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const dropdown = (name: string, values: string[], def?: string): FieldSpec => ({
    name,
    kind: 'dropdown',
    values,
    default: def ?? values[0],
});
const number = (name: string, min: number, max: number, def: number, integer = false): FieldSpec => ({
    name,
    kind: 'number',
    min,
    max,
    integer,
    default: def,
});
const text = (name: string, def = ''): FieldSpec => ({ name, kind: 'text', default: def });

const value = (name: string, accepts: SocketType[], required = true): InputSpec => ({
    name,
    kind: 'value',
    accepts,
    required,
});
const statement = (name: string, required = false): InputSpec => ({
    name,
    kind: 'statement',
    accepts: ['Any'],
    required,
});

type Partial_ = Partial<BlockCapability> & Pick<BlockCapability, 'type' | 'displayName' | 'category' | 'semantics'>;

const cap = (entry: Partial_): BlockCapability => {
    const shape = entry.shape ?? 'statement';
    const isStatement = shape === 'statement';
    return {
        shape,
        execution: 'executable',
        output: null,
        previous: isStatement,
        next: isStatement,
        fields: [],
        inputs: [],
        requires: [],
        generator: entry.type,
        ...entry,
    };
};

const NUMBER_VALUE = (type: string, displayName: string, category: string, semantics: string, extra: Partial<BlockCapability> = {}) =>
    cap({ type, displayName, category, semantics, shape: 'value', output: 'Number', execution: 'informational', ...extra });

const BOOLEAN_VALUE = (type: string, displayName: string, category: string, semantics: string, extra: Partial<BlockCapability> = {}) =>
    cap({ type, displayName, category, semantics, shape: 'value', output: 'Boolean', execution: 'informational', ...extra });

/** The strategy-defining blocks, in palette order. */
export const CAPABILITY_CATALOG: BlockCapability[] = [
    // ── Trade definition (the trade skeleton) ───────────────────────────────────────────────────
    cap({
        type: 'trade_definition',
        displayName: 'Trade parameters',
        category: 'trade_parameters',
        shape: 'container',
        execution: 'control-flow',
        inputs: [statement('TRADE_OPTIONS', true), statement('INITIALIZATION'), statement('SUBMARKET', true)],
        semantics: 'Root block that holds the market, contract and trade options. The stake is seeded in its Run-once statement.',
        requires: ['active_symbols'],
    }),
    cap({
        type: 'trade_definition_market',
        displayName: 'Market',
        category: 'trade_parameters',
        fields: [text('MARKET_LIST', 'synthetic_index'), text('SUBMARKET_LIST', 'random_index'), text('SYMBOL_LIST')],
        semantics: 'Sets the market the trade engine subscribes to; Switch active market re-points it during a scan.',
        requires: ['active_symbols', 'ticks'],
    }),
    cap({
        type: 'trade_definition_tradetype',
        displayName: 'Trade type',
        category: 'trade_parameters',
        fields: [
            dropdown('TRADETYPECAT_LIST', ['digits']),
            dropdown('TRADETYPE_LIST', ['overunder', 'evenodd', 'matchesdiffers']),
        ],
        semantics: 'Chooses the digit contract family.',
    }),
    cap({
        type: 'trade_definition_contracttype',
        displayName: 'Contract type',
        category: 'trade_parameters',
        fields: [dropdown('TYPE_LIST', ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD', 'both'])],
        semantics: 'Chooses the contract the Purchase block buys.',
    }),
    cap({
        type: 'trade_definition_candleinterval',
        displayName: 'Candle interval',
        category: 'trade_parameters',
        fields: [dropdown('CANDLEINTERVAL_LIST', ['60'])],
        semantics: 'Candle interval for candle blocks; unused by digit strategies.',
    }),
    cap({
        type: 'trade_definition_restartbuysell',
        displayName: 'Restart buy/sell on error',
        category: 'trade_parameters',
        fields: [dropdown('TIME_MACHINE_ENABLED', ['TRUE', 'FALSE'], 'FALSE')],
        semantics: 'Whether the engine restarts the buy/sell cycle after a time-machine event.',
    }),
    cap({
        type: 'trade_definition_restartonerror',
        displayName: 'Restart on error',
        category: 'trade_parameters',
        fields: [dropdown('RESTARTONERROR', ['TRUE', 'FALSE'], 'TRUE')],
        semantics: 'Whether the engine retries after an API error.',
    }),
    cap({
        type: 'trade_definition_tradeoptions',
        displayName: 'Trade options',
        category: 'trade_parameters',
        shape: 'container',
        execution: 'control-flow',
        fields: [dropdown('DURATIONTYPE_LIST', ['t', 's', 'm', 'h', 'd'], 't'), dropdown('CURRENCY_LIST', ['USD', 'AUD', 'EUR', 'GBP'], 'USD'), text('AMOUNT_LIMITS')],
        inputs: [value('DURATION', ['Number']), value('AMOUNT', ['Number']), value('PREDICTION', ['Number'], false)],
        semantics: 'Duration, stake and (for Over/Under, Matches/Differs) the barrier digit sent with the proposal.',
        requires: ['proposal'],
    }),

    // ── Purchase lifecycle ──────────────────────────────────────────────────────────────────────
    cap({
        type: 'before_purchase',
        displayName: 'Purchase conditions',
        category: 'purchase_conditions',
        shape: 'container',
        execution: 'control-flow',
        inputs: [statement('BEFOREPURCHASE_STACK', true)],
        semantics: 'Runs on every tick until a Purchase block fires. Digit and observer conditions must sit inside it.',
        requires: ['ticks'],
    }),
    cap({
        type: 'purchase',
        displayName: 'Purchase',
        category: 'purchase_conditions',
        previous: true,
        next: false,
        fields: [dropdown('PURCHASE_LIST', ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD'])],
        semantics: 'Requests the proposal and buys it through the engine, which applies its own Demo/Real and risk protections.',
        requires: ['account', 'proposal', 'buy'],
    }),
    cap({
        type: 'after_purchase',
        displayName: 'Trade result',
        category: 'trade_results',
        shape: 'container',
        execution: 'control-flow',
        inputs: [statement('AFTERPURCHASE_STACK', true)],
        semantics: 'Runs once a contract settles: record the result, adjust the stake, then Trade again or stop.',
        requires: ['contract'],
    }),
    cap({
        type: 'trade_again',
        displayName: 'Trade again',
        category: 'trade_results',
        previous: true,
        next: false,
        semantics: 'Starts the next trade cycle from the trade definition.',
    }),
    BOOLEAN_VALUE('contract_check_result', 'Result is', 'trade_results', 'True when the settled contract won or lost, as chosen.', {
        fields: [dropdown('CHECK_RESULT', ['win', 'loss'])],
        requires: ['contract'],
    }),
    NUMBER_VALUE('read_details', 'Contract detail', 'contract_details', 'Reads one detail of the settled contract; index 4 is the profit.', {
        fields: [dropdown('DETAIL_INDEX', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'], '4')],
        requires: ['contract'],
    }),

    // ── Logic, math, variables ──────────────────────────────────────────────────────────────────
    cap({
        type: 'controls_if',
        displayName: 'If',
        category: 'logic',
        execution: 'control-flow',
        inputs: [value('IF0', ['Boolean', 'Condition']), statement('DO0'), statement('ELSE')],
        semantics: 'Runs its statements only when the condition is true. An Inconclusive condition never runs them.',
    }),
    BOOLEAN_VALUE('logic_compare', 'Compare', 'logic', 'Compares two numbers.', {
        fields: [dropdown('OP', ['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE'])],
        inputs: [value('A', ['Number']), value('B', ['Number'])],
    }),
    BOOLEAN_VALUE('logic_operation', 'And / Or', 'logic', 'Combines two conditions.', {
        fields: [dropdown('OP', ['AND', 'OR'])],
        inputs: [value('A', ['Boolean', 'Condition']), value('B', ['Boolean', 'Condition'])],
    }),
    BOOLEAN_VALUE('logic_negate', 'Not', 'logic', 'Inverts a condition.', { inputs: [value('BOOL', ['Boolean', 'Condition'])] }),
    BOOLEAN_VALUE('logic_boolean', 'True / False', 'logic', 'A constant truth value.', { fields: [dropdown('BOOL', ['TRUE', 'FALSE'])] }),
    NUMBER_VALUE('math_number', 'Number', 'math', 'A number constant.', { fields: [number('NUM', -1e9, 1e9, 0)] }),
    NUMBER_VALUE('math_number_positive', 'Positive number', 'math', 'A positive number constant used by trade options.', {
        fields: [number('NUM', 0, 1e9, 1)],
    }),
    NUMBER_VALUE('math_arithmetic', 'Arithmetic', 'math', 'Adds, subtracts, multiplies or divides two numbers.', {
        fields: [dropdown('OP', ['ADD', 'MINUS', 'MULTIPLY', 'DIVIDE', 'POWER'])],
        inputs: [value('A', ['Number']), value('B', ['Number'])],
    }),
    cap({
        type: 'variables_set',
        displayName: 'Set variable',
        category: 'variables',
        fields: [text('VAR')],
        inputs: [value('VALUE', ['Any'])],
        semantics: 'Stores a value in a named variable.',
    }),
    cap({
        type: 'variables_get',
        displayName: 'Variable',
        category: 'variables',
        shape: 'value',
        output: 'Any',
        execution: 'informational',
        fields: [text('VAR')],
        semantics: 'Reads a named variable.',
    }),

    // ── Digits ──────────────────────────────────────────────────────────────────────────────────
    NUMBER_VALUE('last_digit', 'Last digit', 'technical_analysis', 'The last digit of the newest genuine tick of the active market.', {
        requires: ['ticks'],
    }),
    BOOLEAN_VALUE('digits_over_under', 'Last digit is over / under', 'digits', 'True when the last digit is over or under the chosen digit.', {
        fields: [dropdown('SIDE', ['over', 'under']), dropdown('DIGIT', DIGITS)],
        requires: ['ticks'],
    }),
    BOOLEAN_VALUE('digits_even_odd', 'Last digit is even / odd', 'digits', 'True when the last digit has the chosen parity.', {
        fields: [dropdown('PARITY', ['even', 'odd'])],
        requires: ['ticks'],
    }),
    BOOLEAN_VALUE('digits_matches_differs', 'Last digit matches / differs', 'digits', 'True when the last digit matches (or differs from) the chosen digit.', {
        fields: [dropdown('MODE', ['matches', 'differs']), dropdown('DIGIT', DIGITS)],
        requires: ['ticks'],
    }),
    NUMBER_VALUE('digits_frequency', 'Digit frequency (%)', 'digits', 'Share of the chosen digit in the last N genuine ticks, as a percentage.', {
        fields: [dropdown('DIGIT', DIGITS)],
        inputs: [value('SAMPLE', ['Number'])],
        requires: ['ticks'],
    }),
    NUMBER_VALUE('digits_hot_cold', 'Hottest / coldest digit', 'digits', 'The most or least frequent digit in the last N ticks.', {
        fields: [dropdown('MODE', ['hottest', 'coldest'])],
        inputs: [value('SAMPLE', ['Number'])],
        requires: ['ticks'],
    }),
    NUMBER_VALUE('digits_streak', 'Same-digit streak', 'digits', 'Ticks in a row with the same last digit.', { requires: ['ticks'] }),
    cap({
        type: 'switch_active_market',
        displayName: 'Switch active market',
        category: 'digits',
        fields: [dropdown('ORDER', ['sequential', 'round_robin'])],
        inputs: [value('MAX_SWITCHES', ['Number']), value('CONDITION', ['Boolean', 'Condition'])],
        semantics:
            'Drives the engine market scan: discovers eligible markets, subscribes to the selected market, waits for its history and a genuine live tick, and only then evaluates the condition. While false it moves to the next market.',
        requires: ['active_symbols', 'ticks', 'market_scan'],
    }),

    // ── Market intelligence ─────────────────────────────────────────────────────────────────────
    cap({
        type: 'market_discover_eligible',
        displayName: 'Find eligible markets',
        category: 'market_intelligence',
        fields: [dropdown('CATEGORY', ['all', 'Volatility Indices', '1-Second Volatility Indices']), dropdown('VERIFY', ['no', 'yes'])],
        inputs: [value('MIN_HISTORY', ['Number'])],
        semantics: 'Builds the pool of open, supported volatility markets that scans and rankings draw from.',
        requires: ['active_symbols'],
    }),
    NUMBER_VALUE('market_eligible_count', 'Eligible market count', 'market_intelligence', 'Size of the discovered market pool.', {
        requires: ['active_symbols'],
    }),
    BOOLEAN_VALUE('market_readiness', 'Market is ready', 'market_intelligence', 'Fails closed: true only with valid metadata, enough genuine history, a live fresh tick and a connected feed.', {
        fields: [text('SYMBOL')],
        requires: ['ticks', 'active_symbols'],
    }),
    cap({
        type: 'market_rank',
        displayName: 'Rank markets',
        category: 'market_intelligence',
        fields: [dropdown('CRITERION', ['readiness', 'tick_sample', 'entry', 'frequency_stability', 'observed_outcomes'])],
        inputs: [value('MIN_SAMPLE', ['Number'])],
        semantics: 'Ranks the eligible pool by a measured criterion.',
        requires: ['active_symbols', 'ticks'],
    }),
    cap({
        type: 'market_cooldown',
        displayName: 'Cool down market',
        category: 'market_intelligence',
        fields: [text('SYMBOL'), number('CYCLES', 0, 1000, 1, true), number('MINUTES', 0, 1440, 0), text('REASON', 'Cooling down after the configured event')],
        semantics: 'Excludes a market from scans for a number of cycles or minutes.',
    }),
    BOOLEAN_VALUE('market_is_cooling', 'Market is cooling down', 'market_intelligence', 'True while the market is excluded by a cooldown.', {
        fields: [text('SYMBOL')],
    }),

    // ── Risk management ─────────────────────────────────────────────────────────────────────────
    cap({
        type: 'risk_set_limits',
        displayName: 'Set risk limits',
        category: 'risk_management',
        fields: [number('MAX_LOSSES', 0, 1000, 3, true), number('MAX_GIVE_BACK', 0, 1e9, 0), number('MAX_EXPOSURE', 0, 1e9, 0), number('RISK_PERCENT', 0, 100, 1)],
        semantics: 'Opt-in session guards (0 = off) measured from settled contracts.',
        requires: ['account', 'contract'],
    }),
    BOOLEAN_VALUE('risk_can_trade', 'Risk allows a trade', 'risk_management', 'True while no configured risk limit has been breached.', { requires: ['account', 'contract'] }),
    cap({
        type: 'risk_reset_session',
        displayName: 'Reset risk session',
        category: 'risk_management',
        semantics: 'Clears the risk counters.',
    }),

    // ── Strategy learning, execution, control, reporting ───────────────────────────────────────
    cap({
        type: 'learn_set_strategy',
        displayName: 'Learn following trades as',
        category: 'strategy_learning',
        fields: [text('NAME', 'strategy 1')],
        semantics: 'Labels the contracts that settle afterwards so hit rate and streaks are tracked per strategy.',
        requires: ['contract'],
    }),
    cap({
        type: 'learn_report',
        displayName: 'Strategy learning report',
        category: 'strategy_learning',
        semantics: 'Writes the per-strategy results measured so far to the run log.',
    }),
    cap({
        type: 'exec_wait_settlement',
        displayName: 'Wait for settlement',
        category: 'trading_execution',
        semantics: 'Pauses until the open contract settles; returns at once when none is open.',
        requires: ['contract'],
    }),
    BOOLEAN_VALUE('exec_has_open_contract', 'A contract is open', 'trading_execution', 'True while the engine holds an unsettled contract.', { requires: ['contract'] }),
    cap({
        type: 'bot_stop',
        displayName: 'Stop the bot',
        category: 'bot_control',
        previous: true,
        next: true,
        inputs: [value('REASON', ['String'])],
        semantics: 'Stops the run through the same path as the Stop button; the open contract settles first.',
    }),
    BOOLEAN_VALUE('bot_trade_limit_reached', 'Trade limit reached', 'bot_control', 'True once the session has taken the given number of trades.', {
        inputs: [value('LIMIT', ['Number'])],
        output: 'Condition',
    }),
    cap({
        type: 'report_journal',
        displayName: 'Write to run log',
        category: 'session_reporting',
        fields: [dropdown('LEVEL', ['info', 'warn', 'error'])],
        inputs: [value('MESSAGE', ['String'])],
        semantics: 'Adds a line to the run log.',
    }),
    cap({
        type: 'text',
        displayName: 'Text',
        category: 'text',
        shape: 'value',
        output: 'String',
        execution: 'informational',
        fields: [text('TEXT')],
        semantics: 'A text constant.',
    }),
    cap({
        type: 'report_session',
        displayName: 'Session report',
        category: 'session_reporting',
        shape: 'value',
        output: 'String',
        execution: 'informational',
        semantics: 'One measured summary line of the session.',
    }),
    cap({
        type: 'notify',
        displayName: 'Notify',
        category: 'notifications',
        fields: [dropdown('NOTIFICATION_TYPE', ['success', 'info', 'warn', 'error']), text('NOTIFICATION_SOUND')],
        inputs: [value('MESSAGE', ['Any'])],
        semantics: 'Shows a notification.',
    }),

    // ── Observer: the Virtual Hook / setup observer ────────────────────────────────────────────
    // Real ids come from `observer-catalog.js`: one configure/evaluate pair per strategy.
    cap({
        type: 'obs_entry',
        displayName: 'When All Entry Conditions Pass',
        category: 'observer_entry_monitoring',
        shape: 'container',
        execution: 'observational',
        previous: false,
        next: false,
        inputs: [value('CONDITION', ['Condition', 'Boolean']), statement('DO')],
        semantics:
            'A canvas-driven observer program that RAISES THE TRADE-ENTRY SIGNAL: a canvas carrying one adds an entry gate to the trade loop, so the existing trade setup would buy when it passes. The architect never places it (see FORBIDDEN_BLOCKS).',
        requires: ['ticks', 'observer_runtime'],
    }),
    cap({
        type: 'obs_record_setup',
        displayName: 'Record Setup',
        category: 'observer_entry_monitoring',
        execution: 'observational',
        semantics:
            'Journals the setup snapshot, but a snapshot only exists after an entry block raised the gate, so inside an ordinary trade loop it only reports that no setup is waiting. The architect records the setup with the run-log block instead.',
        requires: ['observer_runtime'],
    }),
    cap({
        type: 'obs_subsequent',
        displayName: 'Evaluate Subsequent Tick',
        category: 'observer_entry_monitoring',
        execution: 'observational',
        semantics: 'Arms an observation of the next genuine tick for the configured strategy so the outcome is recorded, not guessed. Runs inside an ordinary loop; observation only.',
        requires: ['ticks', 'observer_runtime'],
    }),
    cap({
        type: 'obs_pattern_cooldown',
        displayName: 'Start Cooldown',
        category: 'observer_entry_monitoring',
        execution: 'observational',
        fields: [number('N', 0, 1000, 0, true)],
        semantics: 'Waits N genuine ticks after an observation completes before another setup may be recorded.',
        requires: ['observer_runtime'],
    }),
    cap({
        type: 'obs_set_digit',
        displayName: 'Set Match / Excluded Digit',
        category: 'observer_entry_monitoring',
        execution: 'observational',
        fields: [number('DIGIT', 0, 9, 2, true)],
        semantics: 'Fixes the digit the Matches/Differs strategy is observed on.',
        requires: ['observer_runtime'],
    }),
    ...(['over', 'under', 'matches', 'differs', 'even', 'odd'] as const).flatMap(strategy => [
        cap({
            type: `obs_configure_${strategy}`,
            displayName: `Configure ${strategy[0].toUpperCase()}${strategy.slice(1)} Strategy`,
            category: 'observer_entry_monitoring',
            execution: 'observational',
            semantics: `Tells the observer the next observation is about a ${strategy} contract. Set the digit or barrier first.`,
            requires: ['observer_runtime'],
        }),
        cap({
            type: `obs_evaluate_${strategy}`,
            displayName: `Evaluate Next Tick For ${strategy[0].toUpperCase()}${strategy.slice(1)}`,
            category: 'observer_entry_monitoring',
            execution: 'observational',
            semantics: `Observes the next genuine tick for ${strategy} and records the outcome in the journal. Observation only - it never places a trade.`,
            requires: ['ticks', 'observer_runtime'],
        }),
    ]),
];

/**
 * Blocks the architect must never place. `obs_entry`, `obs_entry_any`, `obs_emit_setup` and `obs_emit_parity` arm the
 * observer's trade-entry gate: with one on the canvas the generated loop starts the trade setup
 * when it fires, so an "observation only" bot containing one would still buy on Start.
 */
export const FORBIDDEN_BLOCKS: Record<string, string> = {
    obs_entry: 'raises the trade-entry gate, so the bot would buy on its own',
    obs_entry_any: 'raises the trade-entry gate, so the bot would buy on its own',
    obs_emit_setup: 'raises the trade-entry gate, so the bot would buy on its own',
    obs_emit_parity: 'raises the trade-entry gate, so the bot would buy on its own',
};

/** Blocks that can start a contract. A non-trading bot must contain none of them. */
export const TRADE_CAPABLE_BLOCKS = ['purchase', 'trade_again'] as const;

// ── Live verification ───────────────────────────────────────────────────────────────────────────

interface BlocklyRuntime {
    Blocks?: Record<string, unknown>;
    JavaScript?: { javascriptGenerator?: { forBlock?: Record<string, unknown> } };
}

/** What the running application has really registered. `null` means Blockly is not loaded. */
export interface RuntimeProbe {
    isRegistered: (type: string) => boolean;
    hasGenerator: (type: string) => boolean;
    loaded: boolean;
}

/** Reads `window.Blockly`; never throws, and reports `loaded: false` when it is not there. */
export function probeBlocklyRuntime(): RuntimeProbe {
    const blockly = (typeof window !== 'undefined' ? (window as unknown as { Blockly?: BlocklyRuntime }).Blockly : undefined);
    const blocks = blockly?.Blocks;
    const forBlock = blockly?.JavaScript?.javascriptGenerator?.forBlock;
    const has = (table: Record<string, unknown> | undefined, type: string) =>
        !!table && Object.prototype.hasOwnProperty.call(table, type);
    return {
        loaded: !!blocks,
        isRegistered: type => has(blocks, type),
        hasGenerator: type => has(forBlock, type),
    };
}

/** A probe for tests and for environments with no Blockly: every block in `types` is registered. */
export function fixedProbe(types: Iterable<string>, withoutGenerator: Iterable<string> = []): RuntimeProbe {
    const registered = new Set(types);
    const noGenerator = new Set(withoutGenerator);
    return {
        loaded: true,
        isRegistered: type => registered.has(type),
        hasGenerator: type => registered.has(type) && !noGenerator.has(type),
    };
}

export interface Registry {
    entries: Map<string, RegistryEntry>;
    probe: RuntimeProbe;
    get: (type: string) => RegistryEntry | undefined;
    /** The entry only when it is genuinely usable. */
    supported: (type: string) => RegistryEntry | undefined;
    supportedTypes: () => string[];
    unsupportedEntries: () => RegistryEntry[];
}

/** Builds the registry by checking every catalog entry against the live Blockly runtime. */
export function buildRegistry(probe: RuntimeProbe = probeBlocklyRuntime(), catalog: BlockCapability[] = CAPABILITY_CATALOG): Registry {
    const entries = new Map<string, RegistryEntry>();

    for (const capability of catalog) {
        let status: RegistryEntry['status'] = 'supported';
        let reason: string | undefined;

        if (!probe.loaded) {
            status = 'unsupported';
            reason = 'Blockly is not loaded, so the block cannot be verified. Open the Bot Builder once and retry.';
        } else if (!probe.isRegistered(capability.type)) {
            status = 'unsupported';
            reason = `"${capability.type}" is not registered with Blockly in this build.`;
        } else if (!probe.hasGenerator(capability.type)) {
            status = 'unsupported';
            reason = `"${capability.type}" appears in the palette but has no JavaScript generator, so it cannot run.`;
        }

        entries.set(capability.type, { ...capability, status, ...(reason ? { reason } : {}) });
    }

    return {
        entries,
        probe,
        get: type => entries.get(type),
        supported: type => {
            const entry = entries.get(type);
            return entry && entry.status === 'supported' ? entry : undefined;
        },
        supportedTypes: () => [...entries.values()].filter(e => e.status === 'supported').map(e => e.type),
        unsupportedEntries: () => [...entries.values()].filter(e => e.status === 'unsupported'),
    };
}

/** Human-readable palette category names, matching the Bot Builder's Blocks menu. */
export const CATEGORY_LABELS: Record<string, string> = {
    trade_parameters: 'Trade parameters',
    purchase_conditions: 'Purchase conditions',
    sell_conditions: 'Sell conditions',
    trade_results: 'Trade results',
    contract_details: 'Contract',
    logic: 'Logic',
    math: 'Math',
    variables: 'Variables',
    text: 'Text',
    technical_analysis: 'Tick and candle analysis',
    digits: 'Digits',
    market_intelligence: 'Market Intelligence',
    risk_management: 'Risk Management',
    strategy_learning: 'Strategy Learning',
    trading_execution: 'Trading & Execution',
    bot_control: 'Bot Control',
    session_reporting: 'Reporting',
    notifications: 'Notifications',
    observer_entry_monitoring: 'Entry & monitoring (Virtual Hook)',
};
