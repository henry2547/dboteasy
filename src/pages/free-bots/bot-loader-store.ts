/**
 * State of the bot currently loaded into the Bot Builder.
 *
 * One module-level store, so the Free Bots tab, the scanner results panel and
 * the Bot Builder banner all read the same truth: what was loaded, from which
 * market, under which account, and whether the last validation passed. Nothing
 * here ever reports a bot as running — that comes from the run panel, which the
 * execution engine owns.
 */

import { makeAutoObservable } from 'mobx';
import type { FreeBotXmlReport } from './bot-xml';
import type { FreeBotTemplate } from './templates';

export type BotLoadStatus = 'idle' | 'loading' | 'loaded' | 'invalid' | 'error';

export interface LoadedBotMarket {
    symbol: string;
    displayName: string;
    market: string | null;
    submarket: string | null;
}

export interface LoadedBot {
    templateId: string;
    name: string;
    sourceFile: string;
    strategyLabel: string;
    contractType: string;
    /** Barrier digit for Over/Under, `null` for an Even/Odd template. */
    prediction: number | null;
    marketSource: 'scanner' | 'library';
    market: LoadedBotMarket;
    /** Why the market can (or cannot) trade Digit Over/Under. */
    marketSupported: boolean;
    marketSupportReason: string;
    accountMode: 'Demo' | 'Real' | 'Not signed in';
    loginid: string | null;
    loadedAt: number;
    /** What the live workspace reports after the import. */
    workspaceSymbol: string | null;
    workspaceContractType: string | null;
    workspaceBlockCount: number;
    errorMessage: string | null;
    validation: FreeBotXmlReport | null;
    validationChecks: { id: string; label: string; passed: boolean; detail: string }[];
    validationErrors: string[];
    validatedAt: number | null;
}

export interface LoadRequest {
    template: FreeBotTemplate;
    market: LoadedBotMarket;
    marketSource: 'scanner' | 'library';
    marketSupported: boolean;
    marketSupportReason: string;
    accountMode: LoadedBot['accountMode'];
    loginid: string | null;
}

export interface WorkspaceFacts {
    symbol: string | null;
    contractType: string | null;
    prediction: string | null;
    blockCount: number;
}

class BotLoaderStore {
    status: BotLoadStatus = 'idle';
    bot: LoadedBot | null = null;
    /** Error from the last Start attempt (never a claim about the engine). */
    startError: string | null = null;

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true });
    }

    get hasBot(): boolean {
        return this.bot !== null;
    }

    get loading(): boolean {
        return this.status === 'loading';
    }

    get validated(): boolean {
        return !!this.bot?.validatedAt && this.bot.validationErrors.length === 0;
    }

    get loadErrorMessage(): string | null {
        return this.status === 'invalid' || this.status === 'error' ? this.bot?.errorMessage ?? null : null;
    }

    beginLoad(request: LoadRequest): void {
        this.status = 'loading';
        this.startError = null;
        this.bot = {
            templateId: request.template.id,
            name: request.template.name,
            sourceFile: request.template.sourceFile,
            strategyLabel: request.template.strategyLabel,
            contractType: request.template.contractType,
            prediction: request.template.prediction,
            marketSource: request.marketSource,
            market: request.market,
            marketSupported: request.marketSupported,
            marketSupportReason: request.marketSupportReason,
            accountMode: request.accountMode,
            loginid: request.loginid,
            loadedAt: Date.now(),
            workspaceSymbol: null,
            workspaceContractType: null,
            workspaceBlockCount: 0,
            errorMessage: null,
            validation: null,
            validationChecks: [],
            validationErrors: [],
            validatedAt: null,
        };
    }

    completeLoad(facts: WorkspaceFacts, accountMode: LoadedBot['accountMode'], loginid: string | null): void {
        if (!this.bot) return;
        this.bot = {
            ...this.bot,
            workspaceSymbol: facts.symbol,
            workspaceContractType: facts.contractType,
            workspaceBlockCount: facts.blockCount,
            accountMode,
            loginid,
            errorMessage: null,
        };
        this.status = 'loaded';
    }

    failLoad(message: string, report: FreeBotXmlReport | null = null): void {
        if (!this.bot) return;
        this.bot = {
            ...this.bot,
            errorMessage: message,
            validation: report,
            validationChecks: report?.checks ?? [],
            validationErrors: report?.errors ?? [message],
            validatedAt: null,
        };
        this.status = report ? 'invalid' : 'error';
    }

    setValidation(checks: LoadedBot['validationChecks'], errors: string[], report: FreeBotXmlReport | null): void {
        if (!this.bot) return;
        this.bot = {
            ...this.bot,
            validation: report,
            validationChecks: checks,
            validationErrors: errors,
            validatedAt: errors.length === 0 ? Date.now() : null,
            errorMessage: errors.length === 0 ? null : this.bot.errorMessage,
        };
        this.status = errors.length === 0 ? 'loaded' : 'error';
    }

    setStartError(message: string | null): void {
        this.startError = message;
    }

    clear(): void {
        this.status = 'idle';
        this.bot = null;
        this.startError = null;
    }
}

export const botLoaderStore = new BotLoaderStore();
