/**
 * Signal panel — shows the last signal, risk check results, proposal info,
 * and execution result with full AI explanations.
 */

import { useAiBotContext } from '../ai-bot-context';

export default function SignalPanel() {
    const bot = useAiBotContext();
    const { state } = bot;
    const { lastSignal, lastRiskCheck, lastProposal, lastExecution } = state;

    if (!lastSignal && !lastExecution) {
        return (
            <section className='aibot-panel'>
                <h3 className='aibot-panel__title'>Last Signal & Execution</h3>
                <p className='aibot-empty'>No signal generated yet. The scanner will produce a signal when conditions qualify.</p>
            </section>
        );
    }

    return (
        <section className='aibot-panel'>
            <h3 className='aibot-panel__title'>Last Signal & Execution</h3>

            {lastSignal && (
                <div className='aibot-signal'>
                    <div className='aibot-signal__head'>
                        <span className='aibot-signal__strategy'>{lastSignal.strategyLabel}</span>
                        <span className='aibot-signal__symbol'>{lastSignal.symbol}</span>
                        {lastSignal.digit !== null && <span className='aibot-signal__digit'>Digit: {lastSignal.digit}</span>}
                        {lastSignal.barrier !== null && <span className='aibot-signal__digit'>Barrier: {lastSignal.barrier}</span>}
                        <span className='aibot-signal__time'>{new Date(lastSignal.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className='aibot-signal__reason'>{lastSignal.reason}</p>
                    <div className='aibot-signal__conditions'>
                        <div>
                            <strong>Conditions passed:</strong> {lastSignal.conditionsPassed.join(', ') || '—'}
                        </div>
                        <div>
                            <strong>Conditions failed:</strong> {lastSignal.conditionsFailed.join(', ') || '—'}
                        </div>
                    </div>
                </div>
            )}

            {lastRiskCheck && (
                <div className={`aibot-risk ${lastRiskCheck.passed ? 'aibot-risk--pass' : 'aibot-risk--fail'}`}>
                    <h4 className='aibot-risk__title'>
                        Risk Check: {lastRiskCheck.passed ? 'PASSED' : 'REJECTED'}
                    </h4>
                    {!lastRiskCheck.passed && lastRiskCheck.reason && (
                        <p className='aibot-risk__reason'>Reason: {lastRiskCheck.reason}</p>
                    )}
                    <div className='aibot-risk__checks'>
                        {lastRiskCheck.checks.map(c => (
                            <span
                                key={c.id}
                                className={`aibot-condition aibot-condition--${c.passed ? 'pass' : 'fail'}`}
                            >
                                {c.label}: {c.detail}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {lastProposal && (
                <div className='aibot-proposal'>
                    <h4 className='aibot-proposal__title'>Proposal</h4>
                    <p className='aibot-proposal__longcode'>{lastProposal.longcode}</p>
                    <p className='aibot-proposal__price'>
                        Ask: {lastProposal.askPrice} · Payout: {lastProposal.payout}
                    </p>
                </div>
            )}

            {lastExecution && (
                <div className={`aibot-execution aibot-execution--${lastExecution.status ?? 'open'}`}>
                    <h4 className='aibot-execution__title'>
                        Execution: {lastExecution.status ?? 'open'}
                    </h4>
                    <p className='aibot-execution__msg'>{lastExecution.message}</p>
                    {lastExecution.contractId && (
                        <p className='aibot-execution__id'>Contract #{lastExecution.contractId}</p>
                    )}
                    {lastExecution.profit !== null && (
                        <p className='aibot-execution__profit'>
                            Profit: {lastExecution.profit >= 0 ? '+' : ''}{lastExecution.profit.toFixed(2)}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
