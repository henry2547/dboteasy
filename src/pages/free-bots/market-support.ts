/**
 * Digit-contract support for a discovered market.
 *
 * Digit Over/Under contracts are only offered on Deriv's synthetic volatility
 * indices; the feed describes them with `submarket: 'random_index'` and a
 * volatility/1-second-volatility symbol name. This is the app-side pre-check
 * that keeps a market the bot cannot trade from ever reaching the Bot Builder —
 * the authoritative answer stays with Deriv's own contract list.
 */

import type { MarketSymbol } from '@/pages/digits/types';

export interface MarketSupport {
    supported: boolean;
    reason: string;
}

export function supportsDigitContracts(market: MarketSymbol | null | undefined): MarketSupport {
    if (!market) {
        return { supported: false, reason: 'Select a volatility market before loading a bot.' };
    }

    if (market.isSuspended) {
        return { supported: false, reason: `${market.displayName} is suspended by Deriv right now.` };
    }

    if (!market.isOpen) {
        return { supported: false, reason: `${market.displayName} is currently closed.` };
    }

    const isSyntheticVolatility =
        market.submarket === 'random_index' ||
        market.category === '1-Second Volatility Indices' ||
        market.category === 'Volatility Indices';

    if (!isSyntheticVolatility) {
        return {
            supported: false,
            reason: `${market.displayName} does not offer Digit Over/Under contracts — pick a volatility index.`,
        };
    }

    return { supported: true, reason: `${market.displayName} (${market.apiSymbol}) offers Digit Over/Under.` };
}
