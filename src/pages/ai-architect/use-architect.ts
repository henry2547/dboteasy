/**
 * State for the AI Bot Architect page.
 *
 * Generation is run in a timer-separated step so the UI can show "Generating" and honour Cancel:
 * the planner is synchronous, but a cancelled run is discarded by token before it can touch state,
 * and nothing in this hook ever writes to the Bot Builder workspace. Loading is a separate,
 * explicit action (see `use-architect-loader.ts`).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { botLibrary } from './library';
import { assemble, generateBot, refineBot, type GeneratedBot } from './pipeline';
import { buildRegistry, type Registry } from './registry';
import type { AppliedDefault, Clarification, SavedBot } from './types';
import type { SpecChange } from './refiner';

export interface ChangeLog {
    instruction: string;
    changes: SpecChange[];
    unsupported: string[];
    unrecognised: string[];
}

export interface ArchitectState {
    status: 'idle' | 'generating' | 'ready' | 'needs_input' | 'failed' | 'cancelled';
    prompt: string;
    bot: GeneratedBot | null;
    message: string | null;
    defaults: AppliedDefault[];
    clarifications: Clarification[];
    unsupported: string[];
    reasoning: string[];
    changeLog: ChangeLog[];
    libraryId: string | null;
}

const INITIAL: ArchitectState = {
    status: 'idle',
    prompt: '',
    bot: null,
    message: null,
    defaults: [],
    clarifications: [],
    unsupported: [],
    reasoning: [],
    changeLog: [],
    libraryId: null,
};

/** A short pause so "Generating" is visible and Cancel is meaningful; the work itself is instant. */
const GENERATION_DELAY_MS = 350;

export function useArchitect() {
    const [state, setState] = useState<ArchitectState>(INITIAL);
    const [library, setLibrary] = useState<SavedBot[]>(() => botLibrary.list());
    const token = useRef(0);

    // Rebuilt on every generation so it reflects what Blockly has registered at that moment.
    const registryRef = useRef<Registry | null>(null);
    const getRegistry = useCallback((): Registry => {
        registryRef.current = buildRegistry();
        return registryRef.current;
    }, []);

    const refreshLibrary = useCallback(() => setLibrary(botLibrary.list()), []);

    const generate = useCallback(
        (prompt: string) => {
            const mine = ++token.current;
            setState(previous => ({ ...previous, status: 'generating', prompt, message: null, clarifications: [] }));
            window.setTimeout(() => {
                if (token.current !== mine) return; // cancelled or superseded
                try {
                    const result = generateBot(prompt, { registry: getRegistry() });
                    setState(previous => {
                        // Keep the previous bot visible if this run could not produce a new one.
                        if (token.current !== mine) return previous;
                        const next: ArchitectState = { ...previous };
                        if (result.clarifications.length) {
                            return { ...next, status: 'needs_input', prompt, message: result.message ?? null, clarifications: result.clarifications, defaults: result.defaults, unsupported: result.unsupported, reasoning: result.reasoning };
                        }
                        return {
                            ...next,
                            status: result.ok ? 'ready' : 'failed',
                            prompt,
                            bot: result.bot ?? (result.ok ? null : previous.bot),
                            message: result.ok ? null : (result.message ?? 'The bot could not be generated.'),
                            defaults: result.defaults,
                            clarifications: [],
                            unsupported: result.unsupported,
                            reasoning: result.reasoning,
                            changeLog: [],
                            libraryId: null,
                        };
                    });
                } catch (error) {
                    // The user's prompt is kept so they can retry.
                    setState(previous => ({ ...previous, status: 'failed', prompt, message: `Generation failed: ${(error as Error).message}. Your prompt was kept; try again.` }));
                }
            }, GENERATION_DELAY_MS);
        },
        [getRegistry]
    );

    const cancel = useCallback(() => {
        token.current += 1;
        setState(previous => ({ ...previous, status: previous.bot ? 'ready' : 'cancelled', message: 'Generation cancelled. Nothing was changed.' }));
    }, []);

    const refine = useCallback(
        (instruction: string) => {
            setState(previous => {
                if (!previous.bot) return { ...previous, status: 'failed', message: 'Generate a bot first, then refine it.' };
                try {
                    const outcome = refineBot(previous.bot.spec, instruction, getRegistry());
                    const entry: ChangeLog = { instruction, changes: outcome.refine.changes, unsupported: outcome.refine.unsupported, unrecognised: outcome.refine.unrecognised };
                    const result = outcome.result;
                    if (!outcome.refine.changes.length) {
                        // Nothing changed: keep the bot exactly as it was and say why.
                        return { ...previous, status: 'ready', message: null, changeLog: [entry, ...previous.changeLog] };
                    }
                    if (result.ok === false && !result.bot) {
                        return { ...previous, status: 'failed', message: result.message, changeLog: [entry, ...previous.changeLog] };
                    }
                    return {
                        ...previous,
                        status: result.ok ? 'ready' : 'failed',
                        bot: result.bot ?? previous.bot,
                        message: result.ok ? null : (result as { message: string }).message,
                        changeLog: [entry, ...previous.changeLog],
                    };
                } catch (error) {
                    return { ...previous, status: 'failed', message: `Refinement failed: ${(error as Error).message}. The bot was not changed.` };
                }
            });
        },
        [getRegistry]
    );

    const answer = useCallback(
        (answerText: string) => {
            // A clarification answer is appended to the prompt and the whole request is planned again.
            const combined = `${state.prompt.trim()} ${answerText}`.trim();
            generate(combined);
        },
        [generate, state.prompt]
    );

    const save = useCallback(
        (name?: string): { ok: boolean; error?: string } => {
            if (!state.bot) return { ok: false, error: 'There is no bot to save yet.' };
            const result = botLibrary.save({
                id: state.libraryId ?? undefined,
                name: name?.trim() || state.bot.spec.name,
                prompt: state.prompt,
                spec: state.bot.spec,
                xml: state.bot.xml,
                validation: state.bot.validation,
                blockTypes: state.bot.validation.blockTypes,
            });
            if (result.ok && result.bot) {
                setState(previous => ({ ...previous, libraryId: result.bot!.id }));
                refreshLibrary();
            }
            return { ok: result.ok, error: result.error };
        },
        [state.bot, state.libraryId, state.prompt, refreshLibrary]
    );

    /** Opens a saved bot for review, re-running validation against what is registered now. */
    const open = useCallback(
        (saved: SavedBot) => {
            const outcome = assemble(saved.spec, getRegistry());
            setState({
                ...INITIAL,
                status: outcome.ok ? 'ready' : 'failed',
                prompt: saved.prompt,
                bot: outcome.bot ?? null,
                message: outcome.ok === false ? outcome.message : null,
                libraryId: saved.id,
            });
        },
        [getRegistry]
    );

    const setPrompt = useCallback((prompt: string) => setState(previous => ({ ...previous, prompt })), []);
    const clear = useCallback(() => {
        token.current += 1;
        setState(INITIAL);
    }, []);

    return useMemo(
        () => ({ state, library, generate, cancel, refine, answer, save, open, setPrompt, clear, refreshLibrary, getRegistry }),
        [state, library, generate, cancel, refine, answer, save, open, setPrompt, clear, refreshLibrary, getRegistry]
    );
}
