/**
 * Reading, checking and re-targeting a Free Bots Blockly XML asset.
 *
 * The Bot Builder's own loader (`external/bot-skeleton` `load()`) deletes the
 * whole strategy when it meets a block type it cannot generate, so the checks
 * here run *before* the XML reaches the workspace and report what is wrong in
 * plain language. The uploaded template file is never edited: the market is
 * applied to a copy, and the entry logic, contract, variables and
 * after-purchase rules are re-read from that copy to prove they survived.
 */

import type { FreeBotTemplate } from './templates';

export interface FreeBotCheck {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
}

export interface FreeBotXmlSettings {
    symbol: string | null;
    market: string | null;
    submarket: string | null;
    tradeTypeCategory: string | null;
    tradeType: string | null;
    contractType: string | null;
    prediction: string | null;
    durationType: string | null;
    duration: string | null;
    stake: string | null;
    entryOperator: string | null;
    triggerDigit: string | null;
    entryParity: string | null;
    multiplier: string | null;
    takeProfit: string | null;
    stopLoss: string | null;
}

export interface FreeBotXmlReport {
    ok: boolean;
    errors: string[];
    warnings: string[];
    checks: FreeBotCheck[];
    blockCount: number;
    blockTypes: string[];
    unsupportedTypes: string[];
    variables: string[];
    missingVariables: string[];
    settings: FreeBotXmlSettings;
}

export interface MarketTarget {
    symbol: string;
    market?: string | null;
    submarket?: string | null;
}

const EMPTY_SETTINGS: FreeBotXmlSettings = {
    symbol: null,
    market: null,
    submarket: null,
    tradeTypeCategory: null,
    tradeType: null,
    contractType: null,
    prediction: null,
    durationType: null,
    duration: null,
    stake: null,
    entryOperator: null,
    triggerDigit: null,
    entryParity: null,
    multiplier: null,
    takeProfit: null,
    stopLoss: null,
};

function blocksOfType(root: Element | Document, type: string): Element[] {
    return Array.from(root.querySelectorAll(`block[type="${type}"]`));
}

function fieldValue(root: Element | Document | null, name: string, tag = 'field'): string | null {
    if (!root) return null;
    const field = root.querySelector(`${tag}[name="${name}"]`);
    return field?.textContent?.trim() ?? null;
}

function valueField(root: Element | Document | null, valueName: string): string | null {
    if (!root) return null;
    const field = root.querySelector(`value[name="${valueName}"] field[name="NUM"]`);
    return field?.textContent?.trim() ?? null;
}

/** Parses the asset into a DOM, or explains why it cannot be parsed. */
export function parseBotXml(xml: string): { doc: Document | null; error: string | null } {
    if (!xml || !xml.trim()) return { doc: null, error: 'The template XML is empty.' };

    try {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const parserError = doc.getElementsByTagName('parsererror')[0];
        if (parserError) {
            return { doc: null, error: `The XML is not well formed: ${parserError.textContent?.trim() ?? 'parse error'}` };
        }
        const root = doc.documentElement;
        if (!root || root.tagName.toLowerCase() !== 'xml') {
            return { doc: null, error: `Expected a Blockly document but found <${root?.tagName ?? 'nothing'}>.` };
        }
        return { doc, error: null };
    } catch (error) {
        return { doc: null, error: `The XML could not be parsed: ${(error as Error).message}` };
    }
}

