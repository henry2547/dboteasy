/**
 * Current tick display panel — shows the latest tick with quote,
 * last digit, direction, timestamp, and precision info.
 */

import React from 'react';
import { useDigitsLab } from '../store';

const CurrentTickPanel: React.FC = () => {
    const { ticks, selectedMarket, precision, connection, isSwitching } = useDigitsLab();

    const current = ticks.length > 0 ? ticks[ticks.length - 1] : null;
    const previous = ticks.length > 1 ? ticks[ticks.length - 2] : null;

    const direction = current && previous
        ? current.quote > previous.quote
            ? 'up'
            : current.quote < previous.quote
                ? 'down'
                : 'flat'
        : 'flat';

    const directionLabel = direction === 'up' ? '↑ Up' : direction === 'down' ? '↓ Down' : '→ Flat';

    if (isSwitching || !current) {
        return (
            <div className="dl-tick-panel dl-tick-panel--loading">
                <div className="dl-tick-panel__placeholder">
                    {isSwitching ? 'Loading market data…' : 'Waiting for tick data…'}
                </div>
            </div>
        );
    }

    return (
        <div className="dl-tick-panel">
            <div className="dl-tick-panel__main">
                <div className="dl-tick-panel__market">
                    <span className="dl-tick-panel__market-name">{selectedMarket?.displayName}</span>
                    <span className="dl-tick-panel__market-symbol">{selectedMarket?.apiSymbol}</span>
                </div>
                <div className="dl-tick-panel__quote">{current.formattedQuote}</div>
                <div className={`dl-tick-panel__direction dl-tick-panel__direction--${direction}`}>
                    {directionLabel}
                </div>
            </div>
            <div className="dl-tick-panel__digit">
                <div className="dl-tick-panel__digit-label">Last Digit</div>
                <div className="dl-tick-panel__digit-value">{current.lastDigit}</div>
                {previous && (
                    <div className="dl-tick-panel__digit-prev">prev: {previous.lastDigit}</div>
                )}
            </div>
            <div className="dl-tick-panel__meta">
                <div className="dl-tick-panel__meta-row">
                    <span>Time:</span>
                    <span>{current.date.toLocaleTimeString()}</span>
                </div>
                <div className="dl-tick-panel__meta-row">
                    <span>Stored:</span>
                    <span>{ticks.length} ticks</span>
                </div>
                <div className="dl-tick-panel__meta-row">
                    <span>Precision:</span>
                    <span>{precision.resolvedDecimalPlaces ?? '—'} dp ({precision.source})</span>
                </div>
                <div className="dl-tick-panel__meta-row">
                    <span>Status:</span>
                    <span>{connection.status}</span>
                </div>
            </div>
        </div>
    );
};

export default CurrentTickPanel;
