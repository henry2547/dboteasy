/**
 * Deriv Digits Analysis Lab — Main Page
 *
 * Orchestrates all analysis panels: connection status, market selector,
 * current tick, digit frequency, distribution chart, digit circle,
 * strategy learning results, barrier observations, and env code viewer.
 */

import React, { useState } from 'react';
import { useDigitsLab } from './store';
import ConnectionPanel from './components/ConnectionPanel';
import MarketSelector from './components/MarketSelector';
import CurrentTickPanel from './components/CurrentTickPanel';
import DigitFrequencyCards from './components/DigitFrequencyCards';
import DigitDistributionChart from './components/DigitDistributionChart';
import DigitCircle from './components/DigitCircle';
import StrategyAnalysis from './components/StrategyAnalysis';
import BarrierObservationPanel from './components/BarrierObservationPanel';
import EnvCodeViewer from './components/EnvCodeViewer';
import { ANALYSIS_WINDOWS } from './constants';
import './digits-lab.scss';

const DigitsLabPage: React.FC = () => {
    const { statistics, analysisWindow, setAnalysisWindow, isSwitching } = useDigitsLab();
    const [showEnvViewer, setShowEnvViewer] = useState(false);

    return (
        <div className="digits-lab">
            {/* Header */}
            <header className="dl-header">
                <div className="dl-header__title">
                    <h1>Deriv Digits Analysis Lab</h1>
                    <p className="dl-header__subtitle">
                        Public Market Data, Statistical Analysis & Educational Strategy Research
                    </p>
                </div>
                <div className="dl-header__actions">
                    <ConnectionPanel />
                    <button
                        className="dl-btn dl-btn--ghost"
                        onClick={() => setShowEnvViewer(true)}
                        aria-label="View environment configuration"
                    >
                        ⚙ Env Codes
                    </button>
                </div>
            </header>

            {/* Disclaimer */}
            <div className="dl-disclaimer">
                <strong>Unofficial tool</strong> — for educational and market-analysis purposes only.
                No login, no trading, no account data. Public market data only.
            </div>

            {/* Market Selector */}
            <MarketSelector />

            {/* Analysis window selector */}
            <div className="dl-window-selector">
                <label>Analysis Window:</label>
                <div className="dl-window-buttons">
                    {ANALYSIS_WINDOWS.map((w) => (
                        <button
                            key={w}
                            className={`dl-window-btn ${analysisWindow === w ? 'dl-window-btn--active' : ''}`}
                            onClick={() => setAnalysisWindow(w)}
                        >
                            {w}
                        </button>
                    ))}
                </div>
                <span className="dl-window-info">
                    {isSwitching ? 'Switching market…' : `${statistics.sampleSize} ticks analyzed`}
                </span>
            </div>

            {/* Current tick + stats summary */}
            <CurrentTickPanel />

            {/* Digit frequency cards */}
            <DigitFrequencyCards />

            {/* Charts row */}
            <div className="dl-charts-row">
                <DigitDistributionChart />
                <DigitCircle />
            </div>

            {/* Strategy learning results */}
            <StrategyAnalysis />

            {/* Barrier observation */}
            <BarrierObservationPanel />

            {/* Env code viewer modal */}
            {showEnvViewer && <EnvCodeViewer onClose={() => setShowEnvViewer(false)} />}
        </div>
    );
};

export default DigitsLabPage;
