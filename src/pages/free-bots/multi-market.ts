/**
 * Multi-Market Digit Entry Hunter — the bot family built on the Digits palette's
 * "Switch active market" block.
 *
 * Each bot is *generated* from a small validated configuration instead of a
 * hand-written XML asset, so one generator produces the shipped presets (Over 1,
 * Over 2, Under 8, Under 7, Even, Odd, Matches, Differs) and whatever the user
 * configures in the panel. The workspace it produces is ordinary Blockly XML:
 *
 *   trade definition (market, digit trade type, contract, 1-tick duration, stake)
 *     └─ before purchase
 *          └─ if not stopped
 *               ├─ Switch active market (round-robin, up to N markets, condition: digit entry)
 *               └─ if <same digit entry> → Purchase <contract>
 *     └─ after purchase: result, profit, take profit, stop loss, loss streak,
 *        stake step, trade again
 *
 * The switch block is the engine's own market scan (`Bot.marketScanBegin/Next/
 * Lock`): it discovers the eligible volatility markets from the app's market
 * discovery service, moves the trade engine's tick subscription and
 * `options.symbol` to the selected market, waits for that market's own history
 * and a genuine live tick, and only then evaluates the digit condition — so a
 * digit from another market can never decide an entry. Nothing here invents a
 * tick, a market or a price, and loading a bot never starts it.
 */

import type {
    FreeBotContractType,
    FreeBotParity,
    FreeBotStrategy,
    FreeBotTemplate,
    FreeBotTradeType,
    MultiMarketBotId,
} from './templates';

export type MultiMarketStrategy = 'over' | 'under' | 'matches' | 'differs' | 'even' | 'odd';

export interface MultiMarketConfig {
    strategy: MultiMarketStrategy;
    /** Barrier digit for Over/Under, target digit for Matches/Differs; `null` for Even/Odd. */
    barrier: number | null;
    /** How many markets one search may inspect. `0` walks every eligible market once. */
    maxScanCycles: number;
    stake: number;
    takeProfit: number;
    /** Positive amount; the generated stop-loss threshold is its negative. */
    stopLoss: number;
    /** Stake multiplier after a loss. `1` is flat staking. */
    multiplier: number;
    /** The bot stops once this many losses happen in a row. */
    maxConsecutiveLosses: number;
    /** Market written into the trade definition; replaced when the bot is loaded. */
    defaultMarket: string;
    /**
     * Last digits the entry accepts on their own ("entry is 5 and 6"). Empty means the contract's
     * own barrier comparison decides the entry.
     */
    entryDigits: number[];
    /** Newest ticks in a row that must all reach a digit ("any 2 digits above or equal 7"). */
    entryRun: MultiMarketRun | null;
    /** Digits that must each hold at least `MULTI_MARKET_FREQUENCY_PERCENT` of the window. */
    minFrequencyDigits: number[];
    /** Digits that must carry neither the green nor the red bar of the digit grid. */
    barNeutralDigits: number[];
}

/** A run of the newest ticks that all have to sit above — or below — one digit. */
export interface MultiMarketRun {
    digits: number;
    count: number;
    mode: 'at_or_above' | 'at_or_below';
}

interface StrategySpec {
    /** Contract family label, e.g. "Over". */
    label: string;
    /** Card/description label, matching the classic library wording. */
    strategyLabel: string;
    contractType: FreeBotContractType;
    tradeType: FreeBotTradeType;
    /** Comparison the entry gate uses for the last digit. */
    entryOperator: 'LTE' | 'GTE' | null;
    matchMode: 'matches' | 'differs' | null;
    parity: FreeBotParity | null;
    /** Label of the digit field in the panel, or `null` when the strategy takes no digit. */
    digitLabel: string | null;
    minDigit: number;
    maxDigit: number;
    defaultDigit: number | null;
}

