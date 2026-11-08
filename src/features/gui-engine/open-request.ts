/**
 * "Open this in the GUI Trading Engine" hand-off.
 *
 * The Market Scanner's Load bot chooser asks where a scanned bot should open.
 * Choosing the GUI engine records a one-shot request here and switches tab; the
 * engine hook consumes it once its market list is available. A module-level
 * value (rather than a store) keeps the request alive across the tab switch,
 * whether the GUI tab mounts after the request or was already mounted.
 */

export type GuiEngineStrategy = 'over1' | 'under8';

export interface GuiEngineOpenRequest {
    symbol: string;
    displayName: string;
    strategy: GuiEngineStrategy;
    at: number;
}

type Listener = () => void;

let pending: GuiEngineOpenRequest | null = null;
const listeners = new Set<Listener>();

export function requestGuiEngine(request: Omit<GuiEngineOpenRequest, 'at'>): void {
    pending = { ...request, at: Date.now() };
    listeners.forEach(listener => listener());
}

export function peekGuiEngineRequest(): GuiEngineOpenRequest | null {
    return pending;
}

/** Removes and returns the pending request — only after the engine applied it. */
export function consumeGuiEngineRequest(): GuiEngineOpenRequest | null {
    const request = pending;
    pending = null;
    return request;
}

export function subscribeGuiEngineRequests(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
