import type { MarketSymbol } from '@/pages/digits/types';
import type { MarketSupport } from '../market-support';
import type { FreeBotTemplate } from '../templates';

interface FreeBotCardProps {
    template: FreeBotTemplate;
    market: MarketSymbol | null;
    support: MarketSupport;
    loading: boolean;
    isRunning: boolean;
    errorMessage: string | null;
    onLoad: () => void;
}

/**
 * One bot in the library. Every value shown comes from the template that the
 * XML asset is checked against, and the market line makes clear that the
 * template's own market is only a default.
 */
export default function FreeBotCard({
    template,
    market,
    support,
    loading,
    isRunning,
    errorMessage,
    onLoad,
}: FreeBotCardProps) {
    const rows: [string, string][] = [
        ['Strategy', template.strategyLabel],
        ['Entry trigger', template.entryRule],
        ['Contract', `${template.contractType} · prediction ${template.prediction}`],
        ['Duration', `${template.durationTicks} tick`],
        ['Default market in the XML', `${template.defaultMarket} — replaced by the market you pick`],
        ['Initial stake', `${template.stake} USD`],
        ['Take profit', `${template.takeProfit} USD`],
        ['Stop loss', `${template.stopLoss} USD`],
        ['Martingale multiplier', `×${template.multiplier}`],
        ['After purchase', template.afterPurchase],
    ];

    const marketLine = market
        ? `${market.displayName} (${market.apiSymbol})`
        : 'No market selected — pick one above';

    const blocked = loading || isRunning || !support.supported || !market;

    const blockReason = loading
        ? 'Loading the bot…'
        : isRunning
          ? 'A bot is already running — stop it before loading another.'
          : !market
            ? 'Select a volatility market to load this bot.'
            : !support.supported
              ? support.reason
              : '';

    return (
        <article className='free-bot-card' aria-label={template.name}>
            <header className='free-bot-card__head'>
                <h3 className='free-bot-card__name'>{template.name}</h3>
                <span className='free-bot-card__tag'>{template.strategyLabel}</span>
            </header>

            <dl className='free-bot-card__settings'>
                {rows.map(([label, value]) => (
                    <div className='free-bot-card__row' key={label}>
                        <dt className='free-bot-card__label'>{label}</dt>
                        <dd className='free-bot-card__value'>{value}</dd>
                    </div>
                ))}
            </dl>

            <p className='free-bot-card__market'>
                Will be loaded on: <strong>{marketLine}</strong>
            </p>

            <p className='free-bot-card__source'>Template file: {template.sourceFile}</p>

            <p className='free-bot-card__note'>
                These are the XML defaults, not guaranteed profitable settings. Every value stays editable in the Bot
                Builder after loading.
            </p>

            <button
                type='button'
                className='free-bot-card__load'
                onClick={onLoad}
                disabled={blocked}
                title={blockReason || `Load ${template.name} into the Bot Builder`}
            >
                {loading ? 'Loading…' : 'Load in Bot Builder'}
            </button>

            {blockReason && <p className='free-bot-card__blocked'>{blockReason}</p>}
            {errorMessage && <p className='free-bot-card__error'>{errorMessage}</p>}
        </article>
    );
}
