const Localize = ({ i18n_default_text, values }) => {
    // Replace placeholders in the default text with actual values
    const localizedText = i18n_default_text.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] || match);

    return localizedText || null;
};

// Mock for useTranslations hook
const useTranslations = () => ({
    localize: jest.fn((text, args) => {
        return text.replace(/{{(.*?)}}/g, (_, match) => args[match.trim()]);
    }),
    currentLang: 'EN',
});

// The real helper replaces `{{ name }}` with the value passed for it. Block messages rely on that
// (their `%1` placeholders arrive through the values), so a mock that returns the raw text leaves
// Blockly with a message that references no arguments and no block can be built.
const localize = jest.fn((text, values) =>
    values && typeof text === 'string'
        ? text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in values ? values[key] : match))
        : text
);

const getAllowedLanguages = jest.fn(() => ({ EN: 'English', VI: 'Tiếng Việt' }));

const initializeI18n = jest.fn(() => {});

// Read by the modules that append `lang` to an outbound Deriv URL
// (config/config.ts, url-redirect-utils, transfer-utils). Present here so a
// suite that reaches one transitively does not have to mock the package itself.
const getInitialLanguage = jest.fn(() => 'EN');

export { getAllowedLanguages, getInitialLanguage, initializeI18n, Localize, localize, useTranslations };
