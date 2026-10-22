import React from 'react';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { MARKET_SCAN_STATES, MARKET_SCAN_STATUS_EVENT } from '@/external/bot-skeleton/services/tradeEngine/utils/market-scan-states';
import { localize } from '@deriv-com/translations';
import './market-scan-strip.scss';

/**
 * The live state of the "Switch active market" scan.
 *
 * `MarketScan.publishScanState()` emits the engine's own snapshot on every transition and while it
 * switches, so the strip shows exactly what the scan is doing: no simulated progress, no timer. It
 * renders nothing until a scan reports a state a user can watch (and nothing again once the scan is
 * idle or stopped), and it is read-only — it can neither start nor change a scan.
 */
interface MarketScanSnapshot {
    state: string;
    message: string;
    active_display: string;
    active_symbol: string;
    position: number;
    total: number;
    switches: number;
    limit: number;
    analysed_count: number;
    remaining_count: number;
    entry_found: boolean;
    data_ready: boolean;
    tick_count: number;
    connected: boolean;
    subscription_active: boolean;
    running: boolean;
}

const STATE_LABELS: Record<string, string> = {
    [MARKET_SCAN_STATES.DISCOVERING_MARKETS]: localize('Finding markets'),
    [MARKET_SCAN_STATES.SELECTING_MARKET]: localize('Selecting market'),
    [MARKET_SCAN_STATES.SUBSCRIBING]: localize('Subscribing to ticks'),
    [MARKET_SCAN_STATES.ANALYZING]: localize('Analysing'),
    [MARKET_SCAN_STATES.ENTRY_FOUND]: localize('Entry found'),
    [MARKET_SCAN_STATES.SWITCHING_MARKET]: localize('Switching market'),
    [MARKET_SCAN_STATES.LIMIT_REACHED]: localize('Switch limit reached'),
    [MARKET_SCAN_STATES.NO_ELIGIBLE_MARKETS]: localize('No eligible markets'),
    [MARKET_SCAN_STATES.DATA_UNAVAILABLE]: localize('Market data unavailable'),
    [MARKET_SCAN_STATES.TRADE_IN_PROGRESS]: localize('Waiting for the trade to finish'),
};

/** States that mean "nothing to watch": the strip is only shown while the scan has something to say. */
const IDLE_STATES: string[] = [MARKET_SCAN_STATES.IDLE, MARKET_SCAN_STATES.STOPPED];

const MarketScanStrip = () => {
    const [snapshot, setSnapshot] = React.useState<MarketScanSnapshot | null>(null);

    React.useEffect(() => {
        const onScanStatus = (data: MarketScanSnapshot) => setSnapshot(data);
        globalObserver.register(MARKET_SCAN_STATUS_EVENT, onScanStatus);
        return () => {
            if (globalObserver.isRegistered(MARKET_SCAN_STATUS_EVENT)) {
                globalObserver.unregister(MARKET_SCAN_STATUS_EVENT, onScanStatus);
            }
        };
    }, []);

    if (!snapshot || IDLE_STATES.includes(snapshot.state)) return null;

    const label = STATE_LABELS[snapshot.state] ?? snapshot.state;
    const market = snapshot.active_display || snapshot.active_symbol;
    const has_pool = snapshot.total > 0;
    const limit_label = snapshot.limit > 0 ? String(snapshot.limit) : localize('all');

    return (
        <div className='market-scan-strip' data-testid='market-scan-strip' role='status' aria-live='polite'>
            <span className='market-scan-strip__state'>{label}</span>
            {market && (
                <span className='market-scan-strip__field'>
                    {localize('Market')}: <b>{market}</b>
                    {has_pool && ` (${snapshot.position}/${snapshot.total})`}
                </span>
            )}
            <span className='market-scan-strip__field'>
                {localize('Switches')}: <b>{snapshot.switches}</b>/{limit_label}
            </span>
            {has_pool && (
                <span className='market-scan-strip__field'>
                    {localize('Analysed')}: <b>{snapshot.analysed_count}</b>/{snapshot.total}
                </span>
            )}
            {snapshot.data_ready ? (
                <span className='market-scan-strip__field'>
                    {localize('Live ticks')}: <b>{snapshot.tick_count}</b>
                </span>
            ) : (
                <span className='market-scan-strip__field'>{localize('Waiting for live ticks…')}</span>
            )}
            {!snapshot.connected && (
                <span className='market-scan-strip__field market-scan-strip__field--warning'>
                    {localize('Market feed disconnected')}
                </span>
            )}
            {snapshot.message && <span className='market-scan-strip__message'>{snapshot.message}</span>}
        </div>
    );
};

export default MarketScanStrip;
