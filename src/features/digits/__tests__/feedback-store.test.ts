import {
    FEEDBACK_STORAGE_KEY,
    loadFeedback,
    saveFeedback,
    validateFeedback,
} from '../feedback-store';

beforeEach(() => {
    window.localStorage.clear();
});

describe('validateFeedback', () => {
    it('requires a known category and a useful message', () => {
        const invalid = validateFeedback({ category: undefined, message: 'too short' });
        expect(invalid.valid).toBe(false);
        expect(invalid.errors.category).toBeDefined();
        expect(invalid.errors.message).toBeDefined();
    });

    it('rejects an unknown category and an out-of-range rating', () => {
        const result = validateFeedback({
            category: 'not-a-category' as never,
            message: 'The scan progress bar stopped updating on mobile.',
            rating: 9,
        });
        expect(result.valid).toBe(false);
        expect(result.errors.rating).toBeDefined();
    });

    it('accepts a complete report without a rating', () => {
        const result = validateFeedback({ category: 'scanner', message: 'The scan took over a minute.' });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual({});
    });
});

describe('saveFeedback', () => {
    it('persists the report and reads it back newest first', () => {
        const first = saveFeedback({ category: 'ui', message: 'The cards are hard to read on my phone.', rating: 3 });
        const second = saveFeedback({ category: 'suggestion', message: 'Add a CSV export for scan results.', rating: null });

        const stored = loadFeedback();
        expect(stored.map(entry => entry.id)).toEqual([second.id, first.id]);
        expect(stored[1].rating).toBe(3);
        expect(stored[1].message).toBe('The cards are hard to read on my phone.');
        expect(stored[0].rating).toBeNull();
    });

    it('refuses invalid input instead of writing it', () => {
        expect(() => saveFeedback({ category: 'ui', message: 'short', rating: null })).toThrow();
        expect(window.localStorage.getItem(FEEDBACK_STORAGE_KEY)).toBeNull();
    });

    it('reports a storage failure instead of claiming success', () => {
        const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        expect(() => saveFeedback({ category: 'results', message: 'The losing digits look wrong.', rating: null })).toThrow(
            /refused to store/
        );

        spy.mockRestore();
        expect(loadFeedback()).toEqual([]);
    });

    it('keeps the stored list bounded', () => {
        for (let index = 0; index < 55; index += 1) {
            saveFeedback({ category: 'ui', message: `Report number ${index} about the layout.`, rating: null });
        }
        expect(loadFeedback().length).toBe(50);
    });
});

describe('loadFeedback', () => {
    it('survives a corrupt payload', () => {
        window.localStorage.setItem(FEEDBACK_STORAGE_KEY, '{not json');
        expect(loadFeedback()).toEqual([]);
    });

    it('ignores entries that are not valid reports', () => {
        window.localStorage.setItem(
            FEEDBACK_STORAGE_KEY,
            JSON.stringify([{ id: 'x', createdAt: 1, category: 'ui', message: 'ok', rating: null }, { nope: true }])
        );
        expect(loadFeedback()).toHaveLength(1);
    });
});
