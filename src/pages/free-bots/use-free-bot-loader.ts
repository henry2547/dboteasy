/**
 * Loading a Free Bot into the existing Bot Builder.
 *
 * The order is deliberate and never short-circuited: check the XML against the
 * template, re-target a copy at the chosen market, hand that copy to the app's
 * own loader, then read the *live workspace* back and refuse to call the result
 * valid unless the market, contract and prediction it reports are the ones the
 * user asked for. Loading places no trade — the engine only starts when the
 * user presses Start bot.
 */

import { useCallback } from 'react';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load as loadIntoWorkspace, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import {
    botLoaderStore,
    type BotLoadStatus,
    type LoadedBot,
    type LoadedBotMarket,
    type WorkspaceFacts,
} from './bot-loader-store';
import { applyMarketToXml, inspectFreeBotXml } from './bot-xml';
import { freeBotById, freeBotXml, type FreeBotTemplate } from './templates';

interface KnownBlocks {
    Blocks?: Record<string, unknown>;
}

type LiveWorkspace = {
    disposed?: boolean;
    getAllBlocks?: (ordered?: boolean) => { type: string; getFieldValue: (name: string) => string }[];
    getBlockById?: (id: string) => unknown;
};

/** How long a load waits for the Builder's own canvas to become ready. */
const WORKSPACE_READY_TIMEOUT_MS = 20000;

/** The Bot Builder's live canvas, or `null` when no workspace is mounted (or it was disposed). */
function liveWorkspace(): LiveWorkspace | null {
    const workspace = window.Blockly?.derivWorkspace as LiveWorkspace | undefined;
    return workspace && !workspace.disposed ? workspace : null;
}

function isKnownBlockType(type: string): boolean {
    const Blocks = (window.Blockly as unknown as KnownBlocks | undefined)?.Blocks;
    return !!Blocks && Object.prototype.hasOwnProperty.call(Blocks, type);
}

/** What the live Blockly workspace currently holds. */
function readWorkspaceFacts(): WorkspaceFacts | null {
    const workspace = liveWorkspace();

    if (!workspace?.getAllBlocks) return null;

    const blocks = workspace.getAllBlocks(true) ?? [];
    const byType = (type: string) => blocks.find(block => block.type === type);
    const marketBlock = byType('trade_definition_market');
    const contractBlock = byType('trade_definition_contracttype');
    const tradeoptionsBlock = byType('trade_definition_tradeoptions') as unknown as {
        getInput?: (name: string) => {
            connection?: { targetBlock?: () => { type?: string; getFieldValue?: (name: string) => string } | null };
        } | null;
    } | undefined;

    const predictionBlock = tradeoptionsBlock?.getInput?.('PREDICTION')?.connection?.targetBlock?.();

    return {
        symbol: marketBlock?.getFieldValue('SYMBOL_LIST') ?? null,
        contractType: contractBlock?.getFieldValue('TYPE_LIST') ?? null,
        prediction: predictionBlock?.getFieldValue?.('NUM') ?? null,
        // A two-leg template keeps the barrier in a variable, so the workspace reports
        // a block here rather than the fixed number of the primary leg.
        predictionIsVariable: predictionBlock?.type === 'variables_get',
        blockCount: blocks.length,
    };
}

function currentWorkspaceXml(): string | null {
    const workspace = window.Blockly?.derivWorkspace;
    if (!workspace) return null;
    try {
        return window.Blockly.Xml.domToText(window.Blockly.Xml.workspaceToDom(workspace));
    } catch {
        return null;
    }
}

export interface UseFreeBotLoader {
    status: BotLoadStatus;
    bot: LoadedBot | null;
    startError: string | null;
    loading: boolean;
    validated: boolean;
    isRunning: boolean;
    loadBot: (options: {
        template: FreeBotTemplate;
        market: LoadedBotMarket;
        marketSource: 'scanner' | 'library';
        marketSupported: boolean;
        marketSupportReason: string;
    }) => Promise<void>;
    validateBot: () => void;
    startBot: () => void;
    stopBot: () => void;
    clearBot: () => void;
}

