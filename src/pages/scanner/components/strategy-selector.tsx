/** Strategy selector: enable/disable each strategy and choose digits. */

import { observer } from 'mobx-react-lite';
import { STRATEGY_LABELS } from '../scanner-config';
import type { StrategyId } from '../scanner-types';
import type { ScannerStore } from '../scanner-store';

const StrategySelector = observer(({ store }: { store: ScannerStore }) => {
    return (
        <article className='scanner-card'>
            <h3 className='scanner-card__title'>Strategies</h3>
            <div className='scanner-strategy'>
                {store.config.strategies.map(strategy => (
                    <div key={strategy.id} className='scanner-strategy__row'>
                        <input
                            type='checkbox'
                            checked={strategy.enabled}
                            onChange={e => store.toggleStrategy(strategy.id, e.target.checked)}
                            id={`strat-${strategy.id}`}
                        />
                        <label htmlFor={`strat-${strategy.id}`} style={{ flex: 1 }}>
                            {STRATEGY_LABELS[strategy.id as StrategyId]}
                        </label>
                        {(strategy.id === 'matches' || strategy.id === 'differs') && (
                            <select
                                className='scanner-strategy__digit'
                                value={strategy.digit === null ? 'auto' : String(strategy.digit)}
                                onChange={e =>
                                    store.setStrategyDigit(
                                        strategy.id,
                                        e.target.value === 'auto' ? null : Number(e.target.value)
                                    )
                                }
                                disabled={!strategy.enabled}
                            >
                                <option value='auto'>Auto</option>
                                {Array.from({ length: 10 }, (_, d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        )}
                    </div>
                ))}
            </div>
            <p className='scanner-settings__hint' style={{ marginTop: '0.6rem' }}>
                For Matches/Differs pick a digit or use the engine's candidate. Over/Under use the configured
                pattern confirmations (00→0, 11→0 for Over 1; 88→9, 99→9 for Under 8).
            </p>
        </article>
    );
});

export default StrategySelector;
