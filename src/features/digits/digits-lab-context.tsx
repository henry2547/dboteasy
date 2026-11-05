/**
 * Shares one Digits-lab feed (and one selected market) between the Digits tab
 * and the Statistics tab, so switching tabs never starts a second WebSocket or
 * loses the market the user picked.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useDigitsLab } from './use-digits-lab';

type DigitsLabValue = ReturnType<typeof useDigitsLab>;

const DigitsLabContext = createContext<DigitsLabValue | null>(null);

export function DigitsLabProvider({ children }: { children: ReactNode }) {
    const lab = useDigitsLab();
    return <DigitsLabContext.Provider value={lab}>{children}</DigitsLabContext.Provider>;
}

export function useDigitsLabContext(): DigitsLabValue {
    const value = useContext(DigitsLabContext);
    if (!value) {
        throw new Error('useDigitsLabContext must be used inside a DigitsLabProvider.');
    }
    return value;
}
