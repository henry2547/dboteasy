import { useDigitsLabContext } from '../digits-lab-context';
import ScanMarketsButton from './scan-markets-button';

/**
 * The market scanner, mounted once in the app shell so its floating button is
 * available on every tab (not only the Digits tab).
 */
export default function GlobalScanButton() {
    const lab = useDigitsLabContext();

    return (
        <ScanMarketsButton
            isScanning={lab.isScanning}
            results={lab.scanResults}
            summary={lab.scanSummary}
            progress={lab.scanProgress}
            failures={lab.scanFailures}
            error={lab.scanError}
            selectedMarket={lab.selectedMarket}
            onScan={lab.scanMarkets}
            onCancel={lab.cancelScan}
            onPick={lab.selectMarket}
        />
    );
}
