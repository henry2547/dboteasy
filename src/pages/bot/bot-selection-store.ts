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

type TSelectionPendingListener = () => void;

const pending_listeners = new Set<TSelectionPendingListener>();

/** Told the moment a selection is handed over, so the canvas can pick it up without a reload. */
export const onSelectionPending = (listener: TSelectionPendingListener): (() => void) => {
    pending_listeners.add(listener);
    return () => {
        pending_listeners.delete(listener);
    };
};

/**
 * Hand the selection to the Bot Builder: its canvas reads the saved selection and clears the marker.
 * The marker is stored (not held in memory) so it survives the canvas being built in another chunk,
 * and a reload. The Bot Builder itself stays mounted for the app's whole life, so it is told at once
 * rather than discovering the marker when it next mounts.
 */
export const markSelectionPending = (selection: TBotSelection): void => {
    saveSelection(selection);
    try {
        localStorage.setItem(PENDING_KEY, '1');
    } catch {
        /* an unavailable localStorage must not break the hand-off */
    }
    pending_listeners.forEach(listener => listener());
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
