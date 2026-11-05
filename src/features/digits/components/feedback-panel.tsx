/**
 * Lightweight feedback form for the dashboard.
 *
 * Submissions are validated, then written to local storage (see
 * `feedback-store.ts`) — the app has no server. The success message appears
 * only after that write is confirmed; when the browser refuses the write the
 * form says so instead of pretending the report was recorded.
 */

import { useEffect, useState, type FormEvent } from 'react';
import {
    FEEDBACK_CATEGORIES,
    FEEDBACK_MESSAGE_MAX,
    isFeedbackCategory,
    loadFeedback,
    saveFeedback,
    validateFeedback,
    type FeedbackCategory,
    type FeedbackEntry,
    type FeedbackValidation,
} from '../feedback-store';
import { formatClock } from '../format';

const RATINGS = [1, 2, 3, 4, 5];

export default function FeedbackPanel() {
    const [category, setCategory] = useState<FeedbackCategory | ''>('');
    const [message, setMessage] = useState('');
    const [rating, setRating] = useState<number | null>(null);
    const [errors, setErrors] = useState<FeedbackValidation['errors']>({});
    const [outcome, setOutcome] = useState<{ tone: 'saved' | 'error'; text: string } | null>(null);
    const [stored, setStored] = useState<FeedbackEntry[]>([]);

    useEffect(() => {
        setStored(loadFeedback());
    }, []);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setOutcome(null);

        const input = {
            category: isFeedbackCategory(category) ? category : undefined,
            message,
            rating,
        };
        const validation = validateFeedback(input);
        setErrors(validation.errors);
        if (!validation.valid || !input.category) return;

        try {
            const entry = saveFeedback({ category: input.category, message, rating });
            setStored(loadFeedback());
            setMessage('');
            setRating(null);
            setOutcome({
                tone: 'saved',
                text: `Feedback saved on this device at ${formatClock(entry.createdAt / 1000)}.`,
            });
        } catch (error) {
            setOutcome({ tone: 'error', text: (error as Error).message });
        }
    };

    return (
        <section className='dash-section' aria-labelledby='dash-feedback-heading'>
            <header className='dash-section__head'>
                <h3 className='dash-section__title' id='dash-feedback-heading'>
                    Feedback
                </h3>
                <span className='dash-section__note'>
                    {stored.length > 0
                        ? `${stored.length} report${stored.length === 1 ? '' : 's'} stored on this device`
                        : 'Report a problem or suggest an improvement'}
                </span>
            </header>

            <form className='dash-feedback' onSubmit={handleSubmit} noValidate>
                <label className='dash-field'>
                    <span className='dash-field__label'>Category</span>
                    <select
                        className='dash-field__input'
                        value={category}
                        onChange={event => setCategory(event.target.value as FeedbackCategory | '')}
                        aria-invalid={Boolean(errors.category)}
                    >
                        <option value=''>Choose a category…</option>
                        {FEEDBACK_CATEGORIES.map(option => (
                            <option value={option.id} key={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                {errors.category ? (
                    <p className='dash-feedback__error'>{errors.category}</p>
                ) : (
                    <p className='dash-feedback__hint'>
                        {FEEDBACK_CATEGORIES.find(option => option.id === category)?.hint ??
                            'UI problems, scanner performance, confusing results, missing features or an idea.'}
                    </p>
                )}

                <label className='dash-field'>
                    <span className='dash-field__label'>Message</span>
                    <textarea
                        className='dash-field__input dash-field__input--area'
                        rows={3}
                        maxLength={FEEDBACK_MESSAGE_MAX}
                        value={message}
                        placeholder='What happened, and what did you expect?'
                        onChange={event => setMessage(event.target.value)}
                        aria-invalid={Boolean(errors.message)}
                    />
                </label>
                {errors.message ? (
                    <p className='dash-feedback__error'>{errors.message}</p>
                ) : (
                    <p className='dash-feedback__hint'>
                        {message.trim().length}/{FEEDBACK_MESSAGE_MAX} characters · no account or personal details needed.
                    </p>
                )}

                <div className='dash-field'>
                    <span className='dash-field__label'>Rating (optional)</span>
                    <div className='dash-rating' role='group' aria-label='Rating from 1 to 5'>
                        {RATINGS.map(value => (
                            <button
                                type='button'
                                key={value}
                                className={`dash-rating__button${rating === value ? ' dash-rating__button--active' : ''}`}
                                aria-pressed={rating === value}
                                onClick={() => setRating(rating === value ? null : value)}
                            >
                                {value}
                            </button>
                        ))}
                        <span className='dash-rating__value'>{rating ? `${rating}/5` : 'Not rated'}</span>
                    </div>
                </div>
                {errors.rating && <p className='dash-feedback__error'>{errors.rating}</p>}

                <div className='dash-feedback__actions'>
                    <button type='submit' className='dash-button dash-button--primary'>
                        Send feedback
                    </button>
                    <span className='dash-feedback__hint'>
                        Stored in this browser on this device — this app has no server to send it to.
                    </span>
                </div>

                {outcome && (
                    <p
                        className={`dash-alert dash-alert--${outcome.tone === 'saved' ? 'ok' : 'error'}`}
                        role={outcome.tone === 'error' ? 'alert' : 'status'}
                    >
                        {outcome.text}
                    </p>
                )}
            </form>

            {stored.length > 0 && (
                <ul className='dash-feedback__list'>
                    {stored.slice(0, 3).map(entry => (
                        <li className='dash-feedback__item' key={entry.id}>
                            <span className='dash-chip'>{FEEDBACK_CATEGORIES.find(o => o.id === entry.category)?.label}</span>
                            <span className='dash-feedback__text'>{entry.message}</span>
                            <span className='dash-feedback__meta'>
                                {entry.rating ? `${entry.rating}/5 · ` : ''}
                                {formatClock(entry.createdAt / 1000)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
