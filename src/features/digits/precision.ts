/**
 * Quote precision and last-digit extraction.
 *
 * Precision is never assumed. The last digit is read from the *formatted*
 * quote so trailing zeros survive (e.g. 123.4 with 2 decimals -> "123.40" -> 0).
 */

import type { PrecisionState } from './types';

/** Converts a price increment (e.g. 0.01, 1e-5) into a decimal-place count. */
export function decimalsFromPipIncrement(pipSize: number | string): number | null {
    const numeric = Number(pipSize);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    if (numeric >= 1) {
        return 0;
    }

    const text = String(pipSize).toLowerCase();

    if (text.includes('e-')) {
        const exponent = Number(text.split('e-')[1]);

        return Number.isInteger(exponent) ? exponent : null;
    }

    const decimalIndex = text.indexOf('.');

    return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
}

/**
 * The `pip_size` returned on history/tick messages is already a decimal-place
 * count (R_100 -> 2 means "629.81"). Guard against nonsense values.
 */
export function decimalsFromTickPipSize(pipSize: number | string | null | undefined): number | null {
    if (pipSize === null || pipSize === undefined) {
        return null;
    }

    const numeric = Number(pipSize);

    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 8) {
        return null;
    }

    return numeric;
}

export function formatQuote(quote: number | string, decimalPlaces: number): string {
    const numericQuote = Number(quote);

    if (!Number.isFinite(numericQuote)) {
        throw new Error('Invalid quote');
    }

    return numericQuote.toFixed(decimalPlaces);
}

export function extractLastDigit(formattedQuote: string): number {
    const digits = formattedQuote.replace(/\D/g, '');
    const finalCharacter = digits[digits.length - 1];

    if (finalCharacter === undefined) {
        throw new Error('No digit found');
    }

    return Number(finalCharacter);
}

export function resolvePrecision(params: {
    historyPipSize: number | string | null;
    livePipSize: number | string | null;
    activeSymbolPipSize: number | string | null;
}): PrecisionState {
    const historyDecimalPlaces = decimalsFromTickPipSize(params.historyPipSize);
    const liveDecimalPlaces = decimalsFromTickPipSize(params.livePipSize);
    const pipIncrement = params.activeSymbolPipSize === null ? null : Number(params.activeSymbolPipSize);
    const activeSymbolPipIncrement = Number.isFinite(pipIncrement as number) ? (pipIncrement as number) : null;
    const fromActiveSymbol =
        params.activeSymbolPipSize === null ? null : decimalsFromPipIncrement(params.activeSymbolPipSize);

    const base = {
        activeSymbolPipIncrement,
        historyDecimalPlaces,
        liveDecimalPlaces,
    };

    if (historyDecimalPlaces !== null) {
        return { ...base, resolvedDecimalPlaces: historyDecimalPlaces, source: 'history' };
    }
    if (liveDecimalPlaces !== null) {
        return { ...base, resolvedDecimalPlaces: liveDecimalPlaces, source: 'live-tick' };
    }
    if (fromActiveSymbol !== null) {
        return { ...base, resolvedDecimalPlaces: fromActiveSymbol, source: 'active-symbol' };
    }

    return { ...base, resolvedDecimalPlaces: null, source: 'unresolved' };
}

export const UNRESOLVED_PRECISION: PrecisionState = {
    activeSymbolPipIncrement: null,
    historyDecimalPlaces: null,
    liveDecimalPlaces: null,
    resolvedDecimalPlaces: null,
    source: 'unresolved',
};
