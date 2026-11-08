import type { EngineConfig, EngineStatus, SessionMetrics, StakePreview } from '../types';

interface RiskMonitorProps {
    config: EngineConfig;
    session: SessionMetrics;
    stakes: StakePreview;
    status: EngineStatus;
    hardLimit: string | null;
    balance: number | null;
}

/** Every limit the execution service enforces, shown with its live value. */
export default function RiskMonitor({ config, session, stakes, status, hardLimit, balance }: RiskMonitorProps) {
    const rows: Array<{ label: string; value: string; tone?: 'good' | 'bad' | 'warn' }> = [
        { label: 'Initial stake', value: config.initialStake.toFixed(2) },
        { label: 'Current stake', value: stakes.currentStake.toFixed(2) },
        { label: 'Multiplier', value: `×${config.multiplier} (${config.multiplierScope})` },
        { label: 'Take profit', value: config.takeProfit.toFixed(2) },
        { label: 'Stop loss', value: `-${config.stopLoss.toFixed(2)}` },
        {
            label: 'Current session P/L',
            value: `${session.profit > 0 ? '+' : ''}${session.profit.toFixed(2)}`,
            tone: session.profit > 0 ? 'good' : session.profit < 0 ? 'bad' : undefined,
        },
        { label: 'Consecutive losses', value: `${session.consecutiveLosses} / ${config.maxConsecutiveLosses}` },
        { label: 'Recovery attempts', value: `${session.recoveryAttempts} / ${config.maxRecoveryTrades}` },
        { label: 'Open contracts', value: `${session.openContracts} / ${config.maxOpenContracts}` },
        { label: 'Remaining risk allowance', value: stakes.remainingRiskAllowance.toFixed(2) },
        { label: 'Account balance', value: balance === null ? '—' : balance.toFixed(2) },
        { label: 'Engine status', value: status },
    ];

    return (
        <section className='ge-panel' aria-label='Risk monitor'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>Risk monitor</h3>
                {hardLimit && <span className='ge-pill ge-pill--fail'>Limit reached</span>}
            </header>

            <div className='ge-risk-grid'>
                {rows.map(row => (
                    <div key={row.label} className='ge-risk-grid__item'>
                        <span className='ge-risk-grid__label'>{row.label}</span>
                        <span
                            className={`ge-risk-grid__value${
                                row.tone === 'good' ? ' ge-risk-grid__value--good' : row.tone === 'bad' ? ' ge-risk-grid__value--bad' : ''
                            }`}
                        >
                            {row.value}
                        </span>
                    </div>
                ))}
            </div>

            {hardLimit ? (
                <p className='ge-alert ge-alert--warn'>{hardLimit} New purchases are blocked until you reset the session counters.</p>
            ) : (
                <p className='ge-note'>
                    Take profit, stop loss, consecutive-loss, recovery, open-contract, maximum-stake, balance and
                    duplicate-purchase checks all run inside the execution path — not only in this panel.
                </p>
            )}
        </section>
    );
}
