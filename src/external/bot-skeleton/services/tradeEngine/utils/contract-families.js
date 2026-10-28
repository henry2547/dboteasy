/**
 * Contract families behind one bot.
 *
 * A trade definition names one digit contract family — Over/Under, Even/Odd or Matches/Differs —
 * and every buy used to be built from that single definition. The parity-recovery strategy needs
 * the opposite: an Over 1 / Under 8 leg first, then an Even/Odd leg after a loss. Deriv places a
 * buy from the `contract_type` and barrier carried by the request itself, so one session can trade
 * two families as long as the engine (a) sends a barrier only to the families that read one, and
 * (b) never sends the definition's own barrier along with an Even/Odd buy.
 *
 * Everything here is a pure function of a contract type / trade definition, so the switch is
 * measurable without a WebSocket or a login.
 */

export const OVER_UNDER = 'over_under';
export const EVEN_ODD = 'even_odd';
export const MATCHES_DIFFERS = 'matches_differs';

/** The contract types of each digit family, in the order the trade definition offers them. */
export const FAMILY_CONTRACT_TYPES = {
    [OVER_UNDER]: ['DIGITOVER', 'DIGITUNDER'],
    [EVEN_ODD]: ['DIGITEVEN', 'DIGITODD'],
    [MATCHES_DIFFERS]: ['DIGITMATCH', 'DIGITDIFF'],
};

/** The trade types (the trade definition's own value) that name a digit family. */
export const DIGIT_TRADE_TYPES = ['overunder', 'evenodd', 'matchesdiffers'];

const FAMILY_LABELS = {
    [OVER_UNDER]: 'Over/Under',
    [EVEN_ODD]: 'Even/Odd',
    [MATCHES_DIFFERS]: 'Matches/Differs',
};

export const normalizeContractType = value => String(value ?? '').trim().toUpperCase();

/** The family a contract type belongs to, or `null` for anything that is not a digit contract. */
export const familyOfContractType = contract_type => {
    const type = normalizeContractType(contract_type);
    return Object.keys(FAMILY_CONTRACT_TYPES).find(family => FAMILY_CONTRACT_TYPES[family].includes(type)) ?? null;
};

/** Over/Under and Matches/Differs read a 0–9 barrier digit; Even/Odd takes none. */
export const familyNeedsBarrier = family => family === OVER_UNDER || family === MATCHES_DIFFERS;

/** Unknown types keep the engine's previous behaviour: they may carry a barrier. */
export const contractNeedsBarrier = contract_type => {
    const family = familyOfContractType(contract_type);
    return family === null ? true : familyNeedsBarrier(family);
};

export const describeContractFamily = family => FAMILY_LABELS[family] ?? family ?? 'unknown';

/** The digit families a list of contract types names, each once. */
export const familiesOfContractTypes = contract_types =>
    [...new Set((Array.isArray(contract_types) ? contract_types : []).map(familyOfContractType).filter(Boolean))];

/** The barrier a digit buy needs: a whole digit 0–9, or `null` when the value is unusable. */
export const resolveBarrier = value => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const digit = Number(value);
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
};

/**
 * The trade options one buy really uses.
 *
 * The definition's own barrier only travels with a family that reads one; an Even/Odd buy drops it
 * instead of sending a `barrier` Deriv rejects. A family that needs a barrier and has neither an
 * explicit one nor one in the trade options is refused rather than quoted.
 */
export const contractTradeOptions = (trade_options = {}, contract_type, { barrier } = {}) => {
    const family = familyOfContractType(contract_type);

    if (!family) {
        return {
            ok: false,
            family: null,
            tradeOptions: trade_options,
            error: `${contract_type} is not a digit contract type`,
        };
    }

    if (!familyNeedsBarrier(family)) {
        return { ok: true, family, tradeOptions: { ...trade_options, prediction: undefined }, error: '' };
    }

    const wanted = barrier === undefined || barrier === null || barrier === '' ? trade_options.prediction : barrier;
    const digit = resolveBarrier(wanted);

    if (digit === null) {
        return {
            ok: false,
            family,
            tradeOptions: trade_options,
            error: `${contract_type} needs a barrier digit from 0 to 9; "${wanted}" is not one`,
        };
    }

    return { ok: true, family, tradeOptions: { ...trade_options, prediction: digit }, error: '' };
};

/**
 * Whether the bot's trade definition permits the requested contract.
 *
 * `both` lists the two contracts of one family and is what lets a second digit family in: the block
 * asks for a specific contract type and the engine builds that request. A definition pinned to one
 * contract keeps refusing every other contract, exactly as before.
 */
export const canTradeContract = (definition = {}, contract_type) => {
    const family = familyOfContractType(contract_type);

    if (!family) {
        return { ok: false, family: null, reason: `${contract_type} is not a digit contract type` };
    }

    const trade_type = String(definition.trade_type ?? '').toLowerCase();
    if (trade_type && !DIGIT_TRADE_TYPES.includes(trade_type)) {
        return {
            ok: false,
            family,
            reason: `the trade definition trades ${definition.trade_type}, not a digit contract`,
        };
    }

    const declared = normalizeContractType(definition.contract_type);
    if (declared && declared !== 'BOTH' && declared !== normalizeContractType(contract_type)) {
        return {
            ok: false,
            family,
            reason: `the trade definition is set to ${definition.contract_type}, so it cannot buy ${contract_type}`,
        };
    }

    return { ok: true, family, reason: '' };
};

/** The trade definition currently on the canvas, or empty values when there is no workspace. */
export const readWorkspaceTradeDefinition = () => {
    try {
        const definition = globalThis?.window?.Blockly?.derivWorkspace?.getTradeDefinitionBlock?.();
        return {
            trade_type:
                definition?.getChildByType?.('trade_definition_tradetype')?.getFieldValue?.('TRADETYPE_LIST') ?? null,
            contract_type:
                definition?.getChildByType?.('trade_definition_contracttype')?.getFieldValue?.('TYPE_LIST') ?? null,
        };
    } catch (error) {
        return { trade_type: null, contract_type: null };
    }
};
