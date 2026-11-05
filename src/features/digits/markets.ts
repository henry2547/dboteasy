/**
 * Normalisation and grouping for the `active_symbols` response.
 *
 * New API field names are canonical; legacy aliases are read only here so the
 * rest of the app never sees them.
 */

import { decimalsFromPipIncrement } from './precision';
import type { MarketAvailability, MarketSymbol } from './types';

export const MARKET_CATEGORY_ORDER = [
    '1-Second Volatility Indices',
    'Volatility Indices',
    'Step Indices',
    'Jump Indices',
    'Range Break Indices',
    'Boom and Crash Indices',
    'Other Synthetic Indices',
    'Other Markets',
];

type RawSymbol = Record<string, unknown>;

function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function classifyMarket(raw: RawSymbol): string {
    const haystack = [
        str(raw.underlying_symbol_name ?? raw.display_name),
        str(raw.underlying_symbol ?? raw.symbol),
        str(raw.submarket),
        str(raw.subgroup),
    ]
        .join(' ')
        .toLowerCase();

    const market = str(raw.market).toLowerCase();

    if (/\(1s\)|1hz|1 second|one second/.test(haystack)) return '1-Second Volatility Indices';
    if (haystack.includes('step')) return 'Step Indices';
    if (haystack.includes('jump')) return 'Jump Indices';
    if (haystack.includes('range break')) return 'Range Break Indices';
    if (haystack.includes('boom') || haystack.includes('crash')) return 'Boom and Crash Indices';
    if (haystack.includes('volatility')) return 'Volatility Indices';
    if (market.includes('synthetic')) return 'Other Synthetic Indices';
    return 'Other Markets';
}

export function normalizeMarketSymbol(raw: RawSymbol): MarketSymbol | null {
    const apiSymbol = raw.underlying_symbol ?? raw.symbol;
    const displayName = raw.underlying_symbol_name ?? raw.display_name;

    if (typeof apiSymbol !== 'string' || !apiSymbol.trim()) return null;
    if (typeof displayName !== 'string' || !displayName.trim()) return null;

    const symbolType = raw.underlying_symbol_type ?? raw.symbol_type;
    const pipSizeRaw = raw.pip_size ?? raw.pip;
    const pipSize = pipSizeRaw === null || pipSizeRaw === undefined ? null : Number(pipSizeRaw);
    const isOpen = Number(raw.exchange_is_open ?? 0) === 1;
    const isSuspended = Number(raw.is_trading_suspended ?? 0) === 1;

    const availability: MarketAvailability = isSuspended ? 'suspended' : isOpen ? 'available' : 'closed';

    return {
        apiSymbol: apiSymbol.trim(),
        displayName: displayName.trim(),
        symbolType: typeof symbolType === 'string' ? symbolType : null,
        market: typeof raw.market === 'string' ? raw.market : null,
        subgroup: typeof raw.subgroup === 'string' ? raw.subgroup : null,
        submarket: typeof raw.submarket === 'string' ? raw.submarket : null,
        category: classifyMarket(raw),
        pipSize: pipSize !== null && Number.isFinite(pipSize) ? pipSize : null,
        decimalPlaces: pipSize !== null && Number.isFinite(pipSize) ? decimalsFromPipIncrement(pipSize) : null,
        isOpen,
        isSuspended,
        availability,
    };
}

export function normalizeActiveSymbols(payload: unknown): MarketSymbol[] {
    if (!Array.isArray(payload)) return [];

    const seen = new Set<string>();
    const normalized: MarketSymbol[] = [];

    payload.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        const market = normalizeMarketSymbol(entry as RawSymbol);
        if (!market || seen.has(market.apiSymbol)) return;
        seen.add(market.apiSymbol);
        normalized.push(market);
    });

    return normalized;
}

export interface MarketGroup {
    category: string;
    markets: MarketSymbol[];
}

export function groupMarkets(markets: MarketSymbol[]): MarketGroup[] {
    const byCategory = new Map<string, MarketSymbol[]>();

    markets.forEach(market => {
        const list = byCategory.get(market.category) ?? [];
        list.push(market);
        byCategory.set(market.category, list);
    });

    return MARKET_CATEGORY_ORDER.filter(category => byCategory.has(category)).map(category => ({
        category,
        markets: (byCategory.get(category) ?? []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
}

/**
 * The Digits lab only trades the digit-friendly market families, so everything
 * else (step, jump, boom/crash, range break) stays out of the picker and the
 * scanner.
 */
export const DIGIT_MARKET_CATEGORIES = ['1-Second Volatility Indices', 'Volatility Indices'];

export function isDigitMarket(market: MarketSymbol): boolean {
    return DIGIT_MARKET_CATEGORIES.includes(market.category);
}

export function filterDigitMarkets(markets: MarketSymbol[]): MarketSymbol[] {
    return markets.filter(isDigitMarket);
}

/** Picks a sensible default market: the classic R_100 volatility index, else any open synthetic. */
export function pickDefaultMarket(markets: MarketSymbol[]): MarketSymbol | null {
    const preferred = markets.find(market => market.apiSymbol === 'R_100' && market.isOpen);
    if (preferred) return preferred;

    const openVolatility = markets.find(
        market => market.category === 'Volatility Indices' && market.isOpen && !market.isSuspended
    );
    if (openVolatility) return openVolatility;

    return markets.find(market => market.isOpen && !market.isSuspended) ?? markets[0] ?? null;
}
