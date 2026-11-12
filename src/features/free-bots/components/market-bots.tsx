import { AI_BOT_DEFINITIONS } from '@/features/ai-bots/catalog';
import { useAiBotSession } from '@/features/ai-bots/use-ai-bot-session';
import type { AiBotId, AiBotSettings } from '@/features/ai-bots/types';
import type { MarketSymbol } from '@/features/digits/types';

interface MarketBotsProps {
    market: MarketSymbol | null;
    connected: boolean;
}

const FIELDS: { key: keyof Pick<AiBotSettings, 'stake' | 'takeProfit' | 'stopLoss'>; label: string }[] = [
    { key: 'stake', label: 'Stake' },
    { key: 'takeProfit', label: 'Take profit' },
    { key: 'stopLoss', label: 'Stop loss' },
];

/**
 * The two single-market Free Bots. They run the exact rules of the AI Bots tab
 * (Even-Odd and Rise-Fall) on the volatility market chosen above, through the
 * same purchase path — but nothing is scanned: this market is the only one read.
 */
export default function MarketBots({ market, connected }: MarketBotsProps) {
    const { settings, running, activeBot, onlySymbol, run, status, startMarket, stop, updateSettings } =
        useAiBotSession();

    const set = (id: AiBotId, patch: Partial<AiBotSettings>) => updateSettings(id, patch);

    return (
        <section className='free-bots__library'>
            <h3 className='free-bots__section-title'>3. Run a bot on this market</h3>
            <p className='free-bots__market-bots-note'>
                Same rules as the AI Bots tab, one market only — the market you picked above. No multi-market scanner.
                Every contract runs for 1 tick.
            </p>

            <div className='free-bots__grid'>
                {AI_BOT_DEFINITIONS.map(bot => {
                    const botSettings = settings[bot.id];
                    const isThisRun = running && activeBot === bot.id && onlySymbol === market?.apiSymbol;
                    const busyElsewhere = running && !isThisRun;

                    return (
                        <article className='market-bot' key={bot.id}>
                            <header className='market-bot__head'>
                                <h4 className='market-bot__name'>{bot.name}</h4>
                                <span className={`market-bot__state${isThisRun ? ' market-bot__state--live' : ''}`}>
                                    {isThisRun ? 'Running' : 'Idle'}
                                </span>
                            </header>

                            <p className='market-bot__tagline'>{bot.tagline}</p>
                            <p className='market-bot__summary'>{bot.summary}</p>

                            <div className='market-bot__fields'>
                                {FIELDS.map(field => (
                                    <label className='market-bot__field' key={field.key}>
                                        <span className='market-bot__field-label'>{field.label}</span>
                                        <input
                                            className='market-bot__input'
                                            type='number'
                                            inputMode='decimal'
                                            min='0'
                                            step='any'
                                            value={botSettings[field.key]}
                                            onChange={event => {
                                                const value = Number(event.target.value);
                                                set(bot.id, {
                                                    [field.key]: Number.isFinite(value) ? value : 0,
                                                } as Partial<AiBotSettings>);
                                            }}
                                        />
                                    </label>
                                ))}
                            </div>

                            <p className='market-bot__market'>
                                {market ? market.displayName : 'Pick a volatility market first'}
                            </p>

                            <button
                                type='button'
                                className={`market-bot__start${isThisRun ? ' market-bot__start--stop' : ''}`}
                                disabled={!market || !connected || busyElsewhere}
                                onClick={() => (isThisRun ? stop() : market && startMarket(bot.id, market.apiSymbol))}
                            >
                                {isThisRun ? 'STOP BOT' : 'START BOT'}
                            </button>

                            {isThisRun && (
                                <p className='market-bot__live'>
                                    {status === 'scanning' ? 'Reading the market' : 'Live'} · {run.trades}{' '}
                                    {run.trades === 1 ? 'trade' : 'trades'} · P/L {run.profit.toFixed(2)}
                                    {run.openContracts > 0 ? ` · ${run.openContracts} open` : ''}
                                </p>
                            )}

                            {busyElsewhere && (
                                <p className='market-bot__note'>Stop the bot that is already running to start this one.</p>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
