/**
 * Open contracts panel — shows currently open contracts being monitored.
 */

import { useAiBotContext } from '../ai-bot-context';

export default function OpenContractsPanel() {
    const bot = useAiBotContext();
    const { state } = bot;
    const { openContracts } = state;

    if (openContracts.length === 0) {
        return (
            <section className='aibot-panel'>
                <h3 className='aibot-panel__title'>Open Contracts</h3>
                <p className='aibot-empty'>No open contracts.</p>
            </section>
        );
    }

    return (
        <section className='aibot-panel'>
            <h3 className='aibot-panel__title'>Open Contracts ({openContracts.length})</h3>
            <div className='aibot-contracts'>
                {openContracts.map(c => (
                    <article key={c.contractId} className='aibot-contract'>
                        <div className='aibot-contract__head'>
                            <span className='aibot-contract__id'>#{c.contractId}</span>
                            <span className='aibot-contract__type'>{c.contractType}</span>
                            <span className='aibot-contract__symbol'>{c.symbol}</span>
                            <span className={`aibot-badge ${c.isSold ? 'aibot-badge--muted' : 'aibot-badge--success'}`}>
                                {c.isSold ? 'Settled' : 'Open'}
                            </span>
                        </div>
                        <div className='aibot-contract__body'>
                            <span>Buy: {c.buyPrice}</span>
                            <span>Payout: {c.payout}</span>
                            {c.profit !== null && (
                                <span className={c.profit >= 0 ? 'aibot-positive' : 'aibot-negative'}>
                                    P/L: {c.profit >= 0 ? '+' : ''}{c.profit.toFixed(2)}
                                </span>
                            )}
                            {c.entryTick !== null && <span>Entry tick: {c.entryTick}</span>}
                            {c.currentSpot !== null && <span>Spot: {c.currentSpot}</span>}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