function readSettings(doc: Document): FreeBotXmlSettings {
    const market = blocksOfType(doc, 'trade_definition_market')[0];
    const tradetype = blocksOfType(doc, 'trade_definition_tradetype')[0];
    const contractType = blocksOfType(doc, 'trade_definition_contracttype')[0];
    const tradeoptions = blocksOfType(doc, 'trade_definition_tradeoptions')[0];
    const entry = findEntryCondition(doc);
    const after = blocksOfType(doc, 'after_purchase')[0] ?? null;
    const multiplier = findMultiplier(after)?.multiplier ?? null;

    return {
        symbol: fieldValue(market, 'SYMBOL_LIST', 'field'),
        market: fieldValue(market, 'MARKET_LIST', 'field'),
        submarket: fieldValue(market, 'SUBMARKET_LIST', 'field'),
        tradeTypeCategory: fieldValue(tradetype, 'TRADETYPECAT_LIST', 'field'),
        tradeType: fieldValue(tradetype, 'TRADETYPE_LIST', 'field'),
        contractType: fieldValue(contractType, 'TYPE_LIST', 'field'),
        prediction: valueField(tradeoptions, 'PREDICTION'),
        durationType: fieldValue(tradeoptions, 'DURATIONTYPE_LIST', 'field'),
        duration: valueField(tradeoptions, 'DURATION'),
        stake: valueField(tradeoptions, 'AMOUNT'),
        entryOperator: entry?.operator ?? null,
        triggerDigit: entry?.trigger ?? null,
        entryParity: entry?.parity ?? null,
        multiplier,
        takeProfit: findThreshold(after, 'GTE') ?? null,
        stopLoss: findThreshold(after, 'LTE') ?? null,
    };
}

interface EntryCondition {
    operator: string | null;
    trigger: string | null;
    /** `even` / `odd` when the purchase is gated by the Even/Odd digit block. */
    parity: string | null;
    /** `matches` / `differs` when the purchase is gated by the Matches/Differs digit block. */
    matchMode: 'matches' | 'differs' | null;
    matchDigit: string | null;
    purchaseContract: string | null;
    hasPurchase: boolean;
}

/**
 * The entry gate that wraps the purchase: either the classic
 * `if <last digit> <op> <digit> then purchase <contract>`, or the Even/Odd form
 * where the `digits_even_odd` digit block supplies the condition.
 */
export function findEntryCondition(doc: Document): EntryCondition | null {
    const beforePurchase = blocksOfType(doc, 'before_purchase')[0];
    if (!beforePurchase) return null;

    const compares = blocksOfType(beforePurchase, 'logic_compare');
    for (const compare of compares) {
        if (!compare.querySelector('block[type="last_digit"]')) continue;
        const operator = fieldValue(compare, 'OP');
        const trigger = valueField(compare, 'B');
        if (!operator || trigger === null) continue;

        const controlsIf = compare.parentElement?.parentElement ?? null;
        const purchase = controlsIf?.querySelector('statement[name="DO0"] block[type="purchase"]') ?? null;

        return {
            operator,
            trigger,
            parity: null,
            matchMode: null,
            matchDigit: null,
            purchaseContract: fieldValue(purchase, 'PURCHASE_LIST'),
            hasPurchase: !!purchase,
        };
    }

    const parityBlocks = blocksOfType(beforePurchase, 'digits_even_odd');
    for (const parityBlock of parityBlocks) {
        const parity = fieldValue(parityBlock, 'PARITY');
        if (!parity) continue;

        const controlsIf = parityBlock.parentElement?.parentElement ?? null;
        const purchase = controlsIf?.querySelector('statement[name="DO0"] block[type="purchase"]') ?? null;
        if (!purchase) continue;

        return {
            operator: null,
            trigger: null,
            parity,
            matchMode: null,
            matchDigit: null,
            purchaseContract: fieldValue(purchase, 'PURCHASE_LIST'),
            hasPurchase: true,
        };
    }

    // Matches/Differs: `if <last digit matches/differs from N> then purchase <contract>`.
    const matchBlocks = blocksOfType(beforePurchase, 'digits_matches_differs');
    for (const matchBlock of matchBlocks) {
        const mode = fieldValue(matchBlock, 'MODE');
        const matchDigit = fieldValue(matchBlock, 'DIGIT');
        if (mode !== 'matches' && mode !== 'differs') continue;

        const controlsIf = matchBlock.parentElement?.parentElement ?? null;
        const purchase = controlsIf?.querySelector('statement[name="DO0"] block[type="purchase"]') ?? null;
        if (!purchase) continue;

        return {
            operator: null,
            trigger: null,
            parity: null,
            matchMode: mode,
            matchDigit,
            purchaseContract: fieldValue(purchase, 'PURCHASE_LIST'),
            hasPurchase: true,
        };
    }

    return null;
}

