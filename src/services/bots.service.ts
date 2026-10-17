import localForage from 'localforage';
import LZString from 'lz-string';
import { localize } from '@deriv-com/translations';
import { MAX_STRATEGIES } from '../constants/bot-contents';
import { TBot, TBotConfig, TStrategy } from '../types';

/**
 * Saved bots and the bot builder share one store: a bot IS a saved workspace,
 * so both sides must keep reading and writing the same key.
 */
export const BOTS_STORAGE_KEY = 'saved_workspaces';

export const emptyBotConfig: TBotConfig = {
    symbol: '',
    trade_type: '',
    contract_type: '',
    stake: '',
    duration: '',
    currency: '',
};

const readField = (doc: Document, block_type: string, field_name: string) =>
    (doc.querySelector(`block[type="${block_type}"] > field[name="${field_name}"]`)?.textContent ?? '').trim();

const readValueNumber = (doc: Document, block_type: string, value_name: string) =>
    (doc.querySelector(`block[type="${block_type}"] > value[name="${value_name}"] field[name="NUM"]`)?.textContent ?? '')
        .trim();

/**
 * Reads the trade setup out of a bot's XML. Anything the workspace does not
 * define stays blank, so a half-built bot still lists cleanly.
 */
export const parseBotConfig = (xml = ''): TBotConfig => {
    if (!xml) return { ...emptyBotConfig };

    try {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return { ...emptyBotConfig };

        return {
            symbol: readField(doc, 'trade_definition_market', 'SYMBOL_LIST'),
            trade_type: readField(doc, 'trade_definition_tradetype', 'TRADETYPE_LIST'),
            contract_type: readField(doc, 'trade_definition_contracttype', 'TYPE_LIST'),
            stake: readValueNumber(doc, 'trade_definition_tradeoptions', 'AMOUNT'),
            duration: readValueNumber(doc, 'trade_definition_tradeoptions', 'DURATION'),
            currency: readField(doc, 'trade_definition_tradeoptions', 'CURRENCY_LIST'),
        };
    } catch (error) {
        console.error('Unable to read the bot configuration', error);
        return { ...emptyBotConfig };
    }
};

const humanize = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

/** One-line description of a setup, e.g. "R_100 · Rise Fall · 1 USD". */
export const formatBotConfig = (config: TBotConfig) =>
    [config.symbol, humanize(config.trade_type), [config.stake, config.currency].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · ');

/** Fills a stored workspace up to a full bot record. `running_id` is the bot trading right now. */
export const normalizeBot = (workspace: Partial<TStrategy & { config?: TBotConfig }> = {}, running_id = ''): TBot => ({
    id: workspace.id ?? '',
    name: workspace.name || localize('Untitled bot'),
    save_type: workspace.save_type ?? '',
    timestamp: workspace.timestamp ?? 0,
    xml: workspace.xml ?? '',
    status: workspace.id && workspace.id === running_id ? 'running' : 'stopped',
    config: { ...emptyBotConfig, ...(workspace.config ?? parseBotConfig(workspace.xml)) },
});

const readStoredWorkspaces = async (): Promise<Array<TStrategy & { config?: TBotConfig }>> => {
    try {
        const stored = await localForage.getItem<string>(BOTS_STORAGE_KEY);
        const workspaces = stored ? JSON.parse(LZString.decompress(stored) as string) : null;
        return Array.isArray(workspaces) ? workspaces : [];
    } catch (error) {
        console.error('Unable to read the saved bots', error);
        return [];
    }
};

const writeStoredWorkspaces = async (workspaces: Array<TStrategy & { config?: TBotConfig }>) => {
    const trimmed = workspaces
        .slice()
        .sort((a, b) => new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf())
        .slice(0, MAX_STRATEGIES);

    await localForage.setItem(BOTS_STORAGE_KEY, LZString.compress(JSON.stringify(trimmed)));
    return trimmed;
};

/** Every saved bot, newest first, with its status and configuration resolved. */
export const getBots = async (running_id = ''): Promise<TBot[]> => {
    const workspaces = await readStoredWorkspaces();
    return workspaces.map(workspace => normalizeBot(workspace, running_id));
};

/** Removes one bot and returns what is left, so callers never re-read the store. */
export const deleteBot = async (bot_id: string): Promise<TBot[]> => {
    const workspaces = await readStoredWorkspaces();
    const remaining = workspaces.filter(workspace => workspace.id !== bot_id);
    await writeStoredWorkspaces(remaining);
    return remaining.map(workspace => normalizeBot(workspace));
};