export const MULTI_MARKET_STRATEGIES: Record<MultiMarketStrategy, StrategySpec> = {
    over: {
        label: 'Over',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        tradeType: 'overunder',
        entryOperator: 'LTE',
        matchMode: null,
        parity: null,
        digitLabel: 'Barrier digit (wins above it)',
        minDigit: 0,
        maxDigit: 8,
        defaultDigit: 1,
    },
    under: {
        label: 'Under',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        tradeType: 'overunder',
        entryOperator: 'GTE',
        matchMode: null,
        parity: null,
        digitLabel: 'Barrier digit (wins below it)',
        minDigit: 1,
        maxDigit: 9,
        defaultDigit: 8,
    },
    matches: {
        label: 'Matches',
        strategyLabel: 'Digit Matches',
        contractType: 'DIGITMATCH',
        tradeType: 'matchesdiffers',
        entryOperator: null,
        matchMode: 'matches',
        parity: null,
        digitLabel: 'Target digit',
        minDigit: 0,
        maxDigit: 9,
        defaultDigit: 5,
    },
    differs: {
        label: 'Differs',
        strategyLabel: 'Digit Differs',
        contractType: 'DIGITDIFF',
        tradeType: 'matchesdiffers',
        entryOperator: null,
        matchMode: 'differs',
        parity: null,
        digitLabel: 'Target digit',
        minDigit: 0,
        maxDigit: 9,
        defaultDigit: 4,
    },
    even: {
        label: 'Even',
        strategyLabel: 'Digit Even',
        contractType: 'DIGITEVEN',
        tradeType: 'evenodd',
        entryOperator: null,
        matchMode: null,
        parity: 'even',
        digitLabel: null,
        minDigit: 0,
        maxDigit: 0,
        defaultDigit: null,
    },
    odd: {
        label: 'Odd',
        strategyLabel: 'Digit Odd',
        contractType: 'DIGITODD',
        tradeType: 'evenodd',
        entryOperator: null,
        matchMode: null,
        parity: 'odd',
        digitLabel: null,
        minDigit: 0,
        maxDigit: 0,
        defaultDigit: null,
    },
};

export const MULTI_MARKET_BOT_NAME = 'Multi-Market Digit Entry Hunter';

/** The window every frequency and bar filter reads, and the share a digit has to hold. */
export const MULTI_MARKET_WINDOW = 100;
export const MULTI_MARKET_FREQUENCY_PERCENT = 10.3;

/** Conservative Demo-first defaults: flat stake, small limits, no martingale growth. */
export const MULTI_MARKET_DEFAULTS: MultiMarketConfig = {
    strategy: 'over',
    barrier: 1,
    maxScanCycles: 0,
    stake: 1,
    takeProfit: 5,
    stopLoss: 10,
    multiplier: 1,
    maxConsecutiveLosses: 3,
    defaultMarket: '1HZ25V',
    entryDigits: [],
    entryRun: null,
    minFrequencyDigits: [],
    barNeutralDigits: [],
};

export interface MultiMarketPreset {
    id: string;
    label: string;
    config: MultiMarketConfig;
}

const preset = (id: string, label: string, changes: Partial<MultiMarketConfig>): MultiMarketPreset => ({
    id,
    label,
    config: { ...MULTI_MARKET_DEFAULTS, ...changes },
});

/**
 * The bot variants this generator ships with. The four digit presets carry the entry rules the
 * strategy asks for: the entry digits (or the run of high/low digits) are the trigger, and the
 * frequency and bar rules are filters the *selected market* itself has to pass before the scan
 * stops — a market that fails them is skipped and the bot switches to the next one.
 */
export const MULTI_MARKET_PRESETS: MultiMarketPreset[] = [
    preset('over_1', 'Over 1', {
        strategy: 'over',
        barrier: 1,
        entryDigits: [5, 6],
        barNeutralDigits: [5, 6],
        minFrequencyDigits: [0, 1],
    }),
    preset('over_2', 'Over 2', { strategy: 'over', barrier: 2 }),
    preset('over_7', 'Over 7', {
        strategy: 'over',
        barrier: 7,
        entryRun: { digits: 2, count: 2, mode: 'at_or_below' },
        barNeutralDigits: [0, 1, 2],
        minFrequencyDigits: [0, 1, 2],
    }),
    preset('under_8', 'Under 8', {
        strategy: 'under',
        barrier: 8,
        entryDigits: [7, 4, 8],
        barNeutralDigits: [7, 4, 8],
        minFrequencyDigits: [8, 9],
    }),
    preset('under_7', 'Under 7', {
        strategy: 'under',
        barrier: 7,
        entryRun: { digits: 7, count: 2, mode: 'at_or_above' },
        barNeutralDigits: [7, 8, 9],
        minFrequencyDigits: [7, 8, 9],
    }),
    preset('even', 'Even', { strategy: 'even', barrier: null }),
    preset('odd', 'Odd', { strategy: 'odd', barrier: null }),
    preset('matches', 'Matches', { strategy: 'matches', barrier: 5 }),
    preset('differs', 'Differs', { strategy: 'differs', barrier: 4 }),
];

const isWholeNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

/** Everything the generator needs to be true before it may build a workspace. */
export function validateMultiMarketConfig(config: MultiMarketConfig): string[] {
    const errors: string[] = [];
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];

    if (!spec) {
        errors.push('Choose a digit strategy.');
        return errors;
    }

    if (spec.digitLabel) {
        if (!isWholeNumber(config.barrier) || config.barrier < spec.minDigit || config.barrier > spec.maxDigit) {
            errors.push(`The ${spec.label} digit must be a whole number between ${spec.minDigit} and ${spec.maxDigit}.`);
        }
    } else if (config.barrier !== null) {
        errors.push(`${spec.label} takes no barrier digit.`);
    }

    const ruleDigits = [...config.entryDigits, ...config.barNeutralDigits, ...config.minFrequencyDigits];
    if (ruleDigits.some(digit => !isWholeNumber(digit) || digit < 0 || digit > 9)) {
        errors.push('Entry, frequency and bar digits must be whole numbers between 0 and 9.');
    }
    if (config.entryRun) {
        const { digits, count, mode } = config.entryRun;
        if (!isWholeNumber(digits) || digits < 0 || digits > 9) {
            errors.push('The digit a run has to reach must be a whole number between 0 and 9.');
        }
        if (!isWholeNumber(count) || count < 2) {
            errors.push('A digit run needs at least 2 ticks in a row.');
        }
        if (mode !== 'at_or_above' && mode !== 'at_or_below') {
            errors.push('A digit run must look for digits at or above, or at or below, its digit.');
        }
    }

    if (!isWholeNumber(config.maxScanCycles) || config.maxScanCycles < 0) {
        errors.push('Maximum scan cycles must be a whole number, or 0 to scan every eligible market once.');
    }
    if (!Number.isFinite(config.stake) || config.stake <= 0) {
        errors.push('Initial stake must be greater than 0.');
    }
    if (!Number.isFinite(config.takeProfit) || config.takeProfit <= 0) {
        errors.push('Take profit must be greater than 0.');
    }
    if (!Number.isFinite(config.stopLoss) || config.stopLoss <= 0) {
        errors.push('Stop loss must be greater than 0.');
    }
    if (!Number.isFinite(config.multiplier) || config.multiplier < 1 || config.multiplier > 3) {
        errors.push('Stake multiplier must be between 1 (flat staking) and 3.');
    }
    if (!isWholeNumber(config.maxConsecutiveLosses) || config.maxConsecutiveLosses < 1) {
        errors.push('Maximum consecutive losses must be at least 1.');
    }
    if (!config.defaultMarket) {
        errors.push('The trade definition needs a market.');
    }

    return errors;
}

// ── XML building blocks ─────────────────────────────────────────────────────────────────────────

const VAR_IDS = {
    stake: 'mm-var-stake',
    profit: 'mm-var-profit',
    won: 'mm-var-won',
    stop: 'mm-var-stop',
    initialised: 'mm-var-initialised',
    losses: 'mm-var-losses',
} as const;

const VAR_NAMES: Record<keyof typeof VAR_IDS, string> = {
    stake: 'freebot:stake',
    profit: 'freebot:profit',
    won: 'freebot:won',
    stop: 'freebot:stop',
    initialised: 'freebot:initialised',
    losses: 'freebot:losses',
};

/** Nests a statement chain the way Blockly serialises it: each block carries the next in `<next>`. */
const sequence = (blocks: string[]): string =>
    blocks.reduceRight(
        (next, block) => `${block.slice(0, block.lastIndexOf('</block>'))}<next>${next}</next></block>`,
        ''
    );

const variablesGet = (id: string, name: keyof typeof VAR_IDS): string =>
    `<block type="variables_get" id="${id}"><field name="VAR" id="${VAR_IDS[name]}" variabletype="">${VAR_NAMES[name]}</field></block>`;

