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

/** The bot variants this generator ships with. */
export const MULTI_MARKET_PRESETS: MultiMarketPreset[] = [
    preset('over_1', 'Over 1', { strategy: 'over', barrier: 1 }),
    preset('over_2', 'Over 2', { strategy: 'over', barrier: 2 }),
    preset('under_8', 'Under 8', { strategy: 'under', barrier: 8 }),
    preset('under_7', 'Under 7', { strategy: 'under', barrier: 7 }),
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

/** The digit rule the bot waits for — the same block family the Switch block's condition socket takes. */
function entryConditionXml(config: MultiMarketConfig, id: string): string {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];

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

function entryConditionText(config: MultiMarketConfig): string {
    const spec = MULTI_MARKET_STRATEGIES[config.strategy];
    const digit = config.barrier;

    if (spec.entryOperator === 'LTE') return `last digit ≤ ${digit}`;
    if (spec.entryOperator === 'GTE') return `last digit ≥ ${digit}`;
    if (spec.matchMode === 'matches') return `last digit matches ${digit}`;
    if (spec.matchMode === 'differs') return `last digit differs from ${digit}`;
    return `last digit is ${spec.parity}`;
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

    // Discover + switch: the engine's scan picks the market, waits for its own ticks, then the
    // digit condition decides whether this market is the entry.
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
        buyCondition: `The bot scans the eligible volatility markets in round-robin order, waits for each one's own tick history and a live tick, and buys ${spec.contractType} on the first market whose ${condition}.`,
        afterPurchase:
            config.multiplier > 1
                ? `Win → stake back to ${config.stake} · Loss → stake × ${config.multiplier} · ${stopRule}`
                : `Flat stake of ${config.stake} on every trade · ${stopRule}`,
        restartCondition: `After each contract settles it trades again on the next qualifying tick, until ${stopRule}. Stopping the bot stops market switching immediately.`,
        blocksUsed: `Switch active market · Last Digit · ${
            spec.matchMode ? 'Digit matches/differs' : spec.parity ? 'Digit even/odd' : 'Less/Greater than'
        }`,
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
