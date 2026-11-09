/**
 * What's New copy shown inside the hamburger drawer. One entry per shipped change, newest first —
 * keep every line describing something the app really does, and add the new entry at the top.
 */

export interface WhatsNewEntry {
    title: string;
    body: string;
}

export const WHATS_NEW_RELEASE = '0.6.0';

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
    {
        title: 'Continuous or single trading mode',
        body: 'Every free bot now carries a mode. Continuous keeps trading after an entry is confirmed — several trades until the take profit, a loss or the stop loss ends the run, then it waits for the next entry. Single takes one trade per entry and waits for the next signal. The mode shows on every bot card and in the Bot Builder’s Trade parameters block.',
    },
    {
        title: 'Market scan on 1,000 ticks',
        body: 'The floating Scan markets button reads 1,000 ticks on every open volatility market, ranks them best first, and lists each result with its score, rule, scan time and a Load bot button.',
    },
    {
        title: 'Load the bot the digits qualify',
        body: 'Every scanned market is matched against bot 8 (Over 1) and bot 9 (Under 8). Load bot opens that template in the Bot Builder on the scanned market, and a backtest walks the same ticks so you can see what the rule would have done.',
    },
    {
        title: 'AI Builder',
        body: 'Describe the bot you want in plain words on the AI Builder tab — it assembles it from real palette blocks, checks it, and loads it into the Bot Builder.',
    },
    {
        title: 'Observer blocks in the Bot Builder',
        body: 'Digit frequency, pattern detection, parity and entry blocks now sit in the Bot Builder palette, with a Blocks help guide in this menu.',
    },
    {
        title: 'More digit analytics',
        body: 'The Digits tab adds a velocity matrix, entropy tracker, latency guard, scattergram and a zero-lookahead walk-forward test.',
    },
    {
        title: 'What’s New and Contact us',
        body: 'Two new rows in this menu: release notes live here, and Contact us carries my GitHub, email and WhatsApp.',
    },
];
