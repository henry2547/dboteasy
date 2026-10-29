import filesaver from 'file-saver';
import { getContractTypeOptions as getContractTypeOptionsFromCommon } from '../../../components/shared/utils/common-data';
import { config } from '../constants/config';

export const saveAs = ({ data, filename, type }) => {
    const blob = new Blob([data], { type });
    filesaver.saveAs(blob, filename);
};

export const getContractTypeOptions = (contract_type, trade_type) => {
    // First try to get from config
    if (trade_type && trade_type !== 'na' && trade_type !== '') {
        const trade_types = config().opposites[trade_type.toUpperCase()];

        if (trade_types) {
            const contract_options = trade_types.map(type => Object.entries(type)[0].reverse());

            // When user selected a specific contract, only return the contract type they selected.
            if (contract_type !== 'both') {
                const filtered_options = contract_options.filter(option => option[1] === contract_type);
                return filtered_options;
            }
            return contract_options;
        }
    }

    // Fallback to common data
    return getContractTypeOptionsFromCommon(contract_type, trade_type);
};

/** Whether the trade type belongs to the Digits category, where every contract settles on a digit. */
export const isDigitTradeType = trade_type =>
    config().DIGIT_TRADE_TYPES.includes(String(trade_type ?? '').toLowerCase());

/**
 * Every digit contract type a Digits bot may buy, the configured trade type's own pair first.
 *
 * The three digit trade types (Matches/Differs, Even/Odd, Over/Under) are one Digits category on
 * the market, so a bot may buy any of their contracts in the same session — a bot that trades
 * Over 1 or Under 8 and then switches to Even/Odd after a loss needs all six.
 */
export const getDigitContractTypeOptions = trade_type => {
    const configured = isDigitTradeType(trade_type) ? getContractTypeOptions('both', trade_type) : [];
    const every_digit_contract = config().DIGIT_TRADE_TYPES.flatMap(type => getContractTypeOptions('both', type));

    return [...configured, ...every_digit_contract].reduce((options, option) => {
        if (!options.some(existing => existing[1] === option[1])) options.push(option);
        return options;
    }, []);
};

/** The purchase block's choices: a Digits bot may pick any digit contract, other bots only their pair. */
export const getPurchaseContractTypeOptions = (contract_type, trade_type) =>
    isDigitTradeType(trade_type)
        ? getDigitContractTypeOptions(trade_type)
        : getContractTypeOptions(contract_type, trade_type);

/**
 * The contract types a session subscribes proposals for: the trade type's own pair, plus — for a
 * Digits bot — every digit contract its Purchase blocks can pick.
 */
export const digitContractTypesForTrade = (configured_contract_types, trade_type, workspace) =>
    isDigitTradeType(trade_type)
        ? Array.from(new Set([...configured_contract_types, ...digitPurchaseTypes(workspace)]))
        : configured_contract_types;

/** The digit contract types the canvas's Purchase blocks can buy, so each gets a proposal. */
export const digitPurchaseTypes = workspace => {
    const every_digit_contract = config().DIGIT_TRADE_TYPES.flatMap(type => getContractTypeOptions('both', type));
    const blocks = workspace?.getAllBlocks?.(false) ?? [];

    return blocks
        .filter(block => block.type === 'purchase')
        .map(block => block.getFieldValue('PURCHASE_LIST'))
        .filter(value => every_digit_contract.some(option => option[1] === value));
};