function readAccount(store: ReturnType<typeof useStore>): Pick<LoadedBot, 'accountMode' | 'loginid'> {
    const loginid = store?.client?.loginid ?? '';
    if (!loginid) return { accountMode: 'Not signed in', loginid: null };
    const isVirtual = !!store?.client?.is_virtual || loginid.startsWith('VR');
    return { accountMode: isVirtual ? 'Demo' : 'Real', loginid };
}

export function useFreeBotLoader() {
    const store = useStore();
    const runPanel = store?.run_panel;
    const dashboard = store?.dashboard;

    /**
     * The Builder pane owns the canvas and disposes it as soon as another tab is shown, so a bot
     * loaded from the library has to land in a live canvas. The Builder is opened first and the wait
     * lasts until its own default strategy has finished loading: loading into a workspace that the
     * pending mount is about to replace would report success and then lose the bot.
     */
    const waitForBuilderWorkspace = useCallback(async (): Promise<LiveWorkspace | null> => {
        const is_ready = (workspace: LiveWorkspace | null) =>
            !!workspace && !store?.blockly_store?.is_loading && (workspace.getAllBlocks?.(true).length ?? 0) > 0;

        const current = liveWorkspace();
        if (is_ready(current)) return current;

        dashboard?.setActiveTab(DBOT_TABS.BOT_BUILDER);

        const deadline = Date.now() + WORKSPACE_READY_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const workspace = liveWorkspace();
            if (is_ready(workspace)) return workspace;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        return null;
    }, [dashboard, store]);

    const loadBot = useCallback<UseFreeBotLoader['loadBot']>(
        async ({ template, market, marketSource, marketSupported, marketSupportReason }) => {
            const account = readAccount(store);

            if (!store) {
                botLoaderStore.beginLoad({
                    template,
                    market,
                    marketSource,
                    marketSupported,
                    marketSupportReason,
                    ...account,
                });
                botLoaderStore.failLoad('The app is still starting up — try again in a moment.');
                return;
            }

            if (runPanel?.is_running) {
                botLoaderStore.beginLoad({
                    template,
                    market,
                    marketSource,
                    marketSupported,
                    marketSupportReason,
                    ...account,
                });
                botLoaderStore.failLoad(
                    'A bot is already running. Stop it before loading another bot — a second instance of the same configuration is not started.'
                );
                return;
            }

            if (!market.symbol) {
                botLoaderStore.beginLoad({
                    template,
                    market,
                    marketSource,
                    marketSupported,
                    marketSupportReason,
                    ...account,
                });
                botLoaderStore.failLoad('Select a volatility market before loading a bot.');
                return;
            }

            const workspace = await waitForBuilderWorkspace();
            if (!workspace) {
                botLoaderStore.beginLoad({
                    template,
                    market,
                    marketSource,
                    marketSupported,
                    marketSupportReason,
                    ...account,
                });
                botLoaderStore.failLoad('The Bot Builder workspace is not ready yet — open the Bot Builder tab and try again.');
                return;
            }

            botLoaderStore.beginLoad({
                template,
                market,
                marketSource,
                marketSupported,
                marketSupportReason,
                ...account,
            });

            try {
                const templateXml = freeBotXml(template);
                const templateReport = inspectFreeBotXml(templateXml, template, isKnownBlockType);
                if (!templateReport.ok) {
                    botLoaderStore.failLoad(
                        `The ${template.name} template cannot be loaded: ${templateReport.errors.join(' ')}`,
                        templateReport
                    );
                    return;
                }

                const patched = applyMarketToXml(templateXml, {
                    symbol: market.symbol,
                    market: market.market,
                    submarket: market.submarket,
                });
                if (patched.error) {
                    botLoaderStore.failLoad(`The market could not be applied to the template: ${patched.error}`);
                    return;
                }

                // Prove the re-targeted copy still carries the bot's logic.
                const patchedReport = inspectFreeBotXml(patched.xml, template, isKnownBlockType);
                if (!patchedReport.ok) {
                    botLoaderStore.failLoad(
                        `Applying ${market.symbol} changed the bot: ${patchedReport.errors.join(' ')}`,
                        patchedReport
                    );
                    return;
                }

                const loaded = await loadIntoWorkspace({
                    block_string: patched.xml,
                    file_name: template.name,
                    workspace,
                    from: save_types.UNSAVED,
                    strategy_id: null,
                    drop_event: null,
                    showIncompatibleStrategyDialog: false,
                    show_snackbar: true,
                });
                if (loaded && typeof loaded === 'object' && 'error' in loaded && loaded.error) {
                    botLoaderStore.failLoad(
                        `The Bot Builder rejected ${template.name}: ${String(loaded.error)} Nothing was traded.`
                    );
                    return;
                }

                const facts = readWorkspaceFacts();
                if (!facts) {
                    botLoaderStore.failLoad('The bot was loaded but the workspace could not be read back.');
                    return;
                }

                if (facts.symbol !== market.symbol) {
                    botLoaderStore.failLoad(
                        `The Bot Builder reports market ${facts.symbol ?? '—'} after loading ${template.name}, not ${market.symbol}. Nothing was traded — pick another market.`
                    );
                    return;
                }

                if (facts.contractType !== template.contractType) {
                    botLoaderStore.failLoad(
                        `The Bot Builder reports contract type ${facts.contractType ?? '—'}, but ${template.name} is ${template.contractType}.`
                    );
                    return;
                }

                // An Even/Odd template has no barrier, so the workspace must report none; a two-leg
                // template holds the barrier in a variable; a parity-recovery template carries no
                // barrier in its trade options at all, because both legs read theirs from its block.
                const predictionMatches = (() => {
                    if (template.parityRecovery) return facts.prediction === null || facts.prediction === '';
                    if (template.recoveryLeg) return facts.predictionIsVariable;
                    if (template.prediction === null) return facts.prediction === null || facts.prediction === '';
                    return Number(facts.prediction) === template.prediction;
                })();

                if (!predictionMatches) {
                    botLoaderStore.failLoad(
                        `The Bot Builder reports prediction ${facts.prediction ?? 'no barrier'}, but ${template.name} uses ${
                            template.recoveryLeg
                                ? `a barrier variable set to ${template.prediction} for Over and ${template.recoveryLeg.prediction} for the recovery`
                                : (template.prediction ?? 'no barrier (Even/Odd)')
                        }. The workspace was left unchanged — nothing was traded.`
                    );
                    return;
                }

                if (facts.blockCount !== patchedReport.blockCount) {
                    botLoaderStore.failLoad(
                        `The Bot Builder holds ${facts.blockCount} block(s) after loading ${template.name}, but the template has ${patchedReport.blockCount}. Stale blocks from a previous bot may still be on the canvas — nothing was traded.`
                    );
                    return;
                }

                const latestAccount = readAccount(store);
                botLoaderStore.completeLoad(facts, latestAccount.accountMode, latestAccount.loginid);
                dashboard?.setActiveTab(DBOT_TABS.BOT_BUILDER);
            } catch (error) {
                botLoaderStore.failLoad(
                    `Loading ${template.name} failed: ${(error as Error)?.message ?? 'unknown error'}`
                );
            }
        },
        [store, runPanel, dashboard, waitForBuilderWorkspace]
    );

    const validateBot = useCallback(() => {
        const bot = botLoaderStore.bot;
        if (!bot) return;

        const template = freeBotById(bot.templateId);
        if (!template) {
            botLoaderStore.setValidation([], ['The loaded bot has no matching template.'], null);
            return;
        }

        const workspaceXml = currentWorkspaceXml();
        const report = workspaceXml ? inspectFreeBotXml(workspaceXml, template, isKnownBlockType) : null;
        const checks = report ? [...report.checks] : [];
        const errors = report ? [...report.errors] : [];

        if (!workspaceXml || !report) {
            errors.push('The Bot Builder workspace could not be read — reopen the Bot Builder tab.');
        }

        const symbolOk = !!report && report.settings.symbol === bot.market.symbol;
        checks.push({
            id: 'selected-market',
            label: 'Loaded market is the selected market',
            passed: symbolOk,
            detail: `${report?.settings.symbol ?? '—'} (selected ${bot.market.symbol})`,
        });
        if (!symbolOk) {
            errors.push(`The workspace is on ${report?.settings.symbol ?? 'no market'}, not ${bot.market.symbol}.`);
        }

        const contractOk = !!report && report.settings.contractType === template.contractType;
        checks.push({
            id: 'digit-contract-support',
            label: 'Market supports the Digit Over/Under contract',
            passed: bot.marketSupported && contractOk,
            detail: bot.marketSupported
                ? bot.marketSupportReason
                : bot.marketSupportReason || 'This market does not offer Digit Over/Under contracts.',
        });
        if (!bot.marketSupported) errors.push(bot.marketSupportReason);

        const account = readAccount(store);
        const accountOk = !!account.loginid;
        checks.push({
            id: 'account',
            label: 'Deriv account authorized',
            passed: accountOk,
            detail: accountOk
                ? `${account.accountMode} · ${account.loginid}`
                : 'Not signed in — log in with Deriv (Demo is recommended for first runs).',
        });
        if (!accountOk) errors.push('Log in with your Deriv account before running a bot.');

        const accountChanged = !!bot.loginid && !!account.loginid && bot.loginid !== account.loginid;
        checks.push({
            id: 'active-account',
            label: 'Loaded account is the active account',
            passed: !accountChanged,
            detail: accountChanged
                ? `Loaded on ${bot.loginid}, but ${account.loginid} is active now.`
                : account.loginid
                  ? `${account.loginid} is the active account.`
                  : 'No active account yet.',
        });
        if (accountChanged) {
            errors.push(
                `The active account changed from ${bot.loginid} to ${account.loginid} after this bot was loaded — reload it before starting so its market and settings belong to the account you are trading.`
            );
        }

        botLoaderStore.setValidation(checks, errors, report);
    }, [store]);

    const startBot = useCallback(() => {
        const bot = botLoaderStore.bot;
        if (!bot) {
            botLoaderStore.setStartError('Load a bot before starting one.');
            return;
        }

        // Always re-read the live workspace: an edited canvas must be validated again.
        validateBot();

        if (!botLoaderStore.validated) {
            botLoaderStore.setStartError('Validation failed — fix the listed problems before starting the bot.');
            return;
        }

        if (runPanel?.is_running) {
            botLoaderStore.setStartError('This bot is already running. Stop it before starting another instance.');
            return;
        }

        const account = readAccount(store);
        if (!account.loginid) {
            botLoaderStore.setStartError('Log in with your Deriv account to run a bot.');
            return;
        }

        botLoaderStore.setStartError(null);
        runPanel?.onRunButtonClick();
    }, [runPanel, store, validateBot]);

    const stopBot = useCallback(() => {
        runPanel?.onStopButtonClick();
    }, [runPanel]);

    const clearBot = useCallback(() => {
        botLoaderStore.clear();
    }, []);

    return {
        status: botLoaderStore.status,
        bot: botLoaderStore.bot,
        startError: botLoaderStore.startError,
        loading: botLoaderStore.loading,
        validated: botLoaderStore.validated,
        isRunning: !!runPanel?.is_running,
        loadBot,
        validateBot,
        startBot,
        stopBot,
        clearBot,
    };
}

/** Exported for tests: the same check the loader uses on the running builder. */
export { isKnownBlockType };
