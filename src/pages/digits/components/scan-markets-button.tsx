import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ScannerBotResult from '@/pages/free-bots/components/scanner-bot-result';
import { formatPercent } from '../format';
import type { MarketScan } from '../scan-markets';
import type { MarketSymbol } from '../types';
import './scan-markets-button.scss';

interface ScanMarketsButtonProps {
    isScanning: boolean;
    results: MarketScan[];
    error: string | null;
    selectedMarket: MarketSymbol | null;
    onScan: () => void;
    onPick: (market: MarketSymbol) => void;
}

interface Point {
    left: number;
    top: number;
}

const EDGE = 8;
const DRAG_THRESHOLD = 4;
const PANEL_MAX_WIDTH = 400;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Floating button that scans every volatility market and hands back the market
 * with the most orderly digits to trade on. Each ranked row also carries the
 * Free Bot that matches its Over 1 / Under 8 setup, with a Load Bot button that
 * opens that template in the Bot Builder on the scanned market.
 *
 * It is mounted app-wide (not inside a tab) and can be dragged anywhere on the
 * screen in any direction; the results panel flips below the button when it is
 * parked in the top half of the viewport.
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
    const [position, setPosition] = useState<Point | null>(null);
    const [size, set_size] = useState({ width: 0, height: 0 });
    const [viewport, set_viewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const container_ref = useRef<HTMLDivElement | null>(null);
    const drag_ref = useRef<{
        start_x: number;
        start_y: number;
        origin_left: number;
        origin_top: number;
        moved: boolean;
    } | null>(null);
    const suppress_click_ref = useRef(false);

    const clamp_position = useCallback(
        (next: Point): Point => ({
            left: clamp(next.left, EDGE, window.innerWidth - size.width - EDGE),
            top: clamp(next.top, EDGE, window.innerHeight - size.height - EDGE),
        }),
        [size.width, size.height]
    );

    // Measure the button once so dragging starts from where CSS put it.
    useLayoutEffect(() => {
        const element = container_ref.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        set_size({ width: rect.width, height: rect.height });
        setPosition({ left: rect.left, top: rect.top });
    }, []);

    // Keep the button inside the viewport when the window is resized or rotated.
    useEffect(() => {
        const handle_resize = () => {
            set_viewport({ width: window.innerWidth, height: window.innerHeight });
            setPosition(current => (current ? clamp_position(current) : current));
        };
        window.addEventListener('resize', handle_resize);
        return () => window.removeEventListener('resize', handle_resize);
    }, [clamp_position]);

    const handleScan = () => {
        setIsOpen(true);
        onScan();
    };

    const handlePick = (market: MarketSymbol) => {
        onPick(market);
        setIsOpen(false);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const element = container_ref.current;
        if (!element) return;
        suppress_click_ref.current = false;
        const rect = element.getBoundingClientRect();
        drag_ref.current = {
            start_x: event.clientX,
            start_y: event.clientY,
            origin_left: rect.left,
            origin_top: rect.top,
            moved: false,
        };
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // Pointer capture is unavailable (e.g. a synthetic pointer) — dragging still works.
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = drag_ref.current;
        if (!drag) return;
        const dx = event.clientX - drag.start_x;
        const dy = event.clientY - drag.start_y;
        if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setPosition(clamp_position({ left: drag.origin_left + dx, top: drag.origin_top + dy }));
    };

    const handlePointerEnd = () => {
        const drag = drag_ref.current;
        drag_ref.current = null;
        if (drag?.moved) suppress_click_ref.current = true;
    };

    const handleFabClick = () => {
        // A drag ends with a click on the same button — swallow it.
        if (suppress_click_ref.current) {
            suppress_click_ref.current = false;
            return;
        }
        handleScan();
    };

    const best = results[0] ?? null;
    const panel_width = Math.min(PANEL_MAX_WIDTH, viewport.width - EDGE * 2);
    const panel_below = position ? position.top < viewport.height / 2 : false;
    const panel_style = position
        ? {
              width: `${panel_width}px`,
              left: `${clamp(position.left + size.width - panel_width, EDGE, viewport.width - panel_width - EDGE)}px`,
              ...(panel_below
                  ? {
                        top: `${position.top + size.height + EDGE}px`,
                        maxHeight: `${Math.max(160, viewport.height - position.top - size.height - EDGE * 2)}px`,
                    }
                  : {
                        bottom: `${viewport.height - position.top + EDGE}px`,
                        maxHeight: `${Math.max(160, position.top - EDGE * 2)}px`,
                    }),
          }
        : undefined;

    return (
        <div
            className={`digits-scan${panel_below ? ' digits-scan--panel-below' : ''}`}
            ref={container_ref}
            style={
                position
                    ? {
                          left: `${position.left}px`,
                          top: `${position.top}px`,
                          right: 'auto',
                          bottom: 'auto',
                      }
                    : undefined
            }
        >
            {isOpen && position && (
                <div
                    className='digits-scan__panel'
                    role='dialog'
                    aria-label='Market scan results'
                    style={panel_style}
                >
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
                                        <ScannerBotResult
                                            result={result}
                                            selected={selectedMarket?.apiSymbol === result.market.apiSymbol}
                                            onPick={() => handlePick(result.market)}
                                            onLoaded={() => setIsOpen(false)}
                                        />
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
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onClick={handleFabClick}
                disabled={isScanning}
                aria-label='Scan all volatility markets (drag to move)'
            >
                {isScanning ? 'Scanning…' : 'Scan markets'}
            </button>
        </div>
    );
}
