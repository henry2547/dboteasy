import { useMemo, useState } from 'react';
import { AI_BOT_DEFINITIONS, AI_BOT_SETTINGS, aiBotById } from './catalog';
import AiBotCard from './components/ai-bot-card';
import LiveMarketScan from './components/live-market-scan';
import ScannerFields from './components/scanner-fields';
import TradingRule from './components/trading-rule';
import { buildInsights, countSignals } from './signals';
import { useAiBotScan } from './use-ai-bot-scan';
import type { AiBotId, AiBotSettings } from './types';
import './ai-bots.scss';

const STATUS_LABEL = {
    idle: 'Scanner idle',
    scanning: 'Scanner live',
    ready: 'Scanner ready',
    error: 'Scanner error',
} as const;

/**
 * AI Bots tab — two digit bots (Even-Odd and Rise-Fall) configured and scanned
 * from one dark console. The scan reads every open volatility market on the
 * public feed and the selected bot's rule marks the markets it would trade; no
 * order is placed from here.
 */
const AiBotsPage = () => {
    const [activeId, setActiveId] = useState<AiBotId | null>(null);
    const [settings, setSettings] = useState<Record<AiBotId, AiBotSettings>>(AI_BOT_SETTINGS);
    const scan = useAiBotScan();

    const updateSettings = (id: AiBotId, patch: Partial<AiBotSettings>) => {
        setSettings(current => ({ ...current, [id]: { ...current[id], ...patch } }));
    };

    // A market picked from an earlier scan that this scan did not reach falls back to all markets,
    // so the list can never go quietly empty behind a stale selection.
    const botSettings: AiBotSettings | null = activeId
        ? {
              ...settings[activeId],
              marketScope:
                  settings[activeId].marketScope === 'all' ||
                  scan.rows.some(row => row.symbol === settings[activeId].marketScope)
                      ? settings[activeId].marketScope
                      : 'all',
          }
        : null;

    const insights = useMemo(
        () => (activeId && botSettings ? buildInsights(activeId, scan.rows, botSettings) : []),
        [activeId, botSettings?.marketScope, botSettings?.ticks, scan.rows]
    );
    const signals = countSignals(insights);

    if (!activeId || !botSettings) {
        return (
            <div className='ai-bots'>
                <header className='ai-bots__hero'>
                    <div>
                        <h2 className='ai-bots__title'>AI bots</h2>
                        <p className='ai-bots__subtitle'>
                            Digit bots that scan every volatility market on the public feed and flag the markets their
                            rule would trade.
                        </p>
                    </div>
                </header>

                <div className='ai-bots__grid'>
                    {AI_BOT_DEFINITIONS.map(bot => (
                        <AiBotCard key={bot.id} bot={bot} onOpen={setActiveId} />
                    ))}
                </div>

                <p className='ai-bots__disclaimer'>
                    The scanner only reads ticks already seen — it never predicts the next one and never places a trade.
                    Test any setup on a Demo account first.
                </p>
            </div>
        );
    }

    const bot = aiBotById(activeId);
    const scanning = scan.status === 'scanning';

    return (
        <div className='ai-bots'>
            <header className='ai-bots__top'>
                <button type='button' className='ai-bots__back' onClick={() => setActiveId(null)}>
                    <span aria-hidden='true'>←</span> Strategies
                </button>
                <span className={`ai-bots__status ai-bots__status--${scan.status}`}>
                    <span className='ai-bots__status-dot' aria-hidden='true' />
                    {STATUS_LABEL[scan.status]}
                </span>
            </header>

            <div className='ai-bots__heading'>
                <h2 className='ai-bots__title'>{bot.name}</h2>
                <p className='ai-bots__subtitle'>{bot.tagline}</p>
            </div>

            <section className='ai-setup' aria-label='Scanner setup'>
                <div className='ai-setup__head'>
                    <h3 className='ai-setup__heading'>
                        <span className='ai-setup__dot' aria-hidden='true' />
                        Scanner setup
                    </h3>
                    <span className='ai-setup__kicker'>Configure entry confirmation</span>
                </div>

                <button
                    type='button'
                    className={`ai-setup__start${scanning ? ' ai-setup__start--stop' : ''}`}
                    onClick={() => (scanning ? scan.stop() : void scan.start())}
                >
                    {scanning ? 'STOP AI SCANNER' : 'START AI SCANNER'}
                </button>

                <TradingRule botId={activeId} ticks={botSettings.ticks} />

                <ScannerFields
                    settings={botSettings}
                    rows={scan.rows}
                    onChange={patch => updateSettings(activeId, patch)}
                />
            </section>

            <LiveMarketScan
                insights={insights}
                status={scan.status}
                progress={scan.progress}
                error={scan.error}
                ticks={botSettings.ticks}
                signals={signals}
            />

            <p className='ai-bots__disclaimer'>
                Reads public market data only. Stake, take profit, stop loss and martingale describe the setup; no order is
                placed from this tab.
            </p>
        </div>
    );
};

export default AiBotsPage;
