/**
 * Feedback persistence for the Digits dashboard.
 *
 * The app is a frontend-only SPA with no server, so feedback is stored in the
 * browser's localStorage under one key — a real write that survives a reload,
 * not a fake "sent" message. `saveFeedback` only resolves once the entry is
 * written; the caller shows its success message from that result and shows an
 * error when the write fails (private mode, full storage, corrupted payload).
 *
 * Nothing personal is collected: only the category, the message, an optional
 * rating and the timestamp.
 */

export const FEEDBACK_STORAGE_KEY = 'digits_feedback';
const MAX_ENTRIES = 50;
export const FEEDBACK_MESSAGE_MAX = 600;

export type FeedbackCategory = 'ui' | 'scanner' | 'results' | 'feature' | 'suggestion';

export interface FeedbackCategoryOption {
    id: FeedbackCategory;
    label: string;
    hint: string;
}

export const FEEDBACK_CATEGORIES: FeedbackCategoryOption[] = [
    { id: 'ui', label: 'UI problem', hint: 'Layout, readability, spacing or theming' },
    { id: 'scanner', label: 'Scanner performance', hint: 'Slow scans, failures, timeouts, progress' },
    { id: 'results', label: 'Incorrect or confusing results', hint: 'Wrong numbers, symbols or explanations' },
    { id: 'feature', label: 'Missing feature', hint: 'Something the dashboard does not do yet' },
    { id: 'suggestion', label: 'Suggestion', hint: 'An idea for improving the dashboard' },
];

export interface FeedbackInput {
    category: FeedbackCategory;
    message: string;
    rating: number | null;
}

export interface FeedbackEntry extends FeedbackInput {
    id: string;
    createdAt: number;
}

export interface FeedbackValidation {
    valid: boolean;
    errors: { category?: string; message?: string; rating?: string };
}

const CATEGORY_IDS = FEEDBACK_CATEGORIES.map(option => option.id);

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
    return typeof value === 'string' && CATEGORY_IDS.includes(value as FeedbackCategory);
}

/** Validates the form. Kept pure so the UI and the tests share one rule set. */
export function validateFeedback(input: Partial<FeedbackInput>): FeedbackValidation {
    const errors: FeedbackValidation['errors'] = {};

    if (!isFeedbackCategory(input.category)) {
        errors.category = 'Choose a category.';
    }

    const message = (input.message ?? '').trim();
    if (message.length < 10) {
        errors.message = 'Add at least 10 characters so the report is useful.';
    } else if (message.length > FEEDBACK_MESSAGE_MAX) {
        errors.message = `Keep the message under ${FEEDBACK_MESSAGE_MAX} characters.`;
    }

    if (input.rating !== null && input.rating !== undefined) {
        if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
            errors.rating = 'A rating must be a whole number from 1 to 5.';
        }
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

function storage(): Storage | null {
    try {
        const candidate = window.localStorage;
        return candidate ?? null;
    } catch {
        return null;
    }
}

/** Reads the stored feedback. A corrupt payload is reported as empty, never thrown. */
export function loadFeedback(): FeedbackEntry[] {
    const store = storage();
    if (!store) return [];

    try {
        const raw = store.getItem(FEEDBACK_STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter((entry): entry is FeedbackEntry => {
                const candidate = entry as Partial<FeedbackEntry>;
                return (
                    typeof candidate?.id === 'string' &&
                    typeof candidate?.createdAt === 'number' &&
                    typeof candidate?.message === 'string' &&
                    isFeedbackCategory(candidate?.category)
                );
            })
            .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
        return [];
    }
}

/**
 * Validates and writes one feedback entry. Throws when the input is invalid or
 * the browser refuses the write, so the caller never reports a save that did
 * not happen.
 */
export function saveFeedback(input: FeedbackInput): FeedbackEntry {
    const validation = validateFeedback(input);
    if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? 'The feedback is incomplete.');
    }

    const store = storage();
    if (!store) throw new Error('This browser does not allow local storage, so the feedback was not saved.');

    const entry: FeedbackEntry = {
        id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        category: input.category,
        message: input.message.trim(),
        rating: input.rating ?? null,
    };

    const next = [entry, ...loadFeedback()].slice(0, MAX_ENTRIES);

    try {
        store.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next));
    } catch {
        throw new Error('The browser refused to store the feedback (storage may be full).');
    }

    // Confirm the entry really landed before reporting success.
    const stored = loadFeedback().some(item => item.id === entry.id);
    if (!stored) throw new Error('The feedback could not be confirmed in storage.');

    return entry;
}
