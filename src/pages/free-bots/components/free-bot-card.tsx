import { memo, useState } from 'react';
import type { MarketSymbol } from '@/pages/digits/types';
import type { MarketSupport } from '../market-support';
import type { FreeBotTemplate } from '../templates';

interface FreeBotCardProps {
    /** Position of the bot in the library, shown as its number. */
    index: number;
    template: FreeBotTemplate;
    market: MarketSymbol | null;
    support: MarketSupport;
    loading: boolean;
    isRunning: boolean;
    errorMessage: string | null;
    onLoad: (template: FreeBotTemplate) => void;
}

/**
 * One bot in the library. Every value shown comes from the template that the
 * XML asset is checked against, and the market line makes clear that the
 * template's own market is only a default.
 *
 * The card starts collapsed to just the bot's name, so the library stays short
 * and several bots fit on one screen; the header toggles the rest open.
 */
function FreeBotCard({
    index,
    template,
    market,
    support,
    loading,
    isRunning,
    errorMessage,
    onLoad,
}: FreeBotCardProps) {
    const [isOpen, setIsOpen] = useState(false);
    const detailsId = `free-bot-${template.id}-details`;

    const rows: [string, string][] = [
        ['Strategy', template.strategyLabel],
        [
            'Contract',
            template.parityRecovery
                ? `${template.primaryContractType ?? template.contractType} ${template.parityRecovery.barrier} → DIGITEVEN / DIGITODD after a loss`
                : template.prediction !== null
                  ? `${template.contractType} · prediction ${template.prediction}`
                  : template.entryParity === 'both'
                    ? 'DIGITEVEN / DIGITODD · the signal picks the parity'
                    : `${template.contractType} · ${template.entryParity ?? 'parity'} digits`,
        ],
        ...(template.parityRecovery
            ? ([
                  [
                      'Recovery',
                      `Even/Odd after a loss — ${
                          template.parityRecovery.parity === 'both'
                              ? 'the newest digits all even → ODD, all odd → EVEN'
                              : template.parityRecovery.parity.toUpperCase()
                      } on the market it is already trading`,
                  ],
              ] as [string, string][])
            : []),
        ['Duration', `${template.durationTicks} tick`],
        [
            template.marketScan ? 'Starting market in the XML' : 'Default market in the XML',
            template.marketScan
                ? `${template.defaultMarket} — the bot measures every volatility market itself and moves to the best one`
                : `${template.defaultMarket} — replaced by the market you pick`,
        ],
        ['Initial stake', `${template.stake} USD`],
        ['Take profit', `${template.takeProfit} USD`],
        ['Stop loss', `${template.stopLoss} USD`],
        ['Martingale multiplier', `×${template.multiplier}`],
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
            <h3 className='free-bot-card__name'>
                <button
                    type='button'
                    className='free-bot-card__toggle'
                    onClick={() => setIsOpen(open => !open)}
                    aria-expanded={isOpen}
                    aria-controls={detailsId}
                >
                    <span className='free-bot-card__headline'>
                        <span className='free-bot-card__number'>{index}</span>
                        <span>{template.name}</span>
                    </span>
                    <span className='free-bot-card__caret' aria-hidden='true'>
                        {isOpen ? '▲' : '▼'}
                    </span>
                </button>
            </h3>

            {isOpen && (
                <div className='free-bot-card__body' id={detailsId}>
                    <div className='free-bot-card__head'>
                        <span className='free-bot-card__tag'>{template.strategyLabel}</span>
                    </div>

                    <p className='free-bot-card__rule free-bot-card__rule--buy'>
                        <span className='free-bot-card__rule-label'>Buys when</span>
                        {template.buyCondition}
                    </p>

                    <p className='free-bot-card__rule free-bot-card__rule--restart'>
                        <span className='free-bot-card__rule-label'>Trades again when</span>
                        {template.restartCondition}
                    </p>

                    <p className='free-bot-card__blocks'>Blocks used: {template.blocksUsed}</p>

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
                        These are the XML defaults, not guaranteed profitable settings. Every value stays editable in
                        the Bot Builder after loading.
                    </p>

                    <button
                        type='button'
                        className='free-bot-card__load'
                        onClick={() => onLoad(template)}
                        disabled={blocked}
                        title={blockReason || `Load ${template.name} into the Bot Builder`}
                    >
                        {loading ? 'Loading…' : 'Load in Bot Builder'}
                    </button>

                    {blockReason && <p className='free-bot-card__blocked'>{blockReason}</p>}
                </div>
            )}

            {errorMessage && <p className='free-bot-card__error'>{errorMessage}</p>}
        </article>
    );
}

export default memo(FreeBotCard);
