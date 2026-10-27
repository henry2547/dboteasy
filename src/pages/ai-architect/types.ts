/**
 * Shared types for the AI Bot Architect.
 *
 * The pipeline is Understand -> Plan -> Map -> Build -> Validate -> Explain -> Load. Every stage
 * hands the next one a plain, serialisable value: the planner produces a `StrategySpec`, the
 * builder turns it into a `BlockNode` tree, and only then is XML written. XML is never produced
 * (or accepted) from free text, so a block the registry does not know cannot reach the workspace.
 */

export type StrategyKind = 'over' | 'under' | 'matches' | 'differs' | 'even' | 'odd';

export type BlockExecution = 'executable' | 'observational' | 'informational' | 'control-flow';

export type BlockShape = 'statement' | 'value' | 'hat' | 'container';

export type SocketType = 'Boolean' | 'Number' | 'String' | 'Condition' | 'Any' | 'Array';

export interface FieldSpec {
    name: string;
    kind: 'dropdown' | 'number' | 'text' | 'checkbox';
    /** Allowed values for a dropdown; absent for free numbers/text. */
    values?: string[];
    min?: number;
    max?: number;
    integer?: boolean;
    default?: string | number;
}

export interface InputSpec {
    name: string;
    kind: 'value' | 'statement';
    accepts: SocketType[];
    required: boolean;
}

export interface BlockCapability {
    type: string;
    displayName: string;
    /** Palette category id, e.g. `market_intelligence`. */
    category: string;
    shape: BlockShape;
    execution: BlockExecution;
    /** Output type for a value block; `null` for statements and containers. */
    output: SocketType | null;
    /** Statement blocks can be chained; containers/hats cannot. */
    previous: boolean;
    next: boolean;
    fields: FieldSpec[];
    inputs: InputSpec[];
    /** Plain-language note on what the block does when the engine runs it. */
    semantics: string;
    /** Engine services the block reads (ticks, account, market discovery, ...). */
    requires: string[];
    /** Generator the block's JavaScript comes from. */
    generator: string;
}

export type CapabilityStatus = 'supported' | 'unsupported';

export interface RegistryEntry extends BlockCapability {
    status: CapabilityStatus;
    /** Why the entry is unsupported (not registered with Blockly, no generator, ...). */
    reason?: string;
}

// ── Strategy specification ─────────────────────────────────────────────────────────────────────

export type ExecutionMode = 'observation' | 'signal' | 'demo_trading';

export interface MarketPlan {
    /** `all` = every supported volatility market, `single` = the one named symbol. */
    scope: 'all' | 'single';
    symbol: string | null;
    category: 'all' | 'Volatility Indices' | '1-Second Volatility Indices';
    order: 'sequential' | 'round_robin';
    /** Markets one search may inspect; 0 = every eligible market once. */
    maxSwitches: number;
    minHistory: number;
}

export interface EntryPlan {
    strategy: StrategyKind;
    /** Contract barrier / target digit. `null` for Even/Odd. */
    barrier: number | null;
    /**
     * Explicit last digits the entry accepts, exactly as the user listed them ("entry is 5 and 6",
     * "entry digits 7, 8 or 9"). Empty means "the barrier rule decides".
     */
    digits: number[];
    /** The trigger the bot waits for on the last digit — separate from the barrier. */
    trigger: 'last_digit_entry' | 'none';
}

/** One digit-frequency condition: the digit's share (%) must be at most / at least `percent`. */
export interface FrequencyFilter {
    digit: number;
    operator: 'below' | 'above';
    percent: number;
}

export interface FilterPlan {
    /** Historical analysis window in ticks. */
    window: number;
    /** Every digit-frequency condition the request stated; each one is ANDed into the entry. */
    frequencies: FrequencyFilter[];
    /** Optional streak filter: ticks in a row with the same last digit. */
    streakAtMost: number | null;
    /** Digits that must carry neither the hot (green) nor the cold (red) bar of the digit grid. */
    barNeutral: number[];
}