const variablesSet = (id: string, name: keyof typeof VAR_IDS, value: string): string =>
    `<block type="variables_set" id="${id}"><field name="VAR" id="${VAR_IDS[name]}" variabletype="">${VAR_NAMES[name]}</field><value name="VALUE">${value}</value></block>`;

const mathNumber = (id: string, value: number | string): string =>
    `<block type="math_number" id="${id}"><field name="NUM">${value}</field></block>`;

const mathShadow = (id: string, type: string, value: number | string): string =>
    `<shadow type="${type}" id="${id}"><field name="NUM">${value}</field></shadow>`;

const logicBoolean = (id: string, value: boolean): string =>
    `<block type="logic_boolean" id="${id}"><field name="BOOL">${value ? 'TRUE' : 'FALSE'}</field></block>`;

const logicCompare = (id: string, operator: string, a: string, b: string): string =>
    `<block type="logic_compare" id="${id}"><field name="OP">${operator}</field><value name="A">${a}</value><value name="B">${b}</value></block>`;

const notBlock = (id: string, value: string): string =>
    `<block type="logic_negate" id="${id}"><value name="BOOL">${value}</value></block>`;

const ifBlock = (id: string, condition: string, doStatement: string, elseStatement?: string): string =>
    `<block type="controls_if" id="${id}">${
        elseStatement ? '<mutation else="1"></mutation>' : ''
    }<value name="IF0">${condition}</value><statement name="DO0">${doStatement}</statement>${
        elseStatement ? `<statement name="ELSE">${elseStatement}</statement>` : ''
    }</block>`;

const lastDigit = (id: string): string => `<block type="last_digit" id="${id}"></block>`;

const logicOperation = (id: string, operator: 'AND' | 'OR', a: string, b: string): string =>
    `<block type="logic_operation" id="${id}"><field name="OP">${operator}</field><value name="A">${a}</value><value name="B">${b}</value></block>`;

const digitsFrequency = (id: string, digit: number): string =>
    `<block type="digits_frequency" id="${id}"><field name="DIGIT">${digit}</field><value name="SAMPLE">${mathShadow(
        `${id}-sample`,
        'math_number',
        MULTI_MARKET_WINDOW
    )}</value></block>`;

const digitBarNeutral = (id: string, digit: number): string =>
    `<block type="digits_bar_neutral" id="${id}"><field name="DIGIT">${digit}</field><value name="SAMPLE">${mathShadow(
        `${id}-sample`,
        'math_number',
        MULTI_MARKET_WINDOW
    )}</value></block>`;

const digitRun = (id: string, run: MultiMarketRun): string =>
    `<block type="digits_high_run" id="${id}"><value name="COUNT">${mathShadow(
        `${id}-count`,
        'math_number',
        run.count
    )}</value><field name="MODE">${run.mode}</field><field name="DIGIT">${run.digits}</field></block>`;

/**
 * What the entry waits for on the market the scan has selected: the run of high/low digits or one
 * of the listed entry digits when the strategy states them, otherwise the contract's own barrier.
 */
function entryTriggerXml(config: MultiMarketConfig, id: string): string {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];

    if (config.entryRun) return digitRun(`${id}-run`, config.entryRun);

    if (config.entryDigits.length) {
        return config.entryDigits
            .map(digit =>
                logicCompare(
                    `${id}-is-${digit}`,
                    'EQ',
                    lastDigit(`${id}-digit-${digit}`),
                    mathShadow(`${id}-is-${digit}-value`, 'math_number', digit)
                )
            )
            .reduce((all, one, index) => logicOperation(`${id}-either-${index}`, 'OR', all, one));
    }

    if (spec.entryOperator) {
        return logicCompare(
            `${id}-compare`,
            spec.entryOperator,
            lastDigit(`${id}-digit`),
            mathShadow(`${id}-barrier`, 'math_number', config.barrier as number)
        );
    }

    if (spec.matchMode) {
        return `<block type="digits_matches_differs" id="${id}-matches"><field name="MODE">${spec.matchMode}</field><field name="DIGIT">${config.barrier}</field></block>`;
    }

    return `<block type="digits_even_odd" id="${id}-parity"><field name="PARITY">${spec.parity}</field></block>`;
}

