/**
 * Watches the Free Bots library's live digits and journals a "confirmation needed" line the moment
 * each bot's entry conditions are met.
 *
 * The notice is written through the run panel's own journal store, with `journal__text--confirmation`
 * as its colour class, so it sits in the Journal tab next to the bot's own messages. It never loads,
 * buys or starts anything: starting the bot is still the user's own confirmation.
 *
 * A bot is announced at most once per `CONFIRMATION_COOLDOWN_MS`, and only again after its conditions
 * cleared — a condition that flickers on every tick must not flood the journal.
 */

import { useEffect, useRef } from 'react';
import { MessageTypes } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { collectConfirmationNotices } from './confirmation-notices';
import type { FreeBotId } from './templates';

/** Journal colour class for a confirmation notice (see `components/journal/journal.scss`). */
export const CONFIRMATION_JOURNAL_CLASS = 'journal__text--confirmation';

/** Shortest time between two notices for the same bot. */
export const CONFIRMATION_COOLDOWN_MS = 60_000;

export function useConfirmationJournal(digits: number[], marketName: string | null, isConnected: boolean): void {
    const { journal } = useStore();
    /** When each bot was last announced. */
    const announcedAt = useRef(new Map<FreeBotId, number>());

    useEffect(() => {
        if (!isConnected || !marketName) {
            announcedAt.current.clear();
            return;
        }

        const now = Date.now();
        const notices = collectConfirmationNotices(digits, marketName);
        const stillMet = new Set<FreeBotId>(notices.map(notice => notice.templateId));

        // Re-arm a bot once its conditions have cleared and its cooldown has passed, so the next hit
        // is announced again without letting a flickering condition repeat every tick.
        announcedAt.current.forEach((at, templateId) => {
            if (!stillMet.has(templateId) && now - at >= CONFIRMATION_COOLDOWN_MS) {
                announcedAt.current.delete(templateId);
            }
        });

        notices.forEach(notice => {
            const at = announcedAt.current.get(notice.templateId);
            if (at !== undefined && now - at < CONFIRMATION_COOLDOWN_MS) return;
            announcedAt.current.set(notice.templateId, now);
            journal.pushMessage(notice.message, MessageTypes.NOTIFY, CONFIRMATION_JOURNAL_CLASS);
        });
    }, [digits, isConnected, journal, marketName]);
}
