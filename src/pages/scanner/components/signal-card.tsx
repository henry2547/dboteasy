/** Last signal, risk-check breakdown, and last execution result. */

import type { ContractRecord, RiskCheckResult, StrategySignal } from '../scanner-types';

export default function SignalCard({
    signal,
    riskCheck,
    execution,
    noSignalReason,
}: {
    signal: StrategySignal | null;
    riskCheck: RiskCheckResult | null;
    execution: ContractRecord | null;
    noSignalReason?: string;
}) {
    return (
        <article className='scanner-card'>
            <h3 className='scanner-card__title'>Last signal</h3>

            {!signal ? (
                <p className='scanner-card__muted'>{noSignalReason ?? 'No qualifying setup — waiting for evidence.'}</p>
            ) : (
                <>
                    <div className='scanner-signal__row'>
                        <span>Market</span>
                        <strong>{signal.symbol}</strong>
                    </div>
                    <div className='scanner-signal__row'>
                        <span>Strategy</span>
                        <strong>{signal.strategy}</strong>
                    </div>
                    <div className='scanner-signal__row'>
                        <span>Contract</span>
                        <strong>{signal.contractType}</strong>
                    </div>
                    {signal.prediction !== null && (
                        <div className='scanner-signal__row'>
                            <span>Digit</span>
                            <strong>{signal.prediction}</strong>
                        </div>
                    )}
                    {signal.barrier !== null && (
                        <div className='scanner-signal__row'>
                            <span>Barrier</span>
                            <strong>{signal.barrier}</strong>
                        </div>
                    )}
                    <div className='scanner-signal__row'>
                        <span>Reason</span>
                        <span>{signal.reason}</span>
                    </div>

                    {signal.conditionsPassed.length > 0 && (
                        <ul className='scanner-signal__conditions'>
                            {signal.conditionsPassed.map((c, i) => (
                                <li key={i} className='scanner-signal__pass'>✓ {c}</li>
                            ))}
                        </ul>
                    )}
                    {signal.conditionsFailed.length > 0 && (
                        <ul className='scanner-signal__conditions'>
                            {signal.conditionsFailed.map((c, i) => (
                                <li key={i} className='scanner-signal__fail'>✗ {c}</li>
                            ))}
                        </ul>
                    )}
                </>
            )}

            {riskCheck && (
                <>
                    <h4 style={{ margin: '1rem 0 0.4rem' }}>Risk checks</h4>
                    {riskCheck.checks.map(check => (
                        <div key={check.name} className='scanner-risk__check'>
                            <span>{check.passed ? '✓' : '✗'} {check.name}</span>
                            <span className='scanner-card__muted'>{check.reason ?? ''}</span>
                        </div>
                    ))}
                </>
            )}

            {execution && (
                <>
                    <h4 style={{ margin: '1rem 0 0.4rem' }}>Last execution</h4>
                    <div className='scanner-signal__row'>
                        <span>Status</span>
                        <strong>{execution.status}</strong>
                    </div>
                    {execution.contractId !== null && (
                        <div className='scanner-signal__row'>
                            <span>Contract</span>
                            <span>{execution.contractId}</span>
                        </div>
                    )}
                    {execution.profit !== null && (
                        <div className='scanner-signal__row'>
                            <span>Result</span>
                            <strong style={{ color: execution.profit >= 0 ? '#1a7f37' : '#c0392b' }}>
                                {execution.profit >= 0 ? '+' : ''}{execution.profit.toFixed(2)}
                            </strong>
                        </div>
                    )}
                    {execution.error && (
                        <p className='scanner-card__muted' style={{ color: '#c0392b' }}>{execution.error}</p>
                    )}
                </>
            )}
        </article>
    );
}