/**
 * The whole entry rule — the trigger AND every frequency and bar filter — as one Boolean. The
 * Switch block and the purchase confirmation both use it, so the bot only stops on a market that
 * genuinely passes the rule on its own ticks, and the buy re-checks it on the frozen market.
 */
function entryConditionXml(config: MultiMarketConfig, id: string): string {
    const conditions: string[] = [entryTriggerXml(config, id)];

    config.minFrequencyDigits.forEach(digit => {
        conditions.push(
            logicCompare(
                `${id}-freq-check-${digit}`,
                'GTE',
                digitsFrequency(`${id}-freq-${digit}`, digit),
                mathShadow(`${id}-freq-min-${digit}`, 'math_number', MULTI_MARKET_FREQUENCY_PERCENT)
            )
        );
    });

    config.barNeutralDigits.forEach(digit => {
        conditions.push(digitBarNeutral(`${id}-bar-${digit}`, digit));
    });

    return conditions.reduce((all, one, index) => logicOperation(`${id}-and-${index}`, 'AND', all, one));
}

const digitList = (digits: number[]): string =>
    digits.length < 2 ? digits.join('') : `${digits.slice(0, -1).join(', ')} and ${digits[digits.length - 1]}`;

/** The entry rule in words, for the panel summary and the template description. */
export function entryConditionText(config: MultiMarketConfig): string {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];
    const digit = config.barrier;
    const parts: string[] = [];

    if (config.entryRun) {
        const side = config.entryRun.mode === 'at_or_above' ? 'or above' : 'or below';
        parts.push(`the last ${config.entryRun.count} digits are each ${config.entryRun.digits} ${side}`);
    } else if (config.entryDigits.length) {
        parts.push(`last digit is ${digitList(config.entryDigits)}`);
    } else if (spec.entryOperator === 'LTE') {
        parts.push(`last digit ≤ ${digit}`);
    } else if (spec.entryOperator === 'GTE') {
        parts.push(`last digit ≥ ${digit}`);
    } else if (spec.matchMode === 'matches') {
        parts.push(`last digit matches ${digit}`);
    } else if (spec.matchMode === 'differs') {
        parts.push(`last digit differs from ${digit}`);
    } else {
        parts.push(`last digit is ${spec.parity}`);
    }

    if (config.minFrequencyDigits.length) {
        parts.push(
            `digit ${digitList(config.minFrequencyDigits)} at least ${MULTI_MARKET_FREQUENCY_PERCENT}% of the last ${MULTI_MARKET_WINDOW} ticks`
        );
    }
    if (config.barNeutralDigits.length) {
        parts.push(`digit ${digitList(config.barNeutralDigits)} with neither the green nor the red bar`);
    }

    return parts.join(' · ');
}

/** `FreeBotStrategy` values the classic library already uses, so scanner typing stays intact. */
function freeBotStrategyOf(config: MultiMarketConfig): FreeBotStrategy {
    const digit = config.barrier;
    switch (config.strategy) {
        case 'over':
            if (digit === 1) return 'over1';
            if (digit === 2) return 'over2';
            if (digit === 3) return 'over3';
            if (digit === 4) return 'over4';
            return 'over2';
        case 'under':
            if (digit === 5) return 'under5';
            if (digit === 6) return 'under6';
            if (digit === 8) return 'under8';
            return 'under7';
        case 'matches':
            return 'matches';
        case 'differs':
            return 'differs';
        case 'even':
            return 'even';
        case 'odd':
            return 'odd';
        default:
            return 'over1';
    }
}

