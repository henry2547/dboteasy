/**
 * Deriv Digits Analysis Lab — Market Classification
 *
 * Classifies active symbols into friendly categories using API metadata
 * with name-based fallback matching.
 */

import type { MarketCategory, MarketSymbol } from './types';

interface RawActiveSymbol {
    underlying_symbol?: string;
    symbol?: string;
    underlying_symbol_name?: string;
    display_name?: string;
    underlying_symbol_type?: string;
    symbol_type?: string;
    market?: string;
    subgroup?: string;
    submarket?: string;
    pip_size?: number;
    exchange_is_open?: number;
    is_trading_suspended?: number;
}

export function classifyMarket(raw: RawActiveSymbol): MarketCategory {
    const name = (raw.underlying_symbol_name ?? raw.display_name ?? '').toLowerCase();
    const submarket = (raw.submarket ?? '').toLowerCase();
    const subgroup = (raw.subgroup ?? '').toLowerCase();
    const symbolType = (raw.underlying_symbol_type ?? raw.symbol_type ?? '').toLowerCase();
    const apiSymbol = (raw.underlying_symbol ?? raw.symbol ?? '').toLowerCase();

    // 1-Second Volatility Indices
    if (name.includes('1s ') || apiSymbol.includes('1s ') || name.includes('1-second') || apiSymbol.startsWith('1s')) {
        return '1-Second Volatility Indices';
    }

    // Boom and Crash
    if (name.includes('boom') || name.includes('crash') || apiSymbol.includes('boom') || apiSymbol.includes('crash')) {
        return 'Boom and Crash Indices';
    }

    // Step Indices
    if (name.includes('step') || submarket.includes('step') || apiSymbol.includes('stp')) {
        return 'Step Indices';
    }

    // Jump Indices
    if (name.includes('jump') || submarket.includes('jump') || apiSymbol.includes('jmp')) {
        return 'Jump Indices';
    }

    // Range Break Indices
    if (name.includes('range') || submarket.includes('range') || apiSymbol.includes('rng')) {
        return 'Range Break Indices';
    }

    // Volatility Indices (most common synthetic)
    if (
        name.includes('volatility') ||
        name.includes('vol ') ||
        submarket.includes('synthetic_index') ||
        apiSymbol.includes('r_') ||
        apiSymbol.includes('vol')
    ) {
        return 'Volatility Indices';
    }

    // Other synthetic indices
    if (submarket.includes('synthetic') || symbolType.includes('synthetic')) {
        return 'Other Synthetic Indices';
    }

    return 'Other Markets';
}

export function normalizeMarket(raw: RawActiveSymbol): MarketSymbol | null {
    const apiSymbol = raw.underlying_symbol ?? raw.symbol;
    const displayName = raw.underlying_symbol_name ?? raw.display_name;

    if (!apiSymbol || !displayName) return null;

    const pipSize = raw.pip_size ?? null;
    const isOpen = raw.exchange_is_open === 1;
    const isSuspended = raw.is_trading_suspended === 1;

    let availability: MarketSymbol['availability'] = 'available';
    if (isSuspended) availability = 'suspended';
    else if (!isOpen) availability = 'closed';

    return {
        apiSymbol,
        displayName,
        symbolType: raw.underlying_symbol_type ?? raw.symbol_type ?? null,
        market: raw.market ?? null,
        submarket: raw.submarket ?? null,
        subgroup: raw.subgroup ?? null,
        category: classifyMarket(raw),
        pipSize,
        decimalPlaces: null,
        isOpen,
        isSuspended,
        availability,
    };
}

export function normalizeActiveSymbols(rawList: RawActiveSymbol[]): MarketSymbol[] {
    const normalized = rawList
        .map(normalizeMarket)
        .filter((m): m is MarketSymbol => m !== null);

    // Sort by category then alphabetically by display name
    const categoryOrder: MarketCategory[] = [
        '1-Second Volatility Indices',
        'Volatility Indices',
        'Step Indices',
        'Jump Indices',
        'Range Break Indices',
        'Boom and Crash Indices',
        'Other Synthetic Indices',
        'Other Markets',
    ];

    return normalized.sort((a, b) => {
        const catA = categoryOrder.indexOf(a.category);
        const catB = categoryOrder.indexOf(b.category);
        if (catA !== catB) return catA - catB;
        return a.displayName.localeCompare(b.displayName);
    });
}
