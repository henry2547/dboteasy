import type { AiBotId, AiBotSettings } from './types';

export interface AiBotDefinition {
    id: AiBotId;
    name: string;
    tagline: string;
    /** One-line rule shown on the strategy card. */
    summary: string;
}

export const AI_BOT_DEFINITIONS: AiBotDefinition[] = [
    {
        id: 'even_odd',
        name: 'Even-Odd AI',
        tagline: 'Both cold and hot digits on the same parity trigger that parity.',
        summary: 'Hot and cold digits share a parity · the last digit shows either one · trade that parity.',
    },
    {
        id: 'rise_fall',
        name: 'Rise-Fall AI',
        tagline: 'A rising run triggers Fall. A falling run triggers Rise.',
        summary: 'Last 5 ticks continuously rising → Fall · continuously falling → Rise.',
    },
];

export const AI_BOT_SETTINGS: Record<AiBotId, AiBotSettings> = {
    even_odd: {
        marketScope: 'all',
        stake: 0.5,
        ticks: 5,
        takeProfit: 5,
        stopLoss: 30,
        martingale: 2,
    },
    rise_fall: {
        marketScope: 'all',
        stake: 0.5,
        ticks: 5,
        takeProfit: 5,
        stopLoss: 30,
        martingale: 2,
    },
};

export const aiBotById = (id: AiBotId): AiBotDefinition =>
    AI_BOT_DEFINITIONS.find(bot => bot.id === id) ?? AI_BOT_DEFINITIONS[0];