/**
 * A custom indicator: one extra measurement the entry has to agree with. Each kind maps to a real
 * digit-analysis block, so an indicator is never an approximation of the request.
 */
export type IndicatorKind = 'high_run' | 'hot_cold';

export interface IndicatorPlan {
    kind: IndicatorKind;
    /** Digit the indicator reads (one digit for both kinds). */
    digit: number;
    /** `high_run`: at_or_above / above / at_or_below / below. `hot_cold`: hottest / coldest. */
    mode: string;
    /** `high_run`: the run length. Unused by `hot_cold`. */
    count: number | null;
    /** History window the indicator reads. */
    window: number;
    /** Plain-language name, shown in the analysis panel and journalled with the strategy. */
    label: string;
}

/**
 * The analysis tools placed around the entry. They read what the engine measured; none of them
 * trades, sizes a stake or stops a session on its own.
 */
export interface AnalysisPlan {
    /** Rank the discovered markets by a measured criterion before the entry gate. */
    rankMarkets: boolean;
    /** Scan every eligible market and trade the one with the strongest Even/Odd split. */
    bestParityMarket: boolean;
    /** Label each rule's trades and write the engine's own per-strategy report when the session stops. */
    strategyReport: boolean;
}

/**
 * Session realism. Bots that fire on every tick at the same stake are the ones a market's rate
 * limits and its own settlement cadence punish; these settings pace the entries instead:
 * a randomised wait before buying, a pause after a loss, and stakes that are not all identical.
 * Every field is `0` (off) by default, so a bot built before this existed runs unchanged.
 */
export interface RealismPlan {
    /** Seconds the bot waits after the entry condition holds and before it buys. */
    entryDelaySeconds: number;
    /** Extra random seconds (0..jitter) added to the entry delay, so entries never share one cadence. */
    entryJitterSeconds: number;
    /** Seconds to wait after a losing contract before the next entry. */
    lossCooldownSeconds: number;
    /** Stake varied by up to this share of itself, so every contract is not the same size. */
    stakeJitterPercent: number;
}

/** One entry rule of a bot. A single-rule bot has one; a combined bot has a primary and a second. */
export interface StrategyLeg {
    strategy: StrategyKind;
    barrier: number | null;
    digits: number[];
    filters: FilterPlan;
    /** Custom indicators this rule's entry also requires. */
    indicators: IndicatorPlan[];
    label: string;
}

export interface ObservationPlan {
    /** Record the qualifying setup and observe the next genuine tick (Virtual Hook). */
    virtualHook: boolean;
    strategyLabel: string;
}

export interface RiskPlan {
    stake: number;
    takeProfit: number;
    stopLoss: number;
    maxConsecutiveLosses: number;
    /** Stake multiplier after a loss. 1 = flat staking. */
    multiplier: number;
    tradeLimit: number;
    cooldownMinutes: number;
    cooldownCycles: number;
}

export interface StrategySpec {
    name: string;
    purpose: string;
    mode: ExecutionMode;
    market: MarketPlan;
    entry: EntryPlan;
    filters: FilterPlan;
    /** Custom indicators the primary rule's entry also requires. */
    indicators: IndicatorPlan[];
    observation: ObservationPlan;
    risk: RiskPlan;
    /** Analysis tools placed around the entry. */
    analysis: AnalysisPlan;
    /** Pacing, cooldown and stake variation (all off by default). */
    realism: RealismPlan;
    /**
     * A second entry rule added with "Add this bot to another". The primary rule stays in `entry` /
     * `filters`; the bot trades the primary while it is winning and the second leg after a loss.
     */
    secondLeg?: StrategyLeg;
    /** Demo is always the default; Real needs explicit confirmation at run time, never at build time. */
    account: 'demo';
    /** The default market written into the trade definition until the scan moves it. */
    defaultMarket: string;
    reporting: boolean;
}

