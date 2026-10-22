import { useState } from 'react';
import type { ChangeLog } from '../use-architect';

const EXAMPLES = [
    'Change the analysis window to 250 ticks',
    'Stop after three consecutive losses',
    'Add the Virtual Hook and record the next tick',
    'Make the bot observation-only',
];

interface Props {
    disabled: boolean;
    log: ChangeLog[];
    onRefine: (instruction: string) => void;
}

export default function RefinePanel({ disabled, log, onRefine }: Props) {
    const [instruction, setInstruction] = useState('');

    const submit = () => {
        const value = instruction.trim();
        if (!value) return;
        onRefine(value);
        setInstruction('');
    };

    return (
        <section className='aa-card' aria-labelledby='aa-refine-title'>
            <h3 id='aa-refine-title' className='aa-card__title'>
                Refine this bot
            </h3>
            <p className='aa-card__hint'>
                Describe a change. Only what you mention is updated; the rest of the bot is kept, and the whole workspace is validated again.
            </p>
            <div className='aa-refine__row'>
                <input
                    className='aa-input'
                    type='text'
                    aria-label='Refinement instruction'
                    placeholder='For example: change the window to 250 ticks and stop after 3 losses'
                    value={instruction}
                    disabled={disabled}
                    onChange={event => setInstruction(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter') submit();
                    }}
                />
                <button type='button' className='aa-button aa-button--primary' onClick={submit} disabled={disabled || !instruction.trim()}>
                    Refine
                </button>
            </div>
            <div className='aa-examples__list'>
                {EXAMPLES.map(example => (
                    <button key={example} type='button' className='aa-chip' disabled={disabled} onClick={() => setInstruction(example)}>
                        {example}
                    </button>
                ))}
            </div>

            {log.length > 0 && (
                <ul className='aa-changelog' aria-label='Changes made'>
                    {log.map((entry, index) => (
                        <li key={`${entry.instruction}-${index}`} className='aa-changelog__entry'>
                            <span className='aa-changelog__instruction'>“{entry.instruction}”</span>
                            {entry.changes.map(change => (
                                <span key={change.field} className='aa-changelog__change'>
                                    <b>{change.field}:</b> {change.from} → {change.to}
                                </span>
                            ))}
                            {entry.changes.length === 0 && entry.unsupported.length === 0 && (
                                <span className='aa-changelog__note'>
                                    {entry.unrecognised.length
                                        ? 'I did not recognise a change in that. Try naming a setting, such as the window, stake or loss limit.'
                                        : 'The bot already matches that. Nothing was changed.'}
                                </span>
                            )}
                            {entry.unsupported.map(line => (
                                <span key={line} className='aa-changelog__note aa-changelog__note--warn'>
                                    {line}
                                </span>
                            ))}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
