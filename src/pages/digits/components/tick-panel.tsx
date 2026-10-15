import { formatClock, formatCount } from '../format';
import type { ConnectionState, MarketSymbol, NormalizedTick, PrecisionState } from '../types';

interface TickPanelProps {
    market: MarketSymbol | null;
    currentTick: NormalizedTick | null;
    previousTick: NormalizedTick | null;
    direction: 'up' | 'down' | 'flat';
    precision: PrecisionState;
    tickCount: number;
    connection: ConnectionState;
    isLoadingHistory: boolean;
}

const DIRECTION_LABEL: Record<'up' | 'down' | 'flat', string> = {
    up: 'Rising',
    down: 'Falling',
    flat: 'Flat',
};

const DIRECTION_ARROW: Record<'up' | 'down' | 'flat', string> = {
    up: '▲',
    down: '▼',
    flat: '■',
};

export default function TickPanel({
    market,
    currentTick,
    previousTick,
    direction,
    precision,
    tickCount,
    connection,
    isLoadingHistory,
}: TickPanelProps) {
    return (
        <section className='digits-panel digits-tick'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Live tick</h3>
                <span className={`digits-status digits-status--${connection.status}`}>
                    {connection.status === 'connected' ? 'Live' : connection.status}
                    {connection.latencyMs !== null && connection.status === 'connected'
                        ? ` · ${connection.latencyMs} ms`
                        : ''}
                </span>
            </header>

            <p className='digits-tick__market'>
                {market ? market.displayName : 'No market selected'}
                {market ? <span className='digits-tick__symbol'>{market.apiSymbol}</span> : null}
            </p>

            <div className='digits-tick__grid'>
                <div className='digits-tick__quote'>
                    <span className='digits-tick__label'>Quote</span>
                    <span className='digits-tick__value'>
                        {currentTick ? currentTick.formattedQuote : isLoadingHistory ? '——' : '—'}
                    </span>
                </div>

                <div className='digits-tick__digit'>
                    <span className='digits-tick__label'>Last digit</span>
                    <span className='digits-tick__digit-value'>{currentTick ? currentTick.lastDigit : '—'}</span>
                </div>

                <div className='digits-tick__cell'>
                    <span className='digits-tick__label'>Previous digit</span>
                    <span className='digits-tick__cell-value'>{previousTick ? previousTick.lastDigit : '—'}</span>
                </div>

                <div className='digits-tick__cell'>
                    <span className='digits-tick__label'>Direction</span>
                    <span className={`digits-tick__cell-value digits-direction digits-direction--${direction}`}>
                        <span aria-hidden='true'>{DIRECTION_ARROW[direction]}</span> {DIRECTION_LABEL[direction]}
                    </span>
                </div>

                <div className='digits-tick__cell'>
                    <span className='digits-tick__label'>Tick time</span>
                    <span className='digits-tick__cell-value'>{currentTick ? formatClock(currentTick.epoch) : '—'}</span>
                </div>

                <div className='digits-tick__cell'>
                    <span className='digits-tick__label'>Stored ticks</span>
                    <span className='digits-tick__cell-value'>{formatCount(tickCount)}</span>
                </div>

                <div className='digits-tick__cell'>
                    <span className='digits-tick__label'>Precision</span>
                    <span className='digits-tick__cell-value'>
                        {precision.resolvedDecimalPlaces === null ? '—' : `${precision.resolvedDecimalPlaces} dp`}
                        <span className='digits-tick__source'> · {precision.source}</span>
                    </span>
                </div>
            </div>
        </section>
    );
}
