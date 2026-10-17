/**
 * AI Bot page — the dashboard for the AI Market Scanner & Automated Trading
 * system. Contains the live scanner, ranked markets, strategy selector,
 * settings panel, account auth, session stats, open contracts, journal, and
 * the start/stop controls.
 */

import AuthPanel from './components/auth-panel';
import AutomationPanel from './components/automation-panel';
import DashboardPanel from './components/dashboard-panel';
import ScannerPanel from './components/scanner-panel';
import SettingsPanel from './components/settings-panel';
import SignalPanel from './components/signal-panel';
import StrategySelector from './components/strategy-selector';
import TradeConfirmation from './components/trade-confirmation';
import TradeMonitor from './components/trade-monitor';
import { useAiBotContext } from './ai-bot-context';
import './ai-bot-page.scss';

export default function AiBotPage() {
    const bot = useAiBotContext();
    const { state } = bot;

    return (
        <div className='aibot'>
            <header className='aibot-hero'>
                <div className='aibot-hero__titles'>
                    <h2 className='aibot-hero__title'>AI Market Scanner & Auto-Trading</h2>
                    <p className='aibot-hero__subtitle'>
                        Live market data · deterministic strategy engine · risk-managed execution
                    </p>
                </div>
                <div className='aibot-hero__actions'>
                    <span className={`aibot-state aibot-state--${state.botState.replace(/\s+/g, '-').toLowerCase()}`}>
                        {state.botState}
                    </span>
                </div>
            </header>

            <AuthPanel />

            <DashboardPanel />

            <AutomationPanel />

            <TradeConfirmation />

            <div className='aibot-grid'>
                <div className='aibot-grid__main'>
                    <ScannerPanel />
                    <SignalPanel />
                </div>
                <div className='aibot-grid__side'>
                    <StrategySelector />
                    <SettingsPanel />
                </div>
            </div>

            <TradeMonitor />

            <p className='aibot-disclaimer'>
                Unofficial tool. Trading involves risk. Past observational outcomes do not guarantee future results.
                Never trade with money you cannot afford to lose.
            </p>
        </div>
    );
}
