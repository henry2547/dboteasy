/**
 * Loading a generated bot into the existing Bot Builder (Step G).
 *
 * The app's own `load()` clears the workspace before it places anything, and it clears it again on
 * some failure paths, so this hook takes a snapshot of what the user had first and puts it back if
 * anything goes wrong. The order is never short-circuited:
 *
 *   1. refuse while a bot is running, or when Blockly is not ready
 *   2. snapshot the current workspace (and tell the caller whether it held unsaved work)
 *   3. hand the XML to the app's loader
 *   4. read the live workspace back: block count and block types must match what was generated
 *   5. re-validate the loaded workspace, and restore the snapshot if any of that fails
 *
 * Loading never starts the bot. `Run` stays the user's decision.
 */

import { useCallback, useState } from 'react';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load as loadIntoWorkspace, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { allBlocks } from './builder';
import { inspectImportedXml } from './library';
import type { Registry } from './registry';
import type { GeneratedBot } from './pipeline';

type Phase = 'idle' | 'loading' | 'loaded' | 'failed';

interface LiveBlock {
    type: string;
    isShadow?: () => boolean;
}

interface LiveWorkspace {
    getAllBlocks?: (ordered?: boolean) => LiveBlock[];
}

export interface LoadResult {
    ok: boolean;
    message: string;
    /** Block types the live workspace holds after loading. */
    liveTypes: string[];
    liveBlockCount: number;
    /** True when the previous workspace was put back after a failure. */
    restored: boolean;
}

export const workspaceReady = (): boolean => !!window.Blockly?.derivWorkspace;

/** True when the Bot Builder canvas holds blocks the user may not have saved. */
export function workspaceHasWork(): boolean {
    const workspace = window.Blockly?.derivWorkspace as unknown as LiveWorkspace | undefined;
    const blocks = workspace?.getAllBlocks?.(false) ?? [];
    return blocks.filter(block => !block.isShadow?.()).length > 0;
}

function snapshotXml(): string | null {
    const workspace = window.Blockly?.derivWorkspace;
    if (!workspace) return null;
    try {
        return window.Blockly.Xml.domToText(window.Blockly.Xml.workspaceToDom(workspace));
    } catch {
        return null;
    }
}

function liveSummary(): { types: string[]; count: number } {
    const workspace = window.Blockly?.derivWorkspace as unknown as LiveWorkspace | undefined;
    const blocks = workspace?.getAllBlocks?.(true) ?? [];
    return { types: [...new Set(blocks.map(block => block.type))], count: blocks.length };
}

/** What Blockly will hold: `block` + `shadow` elements, minus a shadow a real block replaces. */
export function expectedBlockCount(xml: string): number {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    let count = 0;
    doc.querySelectorAll('block, shadow').forEach(element => {
        count += 1;
        if (element.tagName.toLowerCase() === 'shadow') {
            const parent = element.parentElement;
            const replaced = parent && [...parent.children].some(child => child !== element && child.tagName.toLowerCase() === 'block');
            if (replaced) count -= 1;
        }
    });
    return count;
}

async function restore(previous: string | null): Promise<boolean> {
    const workspace = window.Blockly?.derivWorkspace;
    if (!workspace) return false;
    try {
        if (previous && previous.includes('<block')) {
            await loadIntoWorkspace({
                block_string: previous,
                file_name: 'Restored workspace',
                workspace,
                from: save_types.UNSAVED,
                strategy_id: null,
                drop_event: null,
                showIncompatibleStrategyDialog: false,
                show_snackbar: false,
            });
        } else {
            await (workspace as unknown as { asyncClear?: () => Promise<void> }).asyncClear?.();
        }
        return true;
    } catch {
        return false;
    }
}

