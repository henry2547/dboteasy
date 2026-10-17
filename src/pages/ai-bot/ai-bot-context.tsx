import { createContext, useContext, type ReactNode } from 'react';
import { useAiBot, type UseAiBot } from './use-ai-bot';

const AiBotContext = createContext<UseAiBot | null>(null);

export function AiBotProvider({ children }: { children: ReactNode }) {
    const bot = useAiBot();
    return <AiBotContext.Provider value={bot}>{children}</AiBotContext.Provider>;
}

export function useAiBotContext(): UseAiBot {
    const value = useContext(AiBotContext);
    if (!value) throw new Error('useAiBotContext must be used inside an AiBotProvider.');
    return value;
}
