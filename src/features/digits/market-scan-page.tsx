/**
 * Market Scan — reads every eligible volatility market once and ranks them by
 * how orderly their digits are.
 *
 * It shares the Digits lab's single public feed through `useDigitsLabContext()`,
 * so a row's Load bot button and the market picker work exactly as they do on
 * the D Analysis tab. Nothing here is simulated: every figure comes from the
 * live public feed.
 */

import MarketResultsTable from './components/market-results-table';
import ScanControlPanel from './components/scan-control-panel';
import { useDigitsLabContext } from './digits-lab-context';
import './digits-page.scss';
import './digits-dashboard.scss';

export default function MarketScanPage() {
    const lab = useDigitsLabContext();
    const eligibleMarkets = lab.markets.filter(market => market.isOpen && !market.isSuspended).length;

    return (
        <div className='digits'>
            <header className='digits-hero'>
                <div className='digits-hero__titles'>
                    <h2 className='digits-hero__title'>Market scan</h2>
                    <p className='digits-hero__subtitle'>
                        Every eligible volatility market read in one pass · ranked by digit behaviour
                    </p>
                </div>

                <div className='digits-hero__actions'>
                    <span className={`digits-status digits-status--${lab.connection.status}`}>
                        {lab.connection.status === 'connected' ? 'Feed connected' : lab.connection.status}
                    </span>
                </div>
            </header>

            <ScanControlPanel
                isScanning={lab.isScanning}
                progress={lab.scanProgress}
                summary={lab.scanSummary}
                failures={lab.scanFailures}
                error={lab.scanError}
                eligibleMarkets={eligibleMarkets}
                onScan={lab.scanMarkets}
                onCancel={lab.cancelScan}
            />

            <MarketResultsTable
                results={lab.scanResults}
                failures={lab.scanFailures}
                summary={lab.scanSummary}
                isScanning={lab.isScanning}
                selectedMarket={lab.selectedMarket}
                onPick={lab.selectMarket}
                onScan={lab.scanMarkets}
            />

            <p className='digits-disclaimer'>
                Unofficial, educational tool reading Deriv&apos;s public market-data feed. No login, no trading, no
                financial advice. Statistical qualification is not proof that a setup will win.
            </p>
        </div>
    );
}