export function useArchitectLoader(registry: () => Registry) {
    const store = useStore();
    const [phase, setPhase] = useState<Phase>('idle');
    const [result, setResult] = useState<LoadResult | null>(null);

    const load = useCallback(
        async (bot: GeneratedBot, options: { botName: string }): Promise<LoadResult> => {
            const fail = (message: string, restored = false): LoadResult => {
                const live = liveSummary();
                const outcome: LoadResult = { ok: false, message, liveTypes: live.types, liveBlockCount: live.count, restored };
                setPhase('failed');
                setResult(outcome);
                return outcome;
            };

            if (!bot.validation.ok) return fail(`The bot did not pass validation, so it was not loaded: ${bot.validation.errors.join(' ')}`);
            if (store?.run_panel?.is_running) {
                return fail('A bot is running. Stop it before loading another one. Your workspace was not changed.');
            }
            if (!workspaceReady()) {
                return fail('The Bot Builder workspace is not ready yet. Open the Bot Builder tab once and try again. Your workspace was not changed.');
            }

            // Re-check the XML against the registry one more time, in case Blockly changed since generation.
            const inspection = inspectImportedXml(bot.xml, registry());
            if (!inspection.ok) return fail(`The generated XML was rejected before loading: ${inspection.errors.join(' ')}`);

            setPhase('loading');
            const previous = snapshotXml();
            const workspace = window.Blockly.derivWorkspace;

            try {
                const loaded = await loadIntoWorkspace({
                    block_string: bot.xml,
                    file_name: options.botName,
                    workspace,
                    from: save_types.UNSAVED,
                    strategy_id: null,
                    drop_event: null,
                    showIncompatibleStrategyDialog: false,
                    show_snackbar: true,
                });

                if (loaded && typeof loaded === 'object' && 'error' in loaded && loaded.error) {
                    const restored = await restore(previous);
                    return fail(`The Bot Builder rejected the bot: ${String(loaded.error)}${restored ? ' Your previous workspace was restored.' : ''}`, restored);
                }

                // Read the live workspace back. Parsing XML is not proof the blocks are really there.
                const live = liveSummary();
                const expectedCount = expectedBlockCount(bot.xml);
                const expectedTypes = new Set(allBlocks(bot.workspace).map(block => block.type));
                const missingTypes = [...expectedTypes].filter(type => !live.types.includes(type));

                if (live.count !== expectedCount || missingTypes.length) {
                    const restored = await restore(previous);
                    return fail(
                        `The Bot Builder holds ${live.count} block(s) but the bot has ${expectedCount}${missingTypes.length ? ` (missing: ${missingTypes.join(', ')})` : ''}. ${
                            restored ? 'Your previous workspace was restored.' : 'Your previous workspace could not be restored automatically.'
                        }`,
                        restored
                    );
                }

                const outcome: LoadResult = {
                    ok: true,
                    message: `Loaded "${options.botName}" with ${live.count} blocks. It has not been started.`,
                    liveTypes: live.types,
                    liveBlockCount: live.count,
                    restored: false,
                };
                setPhase('loaded');
                setResult(outcome);
                store?.dashboard?.setActiveTab(DBOT_TABS.BOT_BUILDER);
                return outcome;
            } catch (error) {
                const restored = await restore(previous);
                return fail(`Loading failed: ${(error as Error)?.message ?? 'unknown error'}.${restored ? ' Your previous workspace was restored.' : ''}`, restored);
            }
        },
        [store, registry]
    );

    const reset = useCallback(() => {
        setPhase('idle');
        setResult(null);
    }, []);

    return { load, phase, result, reset };
}

/** Re-reads the CURRENT Bot Builder canvas and validates it against the registry (after edits). */
export function inspectLiveWorkspace(registry: Registry): { ok: boolean; blockCount: number; unsupported: string[]; canTrade: boolean } | null {
    const xml = snapshotXml();
    if (!xml) return null;
    const inspection = inspectImportedXml(xml, registry);
    return { ok: inspection.ok, blockCount: inspection.blockCount, unsupported: inspection.unsupportedTypes, canTrade: inspection.canTrade };
}
