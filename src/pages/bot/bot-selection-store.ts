/**
 * The block selection made on the Bot tab.
 *
 * The Bot tab is a menu-driven way of saying which blocks the bot is made of: the user picks a
 * block from a menu and sets its options here. The selection is kept in localStorage so the menus
 * are still filled in when the tab is reopened, and `markSelectionPending` hands it to the Bot
 * Builder, whose canvas reads it once on load — that is what makes "open the Bot Builder tab with
 * the blocks the user selected" work.
 */
export type TBotSelectionEntry = {
    type: string;
    values: Record<string, string>;
};

export type TBotSelection = TBotSelectionEntry[];

const STORAGE_KEY = 'bot_tab_blocks';
const PENDING_KEY = 'bot_tab_blocks_pending';

/** The selection the user configured last time, so the menus come back filled in. */
export const readSavedSelection = (): TBotSelection => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (!Array.isArray(saved)) return [];
        return saved.filter(entry => entry && typeof entry.type === 'string' && entry.type);
    } catch {
        return [];
    }
};

export const saveSelection = (selection: TBotSelection): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
        /* an unavailable localStorage must not break the tab */
    }
};

/**
 * Hand the selection to the Bot Builder: its canvas reads the saved selection once, when it loads,
 * and clears the marker. The marker is stored (not held in memory) so it survives the canvas being
 * built in another chunk, and a reload.
 */
export const markSelectionPending = (selection: TBotSelection): void => {
    saveSelection(selection);
    try {
        localStorage.setItem(PENDING_KEY, '1');
    } catch {
        /* an unavailable localStorage must not break the hand-off */
    }
};

export const hasPendingSelection = (): boolean => {
    try {
        return localStorage.getItem(PENDING_KEY) === '1';
    } catch {
        return false;
    }
};

export const clearPendingSelection = (): void => {
    try {
        localStorage.removeItem(PENDING_KEY);
    } catch {
        /* an unavailable localStorage must not break the hand-off */
    }
};