/** Builds the complete Blockly XML for one configuration. */
export function buildMultiMarketBotXml(config: MultiMarketConfig): string {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];
    const hasPrediction = spec.digitLabel !== null;

    const variables = (Object.keys(VAR_IDS) as (keyof typeof VAR_IDS)[])
        .map(key => `<variable type="" id="${VAR_IDS[key]}" islocal="false" iscloud="false">${VAR_NAMES[key]}</variable>`)
        .join('');

    const tradeOptions = sequence([
        `<block type="trade_definition_market" id="mm-market" deletable="false" movable="false"><field name="MARKET_LIST">synthetic_index</field><field name="SUBMARKET_LIST">random_index</field><field name="SYMBOL_LIST">${config.defaultMarket}</field></block>`,
        `<block type="trade_definition_tradetype" id="mm-tradetype" deletable="false" movable="false"><field name="TRADETYPECAT_LIST">digits</field><field name="TRADETYPE_LIST">${spec.tradeType}</field></block>`,
        `<block type="trade_definition_contracttype" id="mm-contracttype" deletable="false" movable="false"><field name="TYPE_LIST">${spec.contractType}</field></block>`,
        `<block type="trade_definition_candleinterval" id="mm-candleinterval" deletable="false" movable="false"><field name="CANDLEINTERVAL_LIST">60</field></block>`,
        `<block type="trade_definition_restartbuysell" id="mm-restartbuysell" deletable="false" movable="false"><field name="TIME_MACHINE_ENABLED">FALSE</field></block>`,
        `<block type="trade_definition_restartonerror" id="mm-restartonerror" deletable="false" movable="false"><field name="RESTARTONERROR">TRUE</field></block>`,
    ]);

    // The stake must exist before the first quote is requested, so it is seeded here (run once).
    const initialization = ifBlock(
        'mm-init',
        notBlock('mm-not-initialised', variablesGet('mm-read-initialised', 'initialised')),
        sequence([
            variablesSet('mm-set-initialised', 'initialised', logicBoolean('mm-initialised-true', true)),
            variablesSet('mm-set-stake', 'stake', mathNumber('mm-base-stake', config.stake)),
            variablesSet('mm-set-profit', 'profit', mathNumber('mm-zero-profit', 0)),
            variablesSet('mm-set-losses', 'losses', mathNumber('mm-zero-losses', 0)),
            variablesSet('mm-set-stop', 'stop', logicBoolean('mm-stop-off', false)),
        ])
    );

    const tradeoptions = `<block type="trade_definition_tradeoptions" id="mm-tradeoptions"><mutation has_first_barrier="false" has_second_barrier="false" has_prediction="${hasPrediction}"></mutation><field name="DURATIONTYPE_LIST">t</field><field name="CURRENCY_LIST">USD</field><value name="DURATION">${mathShadow(
        'mm-duration',
        'math_number_positive',
        1
    )}</value><value name="AMOUNT">${mathShadow('mm-initial-stake', 'math_number_positive', config.stake)}${variablesGet(
        'mm-stake',
        'stake'
    )}</value>${
        hasPrediction
            ? `<value name="PREDICTION">${mathShadow(
                  'mm-prediction',
                  'math_number_positive',
                  config.barrier as number
              )}</value>`
            : ''
    }<field name="AMOUNT_LIMITS"></field></block>`;

    // Discover + switch: the engine's scan picks the market, waits for its own ticks, then the whole
    // entry rule decides whether this market is the entry. A market that fails any part of it is
    // skipped and the scan switches to the next one.
    const switchBlock = `<block type="switch_active_market" id="mm-switch"><field name="ORDER">round_robin</field><value name="MAX_SWITCHES">${mathNumber(
        'mm-max-switches',
        config.maxScanCycles
    )}</value><value name="CONDITION">${entryConditionXml(config, 'mm-scan')}</value></block>`;

    // Confirmation on the frozen market, then the existing purchase block: the engine's own
    // proposal, risk checks and Demo/Real protections run exactly as they do for any bot.
    const purchase = ifBlock(
        'mm-entry',
        entryConditionXml(config, 'mm-entry'),
        `<block type="purchase" id="mm-purchase"><field name="PURCHASE_LIST">${spec.contractType}</field></block>`
    );

    const beforePurchase = `<block type="before_purchase" id="mm-before-purchase" x="0" y="740"><statement name="BEFOREPURCHASE_STACK">${ifBlock(
        'mm-guard',
        notBlock('mm-not-stopped', variablesGet('mm-read-stop', 'stop')),
        sequence([switchBlock, purchase])
    )}</statement></block>`;

    const afterPurchase = `<block type="after_purchase" id="mm-after-purchase" x="760" y="0"><statement name="AFTERPURCHASE_STACK">${sequence(
        [
            variablesSet(
                'mm-set-won',
                'won',
                `<block type="contract_check_result" id="mm-check-win"><field name="CHECK_RESULT">win</field></block>`
            ),
            variablesSet(
                'mm-add-profit',
                'profit',
                `<block type="math_arithmetic" id="mm-profit-sum"><field name="OP">ADD</field><value name="A">${variablesGet(
                    'mm-read-profit',
                    'profit'
                )}</value><value name="B"><block type="read_details" id="mm-contract-profit"><field name="DETAIL_INDEX">4</field></block></value></block>`
            ),
            ifBlock(
                'mm-take-profit',
                logicCompare(
                    'mm-take-profit-compare',
                    'GTE',
                    variablesGet('mm-read-profit-for-tp', 'profit'),
                    mathShadow('mm-take-profit-value', 'math_number', config.takeProfit)
                ),
                variablesSet('mm-stop-on-profit', 'stop', logicBoolean('mm-stop-on-profit-value', true))
            ),
            ifBlock(
                'mm-stop-loss',
                logicCompare(
                    'mm-stop-loss-compare',
                    'LTE',
                    variablesGet('mm-read-profit-for-sl', 'profit'),
                    mathShadow('mm-stop-loss-value', 'math_number', -Math.abs(config.stopLoss))
                ),
                variablesSet('mm-stop-on-loss', 'stop', logicBoolean('mm-stop-on-loss-value', true))
            ),
            ifBlock(
                'mm-loss-streak',
                variablesGet('mm-read-won', 'won'),
                variablesSet('mm-reset-losses', 'losses', mathNumber('mm-reset-losses-value', 0)),
                variablesSet(
                    'mm-add-loss',
                    'losses',
                    `<block type="math_arithmetic" id="mm-loss-sum"><field name="OP">ADD</field><value name="A">${variablesGet(
                        'mm-read-losses',
                        'losses'
                    )}</value><value name="B">${mathNumber('mm-one-loss', 1)}</value></block>`
                )
            ),
            ifBlock(
                'mm-loss-limit',
                logicCompare(
                    'mm-loss-limit-compare',
                    'GTE',
                    variablesGet('mm-read-losses-for-limit', 'losses'),
                    mathShadow('mm-loss-limit-value', 'math_number', config.maxConsecutiveLosses)
                ),
                variablesSet('mm-stop-on-losses', 'stop', logicBoolean('mm-stop-on-losses-value', true))
            ),
            ifBlock(
                'mm-stake-step',
                variablesGet('mm-read-won-for-stake', 'won'),
                variablesSet('mm-reset-stake', 'stake', mathNumber('mm-reset-stake-value', config.stake)),
                variablesSet(
                    'mm-multiply-stake',
                    'stake',
                    `<block type="math_arithmetic" id="mm-stake-multiplier"><field name="OP">MULTIPLY</field><value name="A">${variablesGet(
                        'mm-read-stake',
                        'stake'
                    )}</value><value name="B">${mathShadow(
                        'mm-multiplier-value',
                        'math_number',
                        config.multiplier
                    )}</value></block>`
                )
            ),
            ifBlock(
                'mm-trade-again',
                notBlock('mm-not-stopped-again', variablesGet('mm-read-stop-for-again', 'stop')),
                `<block type="trade_again" id="mm-trade-again-block"></block>`
            ),
        ]
    )}</statement></block>`;

    return [
        '<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">',
        `<variables>${variables}</variables>`,
        `<block type="trade_definition" id="mm-definition" x="0" y="0"><statement name="TRADE_OPTIONS">${tradeOptions}</statement><statement name="INITIALIZATION">${initialization}</statement><statement name="SUBMARKET">${tradeoptions}</statement></block>`,
        beforePurchase,
        afterPurchase,
        '</xml>',
    ].join('');
}

