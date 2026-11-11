import { useMemo } from 'react';
import { AI_BOT_DEFINITIONS, aiBotById } from './catalog';
import AiBotCard from './components/ai-bot-card';
import LiveMarketScan from './components/live-market-scan';
import ScannerFields from './components/scanner-fields';
import TradingRule from './components/trading-rule';
import { RESCAN_INTERVAL_MS } from './ai-bot-session';
import { buildInsights, countSignals } from './signals';
import { useAiBotSession } from './use-ai-bot-session';
import type { AiBotSettings } from './types';
import './ai-bots.scss';

const STATUS_LABEL = {
    idle: 'Scanner idle',
    scanning: 'Scanner live',
    ready: 'Scanner ready',
    error: 'Scanner error',
} as const;

/**
 * AI Bots tab — two digit bots (Even-Odd and Rise-Fall) configured and run from
 * one dark console. While a bot is running the public market scan re-reads every
 * open volatility market every few seconds, and a signal it confirms buys that
 * contract through the app's authorized account. The purchases land in the Bot
 * Builder's Summary, Transactions and Journal, like any other run.
 *
 * The run itself lives in `ai-bot-session.ts`, so it keeps going when this tab
 * is closed.
 */
const AiBotsPage = () => {
    const {
        activeBot: activeId,
        settings,
        status,
        running,
        rows,
        progress,
        error,
        run,
        openBot,
        closeBot,
        start,
        stop,
        updateSettings,
    } = useAiBotSession();

    // A market picked from an earlier scan that this scan did not reach falls back to all markets,
    // so the list can never go quietly empty behind a stale selection.
    const botSettings: AiBotSettings | null = activeId
        ? {
              ...settings[activeId],
              marketScope:
                  settings[activeId].marketScope === 'all' ||
                  rows.some(row => row.symbol === settings[activeId].marketScope)
                      ? settings[activeId].marketScope
                      : 'all',
          }
        : null;

    const insights = useMemo(
        () => (activeId && botSettings ? buildInsights(activeId, rows, botSettings) : []),
        [activeId, botSettings?.marketScope, botSettings?.ticks, rows]
    );
    const signals = countSignals(insights);

    if (!activeId || !botSettings) {
        return (
            <div className='ai-bots'>
                <header className='ai-bots__hero'>
                    <div>
                        <h2 className='ai-bots__title'>AI bots</h2>
                        <p className='ai-bots__subtitle'>
                            Digit bots that scan every volatility market on the public feed and buy the contract their
                            rule confirms.
                        </p>
                    </div>
                </header>

                <div className='ai-bots__grid'>
                    {AI_BOT_DEFINITIONS.map(bot => (
                        <AiBotCard key={bot.id} bot={bot} onOpen={openBot} />
                    ))}
                </div>

                <p className='ai-bots__disclaimer'>
                    A bot reads ticks already seen and trades the signal it confirms; every purchase shows in the Bot
                    Builder's Summary, Transactions and Journal. Test any setup on a Demo account first.
                </p>
            </div>
        );
    }

    const bot = aiBotById(activeId);

    return (
        <div className='ai-bots'>
            <header className='ai-bots__top'>
                <button type='button' className='ai-bots__back' onClick={closeBot}>
                    <span aria-hidden='true'>←</span> Strategies
                </button>
                <span className={`ai-bots__status ai-bots__status--${status}`}>
                    <span className='ai-bots__status-dot' aria-hidden='true' />
                    {STATUS_LABEL[status]}
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
                    className={`ai-setup__start${running ? ' ai-setup__start--stop' : ''}`}
                    onClick={() => (running ? stop() : start())}
                >
                    {running ? 'STOP AI BOT' : 'START AI BOT'}
                </button>

                {running && (
                    <p className='ai-setup__live'>
                        Live · rescans every {Math.round(RESCAN_INTERVAL_MS / 1000)}s · {run.trades}{' '}
                        {run.trades === 1 ? 'trade' : 'trades'} · P/L {run.profit.toFixed(2)}
                        {run.openContracts > 0 ? ` · ${run.openContracts} open` : ''}
                    </p>
                )}

                <TradingRule botId={activeId} ticks={botSettings.ticks} />

                <ScannerFields
                    settings={botSettings}
                    rows={rows}
                    onChange={patch => updateSettings(activeId, patch)}
                />
            </section>

            <LiveMarketScan
                insights={insights}
                status={status}
                running={running}
                progress={progress}
                error={error}
                ticks={botSettings.ticks}
                signals={signals}
            />

            <p className='ai-bots__disclaimer'>
                Buys the contract its rule confirms with the stake, ticks, take profit, stop loss and martingale above.
                Purchases appear in the Bot Builder's Summary, Transactions and Journal.
            </p>
        </div>
    );
};

export default AiBotsPage;
