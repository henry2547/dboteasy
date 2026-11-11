/**
 * React binding for the AI Bots run.
 *
 * The run itself is the module store in `ai-bot-session.ts` (it must survive a
 * tab switch), and the purchases are tracked in `ai-bot-runner.ts`. This hook
 * only subscribes to both and hands the runner the stores it reports into.
 */

import { useEffect, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { attachAiBotRunner, getAiBotRun, subscribeAiBotRun, type AiBotRun } from './ai-bot-runner';
import {
    closeAiBot,
    getAiBotSessionView,
    openAiBot,
    startAiBot,
    stopAiBot,
    subscribeAiBotSessionView,
    updateAiBotSettings,
} from './ai-bot-session';

export function useAiBotSession() {
    const { journal, summary_card, transactions } = useStore();
    const [view, setView] = useState(getAiBotSessionView);
    const [run, setRun] = useState<AiBotRun>(getAiBotRun);

    useEffect(() => {
        setView(getAiBotSessionView());
        setRun(getAiBotRun());
        const offView = subscribeAiBotSessionView(() => setView(getAiBotSessionView()));
        const offRun = subscribeAiBotRun(() => setRun(getAiBotRun()));

        // The stores are app singletons, so the runner keeps them for the app's
        // lifetime: a contract that settles after this tab closes still reaches
        // the Bot Builder's Summary, Transactions and Journal.
        attachAiBotRunner({ journal, summary_card, transactions }, stopAiBot);

        return () => {
            offView();
            offRun();
        };
    }, [journal, summary_card, transactions]);

    return {
        ...view,
        run,
        openBot: openAiBot,
        closeBot: closeAiBot,
        start: startAiBot,
        stop: stopAiBot,
        updateSettings: updateAiBotSettings,
    };
}