export function multiMarketBotName(config: MultiMarketConfig): string {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];
    const digit = spec.digitLabel ? ` ${config.barrier}` : '';
    return `${MULTI_MARKET_BOT_NAME} — ${spec.label}${digit}`;
}

/** Stable id for one configuration, so the loaded bot stays resolvable from the id alone. */
export function multiMarketTemplateId(config: MultiMarketConfig): MultiMarketBotId {
    const digit = MULTI_MARKET_STRATEGIES[config.strategy].digitLabel ? String(config.barrier) : 'any';
    // The entry rule is part of the id too, so two bots that differ only in their filters stay apart.
    const rule = [
        config.entryRun
            ? `run${config.entryRun.count}${config.entryRun.digits}${config.entryRun.mode === 'at_or_above' ? 'up' : 'down'}`
            : '',
        config.entryDigits.length ? `entry${config.entryDigits.join('')}` : '',
        config.minFrequencyDigits.length ? `freq${config.minFrequencyDigits.join('')}` : '',
        config.barNeutralDigits.length ? `bar${config.barNeutralDigits.join('')}` : '',
    ]
        .filter(Boolean)
        .join('');
    return [
        'multi_market',
        config.strategy,
        digit,
        `scan${config.maxScanCycles}`,
        `stake${config.stake}`,
        `tp${config.takeProfit}`,
        `sl${config.stopLoss}`,
        `x${config.multiplier}`,
        `loss${config.maxConsecutiveLosses}`,
        rule || 'plain',
    ].join('_') as MultiMarketBotId;
}

