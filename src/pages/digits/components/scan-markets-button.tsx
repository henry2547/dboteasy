import { useState } from 'react';
import { formatPercent } from '../format';
import type { MarketScan } from '../scan-markets';
import type { MarketSymbol } from '../types';

interface ScanMarketsButtonProps {
    isScanning: boolean;
    results: MarketScan[];
    error: string | null;
    selectedMarket: MarketSymbol | null;
    onScan: () => void;
    onPick: (market: MarketSymbol) => void;
}

/**
 * Floating button that scans every volatility market and hands back the market
 * with the most orderly digits to trade on.
 */
export default function ScanMarketsButton({
    isScanning,
    results,
    error,
    selectedMarket,
    onScan,
    onPick,
}: ScanMarketsButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const best = results[0] ?? null;

    const handleScan = () => {
        setIsOpen(true);
        onScan();
    };

    const handlePick = (market: MarketSymbol) => {
        onPick(market);
        setIsOpen(false);
    };

    return (
        <div className='digits-scan'>
            {isOpen && (
                <div className='digits-scan__panel' role='dialog' aria-label='Market scan results'>
                    <div className='digits-scan__panel-head'>
                        <h4 className='digits-scan__title'>Best markets to trade</h4>
                        <button
                            type='button'
                            className='digits-scan__close'
                            onClick={() => setIsOpen(false)}
                            aria-label='Close scan results'
                        >
                            ×
                        </button>
                    </div>

                    {isScanning && <p className='digits-scan__note'>Scanning every volatility market…</p>}
                    {!isScanning && error && <p className='digits-scan__note digits-scan__note--error'>{error}</p>}

                    {!isScanning && !error && results.length > 0 && (
                        <>
                            <p className='digits-scan__recommendation'>
                                Trade <strong>{best?.market.displayName}</strong> — score {best?.score}/100, best rule{' '}
                                {best?.bestRuleLabel} ({formatPercent(best?.edge, 0)}).
                            </p>
                            <ul className='digits-scan__list'>
                                {results.slice(0, 8).map(result => (
                                    <li key={result.market.apiSymbol}>
                                        <button
                                            type='button'
                                            className={
                                                'digits-scan__item' +
                                                (selectedMarket?.apiSymbol === result.market.apiSymbol
                                                    ? ' digits-scan__item--active'
                                                    : '')
                                            }
                                            onClick={() => handlePick(result.market)}
                                        >
                                            <span className='digits-scan__item-name'>{result.market.displayName}</span>
                                            <span className='digits-scan__item-meta'>
                                                score {result.score} · {result.bestRuleLabel} ·{' '}
                                                {result.digits.length} ticks
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {!isScanning && !error && results.length === 0 && (
                        <p className='digits-scan__note'>Tap Scan to rank the volatility markets.</p>
                    )}
                </div>
            )}

            <button
                type='button'
                className='digits-scan__fab'
                onClick={handleScan}
                disabled={isScanning}
                aria-label='Scan all volatility markets'
            >
                {isScanning ? 'Scanning…' : 'Scan markets'}
            </button>
        </div>
    );
}
