/**
 * Free Bots library — the digit-contract templates that ship with the app.
 *
 * The Botly XML assets in `src/xml/` are the source of truth for each bot's
 * logic; this module only *describes* them so the library UI can show the
 * settings, and `bot-xml.ts` re-reads the asset before anything is loaded into
 * the Bot Builder — a card never shows a value the XML does not carry.
 *
 * The two assets were built from the two uploaded strategy files
 * ("Over 1 with Entry every time.xml" / "Under 8 with Entry every time.xml");
 * `sourceFile` records that origin.
 */

import over1EntryEveryTimeXml from '@/xml/over1_entry_every_time.xml';
import under8EntryEveryTimeXml from '@/xml/under8_entry_every_time.xml';

export type FreeBotId = 'over1_entry_every_time' | 'under8_entry_every_time';
export type FreeBotStrategy = 'over1' | 'under8';

export interface FreeBotTemplate {
    id: FreeBotId;
    name: string;
    /** Uploaded XML the template was taken from. */
    sourceFile: string;
    /** Asset under `src/xml/` that is loaded into the Bot Builder. */
    asset: string;
    strategy: FreeBotStrategy;
    /** Scanner/strategy label, e.g. "Digit Over". */
    strategyLabel: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    prediction: number;
    durationTicks: number;
    /** Symbol baked into the XML — replaced by the chosen market when loading. */
    defaultMarket: string;
    stake: number;
    takeProfit: number;
    stopLoss: number;
    multiplier: number;
    entryOperator: 'LTE' | 'GTE';
    triggerDigit: number;
    entryRule: string;
    afterPurchase: string;
}

export const FREE_BOT_TEMPLATES: FreeBotTemplate[] = [
    {
        id: 'over1_entry_every_time',
        name: 'Over 1 — Entry Every Time',
        sourceFile: 'Over 1 with Entry every time.xml',
        asset: 'over1_entry_every_time.xml',
        strategy: 'over1',
        strategyLabel: 'Digit Over',
        contractType: 'DIGITOVER',
        prediction: 1,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 1.5,
        entryOperator: 'LTE',
        triggerDigit: 1,
        entryRule: 'Last digit is less than or equal to 1 (0 or 1)',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 1.5 · stops at +10 / −20',
    },
    {
        id: 'under8_entry_every_time',
        name: 'Under 8 — Entry Every Time',
        sourceFile: 'Under 8 with Entry every time.xml',
        asset: 'under8_entry_every_time.xml',
        strategy: 'under8',
        strategyLabel: 'Digit Under',
        contractType: 'DIGITUNDER',
        prediction: 8,
        durationTicks: 1,
        defaultMarket: '1HZ25V',
        stake: 10,
        takeProfit: 10,
        stopLoss: 20,
        multiplier: 2,
        entryOperator: 'GTE',
        triggerDigit: 8,
        entryRule: 'Last digit is greater than or equal to 8 (8 or 9)',
        afterPurchase: 'Win → stake back to 10 · Loss → stake × 2 · stops at +10 / −20',
    },
];

const FREE_BOT_XML: Record<FreeBotId, string> = {
    over1_entry_every_time: over1EntryEveryTimeXml,
    under8_entry_every_time: under8EntryEveryTimeXml,
};

export function freeBotById(id: string | null | undefined): FreeBotTemplate | null {
    return FREE_BOT_TEMPLATES.find(template => template.id === id) ?? null;
}

export function freeBotForStrategy(strategy: FreeBotStrategy | null | undefined): FreeBotTemplate | null {
    return FREE_BOT_TEMPLATES.find(template => template.strategy === strategy) ?? null;
}

/** The untouched template XML — the Free Bots asset is never edited in place. */
export function freeBotXml(template: FreeBotTemplate): string {
    return FREE_BOT_XML[template.id] ?? '';
}