const builtTemplates = new Map<string, FreeBotTemplate>();

/**
 * Turns a configuration into a template the existing Free Bots loader can load,
 * inspect and validate — the XML is generated here, never mocked.
 */
export function multiMarketTemplate(config: MultiMarketConfig): FreeBotTemplate {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];
    const digit = spec.digitLabel ? (config.barrier as number) : null;
    const id = multiMarketTemplateId(config);
    const condition = entryConditionText(config);
    const stopRule = `stops at +${config.takeProfit} profit, −${config.stopLoss} loss or ${config.maxConsecutiveLosses} losses in a row`;

    const template: FreeBotTemplate = {
        id,
        name: multiMarketBotName(config),
        sourceFile: 'Generated by the Multi-Market Digit Entry Hunter builder',
        asset: '',
        xml: buildMultiMarketBotXml(config),
        marketScan: true,
        strategy: freeBotStrategyOf(config),
        strategyLabel: spec.strategyLabel,
        contractType: spec.contractType,
        tradeType: spec.tradeType,
        prediction: digit,
        entryParity: spec.parity ?? undefined,
        durationTicks: 1,
        defaultMarket: config.defaultMarket,
        stake: config.stake,
        takeProfit: config.takeProfit,
        stopLoss: config.stopLoss,
        multiplier: config.multiplier,
        entryOperator: spec.entryOperator,
        triggerDigit: spec.entryOperator ? digit : null,
        entryRule: `${condition} · the market is switched by the Digits "Switch active market" block`,
        buyCondition: `The bot scans the eligible volatility markets in round-robin order, waits for each one's own tick history and a live tick, and reads the entry rule on that market: ${condition}. A market that fails any part of it is skipped and the scan switches to the next one; the first market that passes is bought ${spec.contractType}.`,
        afterPurchase:
            config.multiplier > 1
                ? `Win → stake back to ${config.stake} · Loss → stake × ${config.multiplier} · ${stopRule}`
                : `Flat stake of ${config.stake} on every trade · ${stopRule}`,
        restartCondition: `After each contract settles it trades again on the next qualifying tick, until ${stopRule}. Stopping the bot stops market switching immediately.`,
        blocksUsed: [
            'Switch active market',
            ...(config.entryRun ? ['High digits in a row'] : ['Last Digit']),
            ...(config.entryRun
                ? []
                : [spec.matchMode ? 'Digit matches/differs' : spec.parity ? 'Digit even/odd' : 'Less/Greater than']),
            ...(config.minFrequencyDigits.length ? ['Digit frequency'] : []),
            ...(config.barNeutralDigits.length ? ['Neutral digit bar'] : []),
        ].join(' · '),
    };

    builtTemplates.set(id, template);
    return template;
}

/** A generated template by id (the loader re-reads it when validating a loaded bot). */
export function multiMarketById(id: string | null | undefined): FreeBotTemplate | null {
    if (!id) return null;
    return builtTemplates.get(id) ?? null;
}

/** Every preset as a ready template — the eight bots this builder ships with. */
export function multiMarketTemplates(): FreeBotTemplate[] {
    return MULTI_MARKET_PRESETS.map(item => multiMarketTemplate(item.config));
}