/** The stake multiplier of the after-purchase martingale step. */
function findMultiplier(afterPurchase: Element | null): { multiplier: string; op: string } | null {
    if (!afterPurchase) return null;
    const arithmetic = blocksOfType(afterPurchase, 'math_arithmetic');
    for (const block of arithmetic) {
        if (fieldValue(block, 'OP') !== 'MULTIPLY') continue;
        const b = block.querySelector('value[name="B"] field[name="NUM"]')?.textContent?.trim();
        if (b) return { multiplier: b, op: 'MULTIPLY' };
    }
    return null;
}

function findThreshold(afterPurchase: Element | null, operator: string): string | null {
    if (!afterPurchase) return null;
    const compares = blocksOfType(afterPurchase, 'logic_compare');
    for (const compare of compares) {
        if (fieldValue(compare, 'OP') !== operator) continue;
        const value = compare.querySelector('value[name="B"] field[name="NUM"]')?.textContent?.trim();
        if (value) return value;
    }
    return null;
}

function declaredVariables(doc: Document): { ids: Set<string>; names: string[] } {
    const ids = new Set<string>();
    const names: string[] = [];
    Array.from(doc.querySelectorAll('variables > variable')).forEach(variable => {
        const id = variable.getAttribute('id');
        if (id) ids.add(id);
        const name = variable.textContent?.trim();
        if (name) names.push(name);
    });
    return { ids, names };
}

function usedVariableIds(doc: Document): Set<string> {
    const ids = new Set<string>();
    Array.from(doc.querySelectorAll('field[name="VAR"], field[name="VARIABLE"]')).forEach(field => {
        const id = field.getAttribute('id');
        if (id) ids.add(id);
    });
    return ids;
}

/**
 * Runs every structural check the Bot Builder needs, so a template is either
 * proven loadable or reported with the exact reason it is not.
 */
