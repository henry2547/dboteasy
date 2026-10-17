/**
 * AI Market Scanner & Automated Trading — dashboard page.
 *
 * The 6th main tab. Composes focused panels (each its own component) into a
 * responsive dashboard that shows the live scanner, ranked markets, strategy
 * selector, settings, session P/L, open contracts, the last signal/risk/execution
 * result, and the event journal.
 */

import { lazy, Suspense } from 'react';
import { useScanner } from './use-scanner';
import ScannerHeader from './components/scanner-header';
import MarketRankings from './components/market-rankings';
import SignalCard from './components/signal-card';
import SessionPanel from './components/session-panel';
import JournalPanel from './components/journal-panel';
import './scanner-page.scss';

const StrategySelector = lazy(() => import('./components/strategy-selector'));
const SettingsPanel = lazy(() => import('./components/settings-panel'));
const ContractsPanel = lazy(() => import('./components/contracts-panel'));

export default function ScannerPage() {
    const store = useScanner();

    return (
        <div className='scanner'>
            <ScannerHeader store={store} />

            <div className='scanner__grid'>
                <section className='scanner__col scanner__col--main'>
                    <MarketRankings rankings={store.rankings} topMarket={store.topMarket} state={store.state} />
                    <SignalCard
                        signal={store.lastSignal}
                        riskCheck={store.lastRiskCheck}
                        execution={store.lastExecution}
                        noSignalReason={store.topMarket ? undefined : 'Waiting for market data…'}
                    />
                    <Suspense fallback={<div className='scanner__loading'>Loading contracts…</div>}>
                        <ContractsPanel
                            openContracts={store.openContracts}
                            lastExecution={store.lastExecution}
                        />
                    </Suspense>
                </section>

                <section className='scanner__col scanner__col--side'>
                    <SessionPanel session={store.session} config={store.config} store={store} />
                    <Suspense fallback={<div className='scanner__loading'>Loading strategies…</div>}>
                        <StrategySelector store={store} />
                    </Suspense>
                    <Suspense fallback={<div className='scanner__loading'>Loading settings…</div>}>
                        <SettingsPanel store={store} />
                    </Suspense>
                </section>
            </div>

            <JournalPanel journal={store.journal} onClear={store.clearJournal} />
        </div>
    );
}
