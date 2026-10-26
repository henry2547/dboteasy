import { useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import AddBotPanel from './components/add-bot-panel';
import LibraryPanel from './components/library-panel';
import PromptPanel from './components/prompt-panel';
import RefinePanel from './components/refine-panel';
import {
    BlocksPanel,
    ConfigurationPanel,
    FlowPanel,
    ReasoningPanel,
    RequirementsPanel,
    ValidationPanel,
} from './components/result-panels';
import { combineSpecs } from './combine';
import { botLibrary, inspectImportedXml } from './library';
import { assemble } from './pipeline';
import type { SavedBot } from './types';
import { useArchitect } from './use-architect';
import { useArchitectLoader, workspaceHasWork } from './use-architect-loader';
import './ai-architect.scss';

const download = (filename: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

const confirmOverwrite = () =>
    !workspaceHasWork() ||
    window.confirm('The Bot Builder already has blocks on its canvas. Replace them with this bot?');

/**
 * AI Bot Architect tab: turns a plain-language strategy into a Bot Builder workspace using only
 * blocks that are registered in this app. Nothing is loaded or started without an explicit click.
 */
const AiArchitectPage = observer(() => {
    const store = useStore();
    const architect = useArchitect();
    const { state, library } = architect;
    const loader = useArchitectLoader(architect.getRegistry);
    const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [addBotMessage, setAddBotMessage] = useState<string | null>(null);

    const generating = state.status === 'generating';
    const bot = state.bot;
    const running = !!store?.run_panel?.is_running;

    const loadGenerated = useCallback(async () => {
        if (!bot || !confirmOverwrite()) return;
        await loader.load(bot, { botName: bot.spec.name });
    }, [bot, loader]);

    const loadSaved = useCallback(
        async (saved: SavedBot) => {
            const outcome = assemble(saved.spec, architect.getRegistry());
            if (outcome.ok === false) {
                setLibraryMessage(outcome.message);
                return;
            }
            if (!confirmOverwrite()) return;
            const result = await loader.load(outcome.bot, { botName: saved.name });
            setLibraryMessage(result.message);
        },
        [architect, loader]
    );

    const handleSave = () => {
        const result = architect.save();
        setSaveMessage(result.ok ? 'Saved to your library.' : (result.error ?? 'Could not save.'));
    };

    // "Add this bot to another": the chosen bot becomes the second entry rule of the target bot, and
    // the combination is saved as its own library entry so neither original is changed.
    const handleCombine = useCallback(
        (sourceId: string, targetId: string) => {
            const source = botLibrary.get(sourceId);
            const target = botLibrary.get(targetId);
            if (!source || !target) {
                setLibraryMessage('That bot is no longer in the library.');
                return;
            }
            const outcome = combineSpecs(target.spec, source.spec);
            if (!outcome.spec) {
                setLibraryMessage(outcome.message);
                return;
            }
            const assembled = assemble(outcome.spec, architect.getRegistry());
            if (assembled.ok === false) {
                setLibraryMessage(`${outcome.message} It could not be built: ${assembled.message}`);
                return;
            }
            const saved = botLibrary.save({
                name: outcome.spec.name,
                prompt: outcome.spec.purpose,
                spec: outcome.spec,
                xml: assembled.bot.xml,
                validation: assembled.bot.validation,
                blockTypes: assembled.bot.validation.blockTypes,
            });
            setLibraryMessage(
                saved.ok ? `${outcome.message} Saved to your library as “${outcome.spec.name}”.` : (saved.error ?? 'Could not save the combined bot.')
            );
            architect.refreshLibrary();
        },
        [architect]
    );

    // "Add a bot to this one": the bot on screen keeps its rule and the added bot becomes its second
    // entry rule. `addBot` builds the combination and puts it on screen; nothing is loaded or run.
    const handleAddSaved = useCallback(
        (id: string) => setAddBotMessage(architect.addBot({ savedId: id }).message),
        [architect]
    );

    const handleAddPrompt = useCallback(
        (text: string) => setAddBotMessage(architect.addBot({ prompt: text }).message),
        [architect]
    );

    // Imported XML is only checked here (every block type must be registered); it is never loaded
    // behind the user's back.
    const handleImport = async (file: File) => {
        const inspection = inspectImportedXml(await file.text(), architect.getRegistry());
        setLibraryMessage(
            inspection.ok
                ? `${file.name}: ${inspection.blockCount} blocks, all registered${inspection.canTrade ? ' (it can trade)' : ''}. Open it from the Bot Builder to edit it.`
                : `Import rejected: ${inspection.errors.join(' ')}`
        );
    };

    return (
        <div className='ai-architect'>
            <header className='ai-architect__hero'>
                <div>
                    <h2 className='ai-architect__title'>AI Bot Architect</h2>
                    <p className='ai-architect__subtitle'>
                        Describe a strategy in plain language and get a Bot Builder bot made only from real,
                        registered blocks
                    </p>
                </div>
                <span className='aa-chip'>{running ? 'Bot running' : 'Idle'}</span>
            </header>

            <PromptPanel
                prompt={state.prompt}
                generating={generating}
                clarifications={state.clarifications}
                onPromptChange={architect.setPrompt}
                onGenerate={() => architect.generate(state.prompt)}
                onCancel={architect.cancel}
                onAnswer={architect.answer}
            />

            {state.message && (
                <p className={`aa-card aa-message aa-message--${state.status === 'failed' ? 'bad' : 'info'}`} role='status'>
                    {state.message}
                </p>
            )}

            {bot && (
                <>
                    <RequirementsPanel requirements={state.requirements} />
                    <ReasoningPanel reasoning={state.reasoning} summary={bot.explanation.summary} />
                    <ConfigurationPanel explanation={bot.explanation} defaults={state.defaults} />
                    <FlowPanel explanation={bot.explanation} />
                    <BlocksPanel explanation={bot.explanation} />
                    <ValidationPanel report={bot.validation} unsupported={state.unsupported} />

                    <section className='aa-card aa-actions' aria-label='Bot actions'>
                        <button
                            type='button'
                            className='aa-button aa-button--primary'
                            disabled={!bot.validation.ok || running || loader.phase === 'loading'}
                            onClick={loadGenerated}
                        >
                            {loader.phase === 'loading' ? 'Loading…' : 'Load into Bot Builder'}
                        </button>
                        <button type='button' className='aa-button aa-button--secondary' onClick={handleSave}>
                            Save as template
                        </button>
                        <button
                            type='button'
                            className='aa-button aa-button--secondary'
                            onClick={() => download(`${bot.spec.name}.xml`, bot.xml)}
                        >
                            Export XML
                        </button>
                        <button type='button' className='aa-button aa-button--secondary' onClick={architect.clear}>
                            Start over
                        </button>
                        {running && <p className='aa-card__hint'>Stop the running bot before loading another.</p>}
                        {saveMessage && <p className='aa-card__hint'>{saveMessage}</p>}
                        {loader.result && (
                            <p className={`aa-message aa-message--${loader.result.ok ? 'info' : 'bad'}`} role='status'>
                                {loader.result.message}
                            </p>
                        )}
                    </section>

                    <AddBotPanel bots={library} message={addBotMessage} onAddSaved={handleAddSaved} onAddPrompt={handleAddPrompt} />

                    <RefinePanel disabled={generating} log={state.changeLog} onRefine={architect.refine} />
                </>
            )}

            <LibraryPanel
                bots={library}
                message={libraryMessage}
                onOpen={architect.open}
                onLoad={loadSaved}
                onRename={(id, name) => {
                    const result = botLibrary.rename(id, name);
                    if (!result.ok) setLibraryMessage(result.error ?? 'Could not rename.');
                    architect.refreshLibrary();
                }}
                onDuplicate={id => {
                    const result = botLibrary.duplicate(id);
                    if (!result.ok) setLibraryMessage(result.error ?? 'Could not duplicate.');
                    architect.refreshLibrary();
                }}
                onDelete={id => {
                    if (!window.confirm('Delete this saved bot?')) return;
                    botLibrary.remove(id);
                    architect.refreshLibrary();
                }}
                onRestore={(id, version) => {
                    const result = botLibrary.restore(id, version);
                    setLibraryMessage(result.ok ? `Restored version ${version}.` : (result.error ?? 'Could not restore.'));
                    architect.refreshLibrary();
                }}
                onExport={saved => download(`${saved.name}.xml`, saved.xml)}
                onImport={handleImport}
                onCombine={handleCombine}
            />
        </div>
    );
});

export default AiArchitectPage;
