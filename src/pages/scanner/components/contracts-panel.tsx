/** Open-contract status and last execution result. */

import type { ContractRecord } from '../scanner-types';

export default function ContractsPanel({
    openContracts,
    lastExecution,
}: {
    openContracts: ContractRecord[];
    lastExecution: ContractRecord | null;
}) {
    return (
        <article className='scanner-card'>
            <h3 className='scanner-card__title'>
                Contracts {openContracts.length > 0 && `· ${openContracts.length} open`}
            </h3>

            {openContracts.length === 0 && !lastExecution ? (
                <p className='scanner-card__muted'>No contracts yet. A contract appears here only after Deriv confirms a purchase.</p>
            ) : (
                <>
                    {openContracts.map(contract => (
                        <ContractRow key={contract.id} contract={contract} />
                    ))}
                    {openContracts.length === 0 && lastExecution && (
                        <ContractRow contract={lastExecution} />
                    )}
                </>
            )}
        </article>
    );
}

function ContractRow({ contract }: { contract: ContractRecord }) {
    const statusClass =
        contract.status === 'won'
            ? 'scanner-contract__status--won'
            : contract.status === 'lost'
              ? 'scanner-contract__status--lost'
              : 'scanner-contract__status--open';

    return (
        <div className='scanner-contract'>
            <div>
                <span className={`scanner-contract__status ${statusClass}`}>{contract.status}</span>{' '}
                <span className='scanner-card__muted'>
                    {contract.symbol} · {contract.contractType}
                    {contract.prediction ?? contract.barrier ?? ''}
                </span>
            </div>
            <div className='scanner-card__muted'>
                Stake {contract.stake.toFixed(2)}
                {contract.buyPrice !== null && ` · bought @ ${contract.buyPrice.toFixed(2)}`}
                {contract.contractId !== null && ` · #${contract.contractId}`}
                {contract.profit !== null && (
                    <strong style={{ color: contract.profit >= 0 ? '#1a7f37' : '#c0392b' }}>
                        {' '}· {contract.profit >= 0 ? '+' : ''}{contract.profit.toFixed(2)}
                    </strong>
                )}
            </div>
            {contract.error && <div style={{ color: '#c0392b' }}>{contract.error}</div>}
        </div>
    );
}
