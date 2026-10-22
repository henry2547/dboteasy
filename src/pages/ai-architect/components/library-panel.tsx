import { useRef, useState } from 'react';
import type { SavedBot } from '../types';

const MODE_LABEL: Record<SavedBot['mode'], string> = {
    observation: 'Observation only',
    signal: 'Signal only',
    demo_trading: 'Demo trading',
};

interface Props {
    bots: SavedBot[];
    onOpen: (bot: SavedBot) => void;
    onLoad: (bot: SavedBot) => void;
    onRename: (id: string, name: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onRestore: (id: string, version: number) => void;
    onExport: (bot: SavedBot) => void;
    onImport: (file: File) => void;
    message: string | null;
}

export default function LibraryPanel({ bots, onOpen, onLoad, onRename, onDuplicate, onDelete, onRestore, onExport, onImport, message }: Props) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState('');

    const commitRename = (id: string) => {
        onRename(id, draft);
        setEditing(null);
    };

    return (
        <section className='aa-card' aria-labelledby='aa-library-title'>
            <div className='aa-library__head'>
                <h3 id='aa-library-title' className='aa-card__title'>
                    Saved AI bots <span className='aa-count'>{bots.length}</span>
                </h3>
                <button type='button' className='aa-button aa-button--secondary' onClick={() => fileInput.current?.click()}>
                    Import XML
                </button>
                <input
                    ref={fileInput}
                    type='file'
                    accept='.xml,text/xml,application/xml'
                    className='aa-visually-hidden'
                    aria-label='Import workspace XML'
                    onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) onImport(file);
                        event.target.value = '';
                    }}
                />
            </div>
            <p className='aa-card__hint'>Saved in this browser only. Nothing is uploaded or shared.</p>
            {message && (
                <p className='aa-library__message' role='status'>
                    {message}
                </p>
            )}

            {bots.length === 0 ? (
                <p className='aa-empty'>No saved bots yet. Generate a bot and choose “Save as template”.</p>
            ) : (
                <ul className='aa-library__list'>
                    {bots.map(bot => (
                        <li key={bot.id} className='aa-library__item'>
                            <div className='aa-library__main'>
                                {editing === bot.id ? (
                                    <input
                                        className='aa-input'
                                        aria-label='Bot name'
                                        value={draft}
                                        autoFocus
                                        onChange={event => setDraft(event.target.value)}
                                        onBlur={() => commitRename(bot.id)}
                                        onKeyDown={event => {
                                            if (event.key === 'Enter') commitRename(bot.id);
                                            if (event.key === 'Escape') setEditing(null);
                                        }}
                                    />
                                ) : (
                                    <span className='aa-library__name'>{bot.name}</span>
                                )}
                                <span className='aa-library__meta'>
                                    v{bot.version} · {MODE_LABEL[bot.mode]} · {bot.blockTypes.length} block types ·{' '}
                                    <span className={`aa-badge aa-badge--${bot.validation === 'invalid' ? 'bad' : 'ok'}`}>{bot.validation}</span>
                                </span>
                                <span className='aa-library__prompt' title={bot.prompt}>
                                    {bot.prompt}
                                </span>
                                <span className='aa-library__date'>Updated {new Date(bot.updatedAt).toLocaleString()}</span>
                            </div>
                            <div className='aa-library__actions'>
                                <button type='button' className='aa-button aa-button--small' onClick={() => onOpen(bot)}>
                                    Review / refine
                                </button>
                                <button type='button' className='aa-button aa-button--small aa-button--primary' onClick={() => onLoad(bot)}>
                                    Load
                                </button>
                                <button
                                    type='button'
                                    className='aa-button aa-button--small'
                                    onClick={() => {
                                        setEditing(bot.id);
                                        setDraft(bot.name);
                                    }}
                                >
                                    Rename
                                </button>
                                <button type='button' className='aa-button aa-button--small' onClick={() => onDuplicate(bot.id)}>
                                    Duplicate
                                </button>
                                <button type='button' className='aa-button aa-button--small' onClick={() => onExport(bot)}>
                                    Export XML
                                </button>
                                <button type='button' className='aa-button aa-button--small aa-button--danger' onClick={() => onDelete(bot.id)}>
                                    Delete
                                </button>
                            </div>
                            {bot.history.length > 0 && (
                                <details className='aa-details'>
                                    <summary>Earlier versions ({bot.history.length})</summary>
                                    <ul className='aa-list aa-list--muted'>
                                        {bot.history.map(version => (
                                            <li key={version.version}>
                                                v{version.version} — {new Date(version.savedAt).toLocaleString()}{' '}
                                                <button type='button' className='aa-link' onClick={() => onRestore(bot.id, version.version)}>
                                                    Restore
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