export function inspectFreeBotXml(
    xml: string,
    template: FreeBotTemplate,
    isBlockTypeKnown: (type: string) => boolean
): FreeBotXmlReport {
    const checks: FreeBotCheck[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const parsed = parseBotXml(xml);
    if (!parsed.doc) {
        return {
            ok: false,
            errors: [parsed.error ?? 'The XML could not be parsed.'],
            warnings,
            checks: [{ id: 'xml', label: 'XML parses', passed: false, detail: parsed.error ?? 'parse error' }],
            blockCount: 0,
            blockTypes: [],
            unsupportedTypes: [],
            variables: [],
            missingVariables: [],
            settings: { ...EMPTY_SETTINGS },
        };
    }

    const doc = parsed.doc;
    checks.push({ id: 'xml', label: 'XML parses', passed: true, detail: 'Well-formed Blockly document.' });

    // Every block the running Bot Builder can generate code for — including the
    // shadow blocks that carry the stake, duration and prediction values.
    const blockElements = Array.from(doc.querySelectorAll('block[type], shadow[type]'));
    // Blockly's `getAllBlocks()` reports shadows too, except a shadow replaced by
    // a real block in the same input (the stake's `variables_get` shadows the
    // number input). That is the count the live workspace must match after a
    // load, so a stale canvas is caught instead of being called valid.
    const replacedShadows = Array.from(doc.querySelectorAll('value')).filter(value => {
        const children = Array.from(value.children).map(child => child.tagName.toLowerCase());
        return children.includes('block') && children.includes('shadow');
    }).length;
    const blockTypes = Array.from(new Set(blockElements.map(block => block.getAttribute('type') as string))).sort();
    const unsupportedTypes = blockTypes.filter(type => !isBlockTypeKnown(type));
    const typesOk = unsupportedTypes.length === 0;
    checks.push({
        id: 'block-types',
        label: 'Block types are supported',
        passed: typesOk,
        detail: typesOk
            ? `${blockTypes.length} block types, all known to the Bot Builder.`
            : `The Bot Builder cannot generate code for: ${unsupportedTypes.join(', ')}.`,
    });
    if (!typesOk) {
        errors.push(
            `Unsupported block type(s): ${unsupportedTypes.join(', ')}. These blocks are kept in the file — nothing is deleted silently — but the bot cannot run until a generator exists for them.`
        );
    }

    const settings = readSettings(doc);

    const hasTradeDefinition = blocksOfType(doc, 'trade_definition').length > 0;
    checks.push({
        id: 'trade-definition',
        label: 'Trade definition block',
        passed: hasTradeDefinition,
        detail: hasTradeDefinition ? 'Present.' : 'The XML has no trade definition block.',
    });
    if (!hasTradeDefinition) errors.push('The template has no "Trade definition" block.');

    const hasMarket = !!settings.symbol;
    checks.push({
        id: 'market',
        label: 'Market configured',
        passed: hasMarket,
        detail: hasMarket ? `${settings.symbol} (${settings.market ?? '?'} / ${settings.submarket ?? '?'})` : 'No market symbol in the XML.',
    });
    if (!hasMarket) errors.push('The template has no market symbol.');

    const expectedTradeType = template.tradeType ?? 'overunder';
    const tradeTypeOk = settings.tradeTypeCategory === 'digits' && settings.tradeType === expectedTradeType;
    checks.push({
        id: 'trade-type',
        label: 'Digit trade type',
        passed: tradeTypeOk,
        detail: `${settings.tradeTypeCategory ?? '—'} / ${settings.tradeType ?? '—'} (expected ${expectedTradeType})`,
    });
    if (!tradeTypeOk) errors.push(`Expected the ${expectedTradeType} digit trade type but the XML says ${settings.tradeType ?? 'nothing'}.`);

    const contractOk = settings.contractType === template.contractType;
    checks.push({
        id: 'contract-type',
        label: 'Contract type',
        passed: contractOk,
        detail: `${settings.contractType ?? '—'} (expected ${template.contractType})`,
    });
    if (!contractOk) errors.push(`Expected contract type ${template.contractType} but the XML says ${settings.contractType ?? 'nothing'}.`);

    // Over/Under carries a barrier digit; Even/Odd carries none, so an absent
    // prediction is the correct reading for a parity template.
    const expectsPrediction = template.prediction !== null;
    const predictionOk = expectsPrediction
        ? settings.prediction !== null && Number(settings.prediction) === template.prediction
        : settings.prediction === null;
    checks.push({
        id: 'prediction',
        label: expectsPrediction ? 'Prediction / barrier' : 'Prediction / barrier (none for Even/Odd)',
        passed: predictionOk,
        detail: expectsPrediction
            ? `${settings.prediction ?? '—'} (expected ${template.prediction})`
            : `${settings.prediction ?? 'none'} (expected none)`,
    });
    if (!predictionOk) {
        errors.push(
            expectsPrediction
                ? `Expected prediction ${template.prediction} but the XML says ${settings.prediction ?? 'nothing'}.`
                : `An Even/Odd template must not carry a prediction, but the XML says ${settings.prediction ?? 'nothing'}.`
        );
    }

    const durationOk = settings.durationType === 't' && Number(settings.duration) === template.durationTicks;
    checks.push({
        id: 'duration',
        label: 'Duration',
        passed: durationOk,
        detail: `${settings.duration ?? '—'} ${settings.durationType === 't' ? 'tick(s)' : (settings.durationType ?? '')}`,
    });
    if (!durationOk) errors.push(`Expected a duration of ${template.durationTicks} tick(s).`);

    const stakeOk = settings.stake !== null && Number(settings.stake) === template.stake;
    checks.push({
        id: 'stake',
        label: 'Initial stake',
        passed: stakeOk,
        detail: `${settings.stake ?? '—'} (expected ${template.stake})`,
    });
    if (!stakeOk) errors.push(`Expected an initial stake of ${template.stake} but the XML says ${settings.stake ?? 'nothing'}.`);

    // `Bot.start()` runs before `before_purchase` on every trade loop, so a stake
    // kept in a variable has to be set by the trade definition's run-once block.
    // A stake initialised inside `before_purchase` is still unset when the first
    // proposal is requested and Deriv rejects it with "Invalid input provided".
    const tradeOptions = blocksOfType(doc, 'trade_definition_tradeoptions')[0] ?? null;
    const runOnce = Array.from(blocksOfType(doc, 'trade_definition')[0]?.children ?? []).find(
        child => child.tagName === 'statement' && child.getAttribute('name') === 'INITIALIZATION'
    );
    const optionVariables = Array.from(
        tradeOptions?.querySelectorAll('value block[type="variables_get"] field[name="VAR"]') ?? []
    )
        .map(field => field.getAttribute('id'))
        .filter((id): id is string => !!id);
    const startedVariables = new Set(
        Array.from(runOnce?.querySelectorAll('block[type="variables_set"] field[name="VAR"]') ?? [])
            .map(field => field.getAttribute('id'))
            .filter((id): id is string => !!id)
    );
    const unsetVariables = optionVariables.filter(id => !startedVariables.has(id));
    const startOk = unsetVariables.length === 0;
    checks.push({
        id: 'stake-at-start',
        label: 'Stake set before the first trade',
        passed: startOk,
        detail: startOk
            ? optionVariables.length
                ? `${optionVariables.length} stake value(s) initialised in the run-once block.`
                : 'The trade options use fixed values.'
            : `${unsetVariables.join(', ')} is only set after the first trade is requested.`,
    });
    if (!startOk) {
        errors.push(
            `The stake value ${unsetVariables.join(', ')} must be initialised in the trade definition's "Run once at start" block — it is still unset when the first trade is requested.`
        );
    }

    const entry = findEntryCondition(doc);
    const expectsParity = !!template.entryParity;
    const expectsMatch = template.strategy === 'matches' || template.strategy === 'differs';

    const entryMatchesTemplate = (condition: EntryCondition): boolean => {
        if (expectsMatch) {
            return condition.matchMode === template.strategy && Number(condition.matchDigit) === template.prediction;
        }
        if (expectsParity) return condition.parity === template.entryParity;
        return condition.operator === template.entryOperator && Number(condition.trigger) === template.triggerDigit;
    };

    const entryOk =
        !!entry && entry.hasPurchase && entry.purchaseContract === template.contractType && entryMatchesTemplate(entry);

    checks.push({
        id: 'entry-condition',
        label: 'Entry condition',
        passed: entryOk,
        detail: entry
            ? `${
                  entry.parity
                      ? `Last digit ${entry.parity}`
                      : entry.matchMode
                        ? `Last digit ${entry.matchMode} ${entry.matchDigit}`
                        : `Last digit ${entry.operator} ${entry.trigger}`
              } → purchase ${entry.purchaseContract ?? '—'}`
            : 'No digit entry condition found around the purchase block.',
    });
    if (!entryOk) {
        errors.push(
            expectsMatch
                ? `Entry condition mismatch: expected "last digit ${template.strategy} ${template.prediction} → purchase ${template.contractType}".`
                : expectsParity
                  ? `Entry condition mismatch: expected "last digit ${template.entryParity} → purchase ${template.contractType}".`
                  : `Entry condition mismatch: expected "last digit ${template.entryOperator} ${template.triggerDigit} → purchase ${template.contractType}".`
        );
    }

    const afterPurchase = blocksOfType(doc, 'after_purchase')[0] ?? null;
    const hasTradeAgain = !!afterPurchase?.querySelector('block[type="trade_again"]');
    const hasProfitRead = !!afterPurchase?.querySelector('block[type="read_details"] field[name="DETAIL_INDEX"]');
    const hasWinCheck = !!afterPurchase?.querySelector('block[type="contract_check_result"]');
    const multiplier = findMultiplier(afterPurchase);
    const multiplierOk = !!multiplier && Number(multiplier.multiplier) === template.multiplier;
    const takeProfitOk = Number(settings.takeProfit) === template.takeProfit;
    const stopLossOk = Number(settings.stopLoss) === Math.abs(template.stopLoss) * -1;
    const afterPurchaseOk =
        hasTradeAgain && hasProfitRead && hasWinCheck && multiplierOk && takeProfitOk && stopLossOk;
    checks.push({
        id: 'after-purchase',
        label: 'After-purchase rules',
        passed: afterPurchaseOk,
        detail: `trade again ${hasTradeAgain ? '✓' : '✗'} · result check ${hasWinCheck ? '✓' : '✗'} · stake × ${multiplier?.multiplier ?? '—'} · take profit ${settings.takeProfit ?? '—'} · stop loss ${settings.stopLoss ?? '—'}`,
    });
    if (!afterPurchaseOk) {
        errors.push(
            `After-purchase rules mismatch: expected stake × ${template.multiplier}, take profit ${template.takeProfit}, stop loss −${template.stopLoss} and a "trade again" step.`
        );
    }

    const declared = declaredVariables(doc);
    const missingVariables = Array.from(usedVariableIds(doc)).filter(id => !declared.ids.has(id));
    const variablesOk = missingVariables.length === 0;
    checks.push({
        id: 'variables',
        label: 'Variable references resolve',
        passed: variablesOk,
        detail: variablesOk
            ? `${declared.names.length} declared variable(s), all references resolve.`
            : `${missingVariables.length} reference(s) point at variables the file does not declare.`,
    });
    if (!variablesOk) {
        errors.push(`Undeclared variable reference(s): ${missingVariables.join(', ')}.`);
    }

    if (!declared.names.some(name => name.startsWith('freebot:'))) {
        warnings.push('The template does not use the freebot: variable namespace.');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        checks,
        blockCount: blockElements.length - replacedShadows,
        blockTypes,
        unsupportedTypes,
        variables: declared.names,
        missingVariables,
        settings,
    };
}

/** The market currently written into an XML string. */
export function readMarketFromXml(xml: string): { symbol: string | null; market: string | null; submarket: string | null } | null {
    const parsed = parseBotXml(xml);
    if (!parsed.doc) return null;
    const market = blocksOfType(parsed.doc, 'trade_definition_market')[0];
    return {
        symbol: fieldValue(market, 'SYMBOL_LIST'),
        market: fieldValue(market, 'MARKET_LIST'),
        submarket: fieldValue(market, 'SUBMARKET_LIST'),
    };
}

/**
 * Returns a copy of the template XML pointed at the chosen market. Only the
 * three market fields change — entry logic, contract, duration, stake,
 * variables and after-purchase rules are byte-identical to the template.
 */
export function applyMarketToXml(
    xml: string,
    target: MarketTarget
): { xml: string; changed: string[]; error: string | null } {
    const symbol = typeof target.symbol === 'string' ? target.symbol.trim() : '';
    if (!symbol) return { xml, changed: [], error: 'No market symbol was supplied.' };

    const parsed = parseBotXml(xml);
    if (!parsed.doc) return { xml, changed: [], error: parsed.error ?? 'The XML could not be parsed.' };

    const market = blocksOfType(parsed.doc, 'trade_definition_market')[0];
    if (!market) return { xml, changed: [], error: 'The template has no market block to re-target.' };

    const changed: string[] = [];
    const setField = (name: string, value: string | null | undefined) => {
        if (!value) return;
        const field = market.querySelector(`field[name="${name}"]`);
        if (!field) return;
        if (field.textContent?.trim() === value) return;
        field.textContent = value;
        changed.push(name);
    };

    setField('SYMBOL_LIST', symbol);
    setField('MARKET_LIST', target.market);
    setField('SUBMARKET_LIST', target.submarket);

    return { xml: new XMLSerializer().serializeToString(parsed.doc), changed, error: null };
}
