import { useState } from 'react';
import type { SavedBot } from '../types';

interface Props {
    bots: SavedBot[];
    /** Add a saved bot to the bot currently on screen. */
    onAddSaved: (id: string) => void;
    /** Describe another bot and add it to the bot currently on screen. */
    onAddPrompt: (prompt: string) => void;
    message: string | null;
}

/**
 * "Add a bot to this one": the bot on screen keeps its own rule and the added bot becomes its
 * second entry rule, so both strategies run in a single workspace. The add is refused, with the
 * reason, when the engine cannot run both rules in one bot.
 */
export default function AddBotPanel({ bots, onAddSaved, onAddPrompt, message }: Props) {
    const [savedId, setSavedId] = useState('');
    const [prompt, setPrompt] = useState('');

    return (
        <section className='aa-card aa-add-bot' aria-labelledby='aa-add-bot-title'>
            <h3 id='aa-add-bot-title' className='aa-card__title'>
                Add a bot to this one
            </h3>
            <p className='aa-card__hint'>
                The added bot becomes a second entry rule of this bot: this one trades while it is winning, the added one takes over after a loss.
                It only goes ahead when one bot can run both rules.
            </p>

            {bots.length > 0 ? (
                <div className='aa-add-bot__row'>
                    <select
                        className='aa-input'
                        aria-label='Saved bot to add to this one'
                        value={savedId}
                        onChange={event => setSavedId(event.target.value)}
                    >
                        <option value=''>Choose a saved bot…</option>
                        {bots.map(bot => (
                            <option key={bot.id} value={bot.id}>
                                {bot.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type='button'
                        className='aa-button aa-button--primary aa-button--small'
                        disabled={!savedId}
                        onClick={() => {
                            onAddSaved(savedId);
                            setSavedId('');
                        }}
                    >
                        Add to this bot
                    </button>
                </div>
            ) : (
                <p className='aa-card__hint'>No saved bots yet — describe the one to add below, or save a bot first.</p>
            )}

            <div className='aa-add-bot__row aa-add-bot__row--stacked'>
                <textarea
                    className='aa-prompt__input'
                    aria-label='Describe the bot to add'
                    rows={3}
                    placeholder='Or describe the bot to add: for example, Under 6 with entry digits 7, 8 or 9 on every volatility market.'
                    value={prompt}
                    onChange={event => setPrompt(event.target.value)}
                />
                <button
                    type='button'
                    className='aa-button aa-button--secondary aa-button--small'
                    disabled={!prompt.trim()}
                    onClick={() => {
                        onAddPrompt(prompt);
                        setPrompt('');
                    }}
                >
                    Add described bot
                </button>
            </div>

            {message && (
                <p className='aa-message aa-message--info' role='status'>
                    {message}
                </p>
            )}
        </section>
    );
}