/** A setting the planner filled in because the prompt did not say. Shown to the user. */
export interface AppliedDefault {
    field: string;
    value: string;
    reason: string;
}

export interface Clarification {
    id: string;
    question: string;
    options: string[];
}

/**
 * One clause of the user's prompt, and what the planner did with it. Every clause gets an entry, so
 * nothing the user said is silently dropped: it is either built, reported as impossible, or shown as
 * a part the planner could not turn into a block.
 */
export interface Requirement {
    clause: string;
    status: 'applied' | 'unsupported' | 'unapplied';
    detail: string;
    /**
     * Set when the clause named a block from the Bot Builder's Blocks menu. The pipeline then says
     * whether the generated bot really holds that block, so the alignment is read from the
     * workspace instead of being assumed.
     */
    menuBlock?: MenuBlock;
}

/** One block as the Bot Builder's Blocks menu lists it. */
export interface MenuBlock {
    type: string;
    /** The name the menu shows for the block. */
    label: string;
    /** The menu category the block is listed under. */
    category: string;
    /** The Blocks-menu group the category sits in, for the observer groups; `null` otherwise. */
    group: string | null;
}

export interface PlanResult {
    spec: StrategySpec | null;
    defaults: AppliedDefault[];
    clarifications: Clarification[];
    /** Operations the user asked for that no registered block can do. */
    unsupported: string[];
    /** What the planner understood, stage by stage, for the reasoning summary. */
    reasoning: string[];
    /** Every clause of the prompt and whether the bot implements it. */
    requirements: Requirement[];
}

// ── Block tree ─────────────────────────────────────────────────────────────────────────────────

export interface BlockNode {
    id: string;
    type: string;
    fields?: Record<string, string | number>;
    /** Mutation attributes (for example `controls_if` else, `trade_definition_tradeoptions`). */
    mutation?: Record<string, string>;
    values?: Record<string, BlockNode[]>;
    statements?: Record<string, BlockNode[]>;
    /** Shadow blocks rendered as `<shadow>` (editable placeholders). */
    shadow?: boolean;
    /** Why this block exists, shown in the explanation. */
    role?: string;
    /** Extra attributes on the root element (x/y/deletable/movable). */
    attrs?: Record<string, string>;
}

export interface BuiltWorkspace {
    /** Top-level blocks (trade definition, before/after purchase). */
    roots: BlockNode[];
    variables: { id: string; name: string }[];
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────

export type CheckLevel = 'pass' | 'warning' | 'error';

export interface ValidationCheck {
    id: string;
    label: string;
    level: CheckLevel;
    detail: string;
}

export interface ValidationReport {
    ok: boolean;
    checks: ValidationCheck[];
    errors: string[];
    warnings: string[];
    blockCount: number;
    blockTypes: string[];
    unsupportedTypes: string[];
}

// ── Explanation ───────────────────────────────────────────────────────────────────────────────

export interface FlowStep {
    order: number;
    title: string;
    stage: 'discovery' | 'analysis' | 'entry' | 'observation' | 'validation' | 'purchase' | 'monitoring' | 'reporting';
    blocks: string[];
}

export interface BlockUse {
    type: string;
    displayName: string;
    category: string;
    count: number;
    role: string;
}

export interface Explanation {
    summary: string[];
    configuration: { label: string; value: string }[];
    flow: FlowStep[];
    blocks: BlockUse[];
    tradeBehaviour: string;
}

// ── Saved library ─────────────────────────────────────────────────────────────────────────────

export interface SavedBotVersion {
    version: number;
    savedAt: string;
    prompt: string;
    spec: StrategySpec;
    xml: string;
}

export interface SavedBot {
    id: string;
    name: string;
    prompt: string;
    spec: StrategySpec;
    xml: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    blockTypes: string[];
    validation: 'valid' | 'warnings' | 'invalid';
    mode: ExecutionMode;
    risk: RiskPlan;
    history: SavedBotVersion[];
}
