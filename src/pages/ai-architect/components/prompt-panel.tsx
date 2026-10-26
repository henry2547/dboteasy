import type { Clarification } from '../types';

export const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
    {
        label: 'Scan all markets for Over 1, with Virtual Hook',
        prompt:
            'Build a bot that scans all supported volatility markets, analyzes the last 100 digits, waits for an Over 1 setup, records the setup in Virtual Hook, observes the next tick, and only then allows a trade if all risk checks pass.',
    },
    {
        label: 'Under 8 with a digit filter',
        prompt: 'Scan all volatility markets for Under 8, check the last 250 digits, only when digit 9 is below 10%, stop after 3 consecutive losses.',
    },
    {
        label: 'Observation only, no trades',
        prompt: 'Observation only: scan all volatility markets for Over 2, record the setup in Virtual Hook and observe the next tick. Do not trade.',
    },
    {
        label: 'Even digits on one market',
        prompt: 'Trade even digits on 1HZ25V with stake 1, take profit 5 and stop loss 10.',
    },
    {
        label: 'Over 1 with digits 5 and 6 and bar filters',
        prompt:
            'Scan all volatility markets for Over 1, entry is 5 and 6, digits 0 and 1 should have at least 10.3% frequency, digits 5 and 6 should not have the green or red bar, last 500 ticks, stop after 3 consecutive losses.',
    },
    {
        label: 'Name blocks from the Blocks menu',
        prompt:
            'Find eligible markets and use the Switch active market block to scan them for an Over 1 entry, check the last 100 digits, only when digit 0 is above 10%, then trade if the risk checks pass.',
    },
];

interface Props {
    prompt: string;
    generating: boolean;
    clarifications: Clarification[];
    onPromptChange: (value: string) => void;
    onGenerate: () => void;
    onCancel: () => void;
    onAnswer: (answer: string) => void;
}

export default function PromptPanel({ prompt, generating, clarifications, onPromptChange, onGenerate, onCancel, onAnswer }: Props) {
    const empty = prompt.trim().length === 0;

    return (
        <section className='aa-card aa-prompt' aria-labelledby='aa-prompt-title'>
            <h3 id='aa-prompt-title' className='aa-card__title'>
                Describe your strategy
            </h3>
            <p className='aa-card__hint'>
                Say which contract, which markets and how it should find an entry. The Architect builds the bot only from blocks that are
                really registered in this app. Name a block from the Bot Builder&apos;s Blocks menu — “Switch active market”, “Digit
                frequency (%)” — and the Architect uses that block and reports the ones it cannot place.
            </p>

            <textarea
                className='aa-prompt__input'
                aria-label='Strategy description'
                placeholder='Example: Scan all volatility markets, check the last 100 digits, wait for an Over 1 entry, observe the next tick, then trade only if the risk checks pass.'
                rows={6}
                value={prompt}
                disabled={generating}
                onChange={event => onPromptChange(event.target.value)}
            />

            <div className='aa-prompt__actions'>
                {generating ? (
                    <button type='button' className='aa-button aa-button--secondary' onClick={onCancel}>
                        Cancel generation
                    </button>
                ) : (
                    <button type='button' className='aa-button aa-button--primary' onClick={onGenerate} disabled={empty}>
                        Generate bot
                    </button>
                )}
                {generating && (
                    <span className='aa-prompt__status' role='status'>
                        Generating…
                    </span>
                )}
            </div>

            <div className='aa-examples'>
                <span className='aa-examples__label'>Try an example</span>
                <div className='aa-examples__list'>
                    {EXAMPLE_PROMPTS.map(example => (
                        <button
                            key={example.label}
                            type='button'
                            className='aa-chip'
                            disabled={generating}
                            onClick={() => onPromptChange(example.prompt)}
                        >
                            {example.label}
                        </button>
                    ))}
                </div>
            </div>

            {clarifications.length > 0 && (
                <div className='aa-clarify' role='group' aria-label='A question about your request'>
                    {clarifications.map(item => (
                        <div key={item.id} className='aa-clarify__item'>
                            <p className='aa-clarify__question'>{item.question}</p>
                            <div className='aa-clarify__options'>
                                {item.options.map(option => (
                                    <button key={option} type='button' className='aa-chip aa-chip--accent' onClick={() => onAnswer(option)}>
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
