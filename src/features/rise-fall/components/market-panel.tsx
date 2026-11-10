import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import type { TickFeed } from '../use-tick-feed';

interface MarketPanelProps {
    feed: TickFeed;
    disabled: boolean;
}

/** Market selection and the feed's own integrity report. */
const MarketPanel = ({ feed, disabled }: MarketPanelProps) => (
    <section className='rise-fall__section' data-testid='rise-fall-market-panel'>
        <div className='rise-fall__section-head'>
            <h3>{localize('Market & feed')}</h3>
            <span className='rise-fall__status'>{feed.connection.status}</span>
        </div>
        <select
            className='rise-fall__select'
            data-testid='rise-fall-market'
            aria-label={localize('Market')}
            value={feed.market?.apiSymbol ?? ''}
            disabled={disabled}
            onChange={event => feed.selectMarket(event.target.value)}
        >
            {feed.markets.length === 0 && <option value=''>{localize('Loading markets…')}</option>}
            {feed.markets.map(item => (
                <option key={item.apiSymbol} value={item.apiSymbol}>
                    {item.displayName}
                </option>
            ))}
        </select>
        <p
            className={classNames('rise-fall__note', { 'rise-fall__note--danger': !feed.integrity.healthy })}
            data-testid='rise-fall-integrity'
        >
            {feed.error
                ? feed.error
                : feed.integrity.healthy
                  ? `${feed.integrity.ticksAvailable} genuine ticks · ${localize('last tick')} ${
                        feed.integrity.lastTickAgeMs === null
                            ? '—'
                            : `${(feed.integrity.lastTickAgeMs / 1000).toFixed(1)}s`
                    } ${localize('ago')}`
                  : feed.integrity.issue}
        </p>
    </section>
);

export default MarketPanel;
