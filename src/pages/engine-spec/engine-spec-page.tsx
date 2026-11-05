import { useCallback, useMemo, useState } from 'react';
import { useDigitsLabContext } from '../digits/digits-lab-context';
import ConsolidatedSignal from './consolidated-signal';
import { STRATEGY_LABELS, type StrategyId } from './engine-scoring';
import {
    SPEC_METRICS,
    SPEC_SECTIONS,
    type SpecSectionData,
    type SpecTableData,
} from './engine-spec-content';
import { useConfluenceEngine } from './use-confluence-engine';
import './engine-spec-page.scss';

/**
 * Engine tab — the weighted multi-window confluence engine.
 *
 * The top block is live: it reads the shared Digits feed, scores the micro (25),
 * mid (100) and macro (500) windows against their fair baselines and prints ONE
 * consolidated verdict. Everything below it is the written specification of the
 * same rules. Read-only analysis: the page never sends a trade.
 */
export default function EngineSpecPage() {
    const lab = useDigitsLabContext();
    const [strategyId, setStrategyId] = useState<StrategyId>('UNDER_7');
    const engine = useConfluenceEngine(lab.ticks, strategyId);

    const markets = useMemo(
        () => [...lab.markets].sort((a, b) => a.displayName.localeCompare(b.displayName)),
        [lab.markets]
    );

    const marketName = lab.selectedMarket?.displayName ?? 'No market selected';
    const connected = lab.connection.status === 'connected';

    const jumpTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    return (
        <div className='espec'>
            <header className='espec-hero'>
                <div>
                    <span className='espec-hero__kicker'>Live engine</span>
                    <h2 className='espec-hero__title'>Multi-Window Confluence Engine</h2>
                    <p className='espec-hero__subtitle'>
                        25 / 100 / 500-tick weighted confluence for Over / Under, Even / Odd and Matches / Differs on
                        Deriv volatility indices. Three windows, one Master Score, one verdict.
                    </p>
                </div>
            </header>

            <section className='espec-controls'>
                <label className='espec-control'>
                    <span className='espec-control__label'>Volatility index</span>
                    <select
                        className='espec-control__select'
                        value={lab.selectedMarket?.apiSymbol ?? ''}
                        onChange={event => {
                            const market = markets.find(m => m.apiSymbol === event.target.value);
                            if (market) lab.selectMarket(market);
                        }}
                        disabled={!connected || markets.length === 0}
                    >
                        {markets.length === 0 && <option value=''>Loading markets…</option>}
                        {markets.map(market => (
                            <option key={market.apiSymbol} value={market.apiSymbol}>
                                {market.displayName}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='espec-control'>
                    <span className='espec-control__label'>Strategy</span>
                    <select
                        className='espec-control__select'
                        value={strategyId}
                        onChange={event => setStrategyId(event.target.value as StrategyId)}
                    >
                        {(Object.keys(STRATEGY_LABELS) as StrategyId[]).map(id => (
                            <option key={id} value={id}>
                                {STRATEGY_LABELS[id]}
                            </option>
                        ))}
                    </select>
                </label>
            </section>

            <ConsolidatedSignal
                result={engine.result}
                marketName={marketName}
                sample={engine.sample}
                connected={connected}
                isLoading={lab.isLoadingHistory}
                errorMessage={lab.errorMessage}
            />

            <div className='espec-metrics'>
                {SPEC_METRICS.map(metric => (
                    <div className='espec-metric' key={metric.label}>
                        <span className='espec-metric__label'>{metric.label}</span>
                        <span className='espec-metric__value'>{metric.value}</span>
                        <span className='espec-metric__hint'>{metric.hint}</span>
                    </div>
                ))}
            </div>

            <nav className='espec-nav' aria-label='Specification sections'>
                {SPEC_SECTIONS.map(section => (
                    <button
                        type='button'
                        key={section.id}
                        className='espec-nav__item'
                        onClick={() => jumpTo(section.id)}
                    >
                        {section.kicker}
                    </button>
                ))}
            </nav>

            {SPEC_SECTIONS.map(section => (
                <SpecSection key={section.id} section={section} />
            ))}

            <p className='espec-footnote'>
                Educational reference only. Past digit shares describe the ticks already seen, not the next one;
                test every rule on a Demo account before risking a real balance.
            </p>
        </div>
    );
}

function SpecSection({ section }: { section: SpecSectionData }) {
    return (
        <section id={section.id} className='espec-section'>
            <div className='espec-section__head'>
                <span className='espec-section__kicker'>{section.kicker}</span>
                <h3 className='espec-section__title'>{section.title}</h3>
                <p className='espec-section__intro'>{section.intro}</p>
            </div>

            {section.formulas && section.formulas.length > 0 && (
                <ul className='espec-formulas'>
                    {section.formulas.map(formula => (
                        <li className='espec-formula' key={formula.label}>
                            <span className='espec-formula__label'>{formula.label}</span>
                            <code className='espec-formula__expression'>{formula.expression}</code>
                            <span className='espec-formula__note'>{formula.note}</span>
                        </li>
                    ))}
                </ul>
            )}

            {section.tables?.map(table => (
                <SpecTable key={table.title ?? table.columns.join('-')} table={table} />
            ))}

            {section.bullets && section.bullets.length > 0 && (
                <ul className='espec-points'>
                    {section.bullets.map(point => (
                        <li key={point}>{point}</li>
                    ))}
                </ul>
            )}

            {section.code && (
                <figure className='espec-code'>
                    <figcaption className='espec-code__caption'>{section.code.language}</figcaption>
                    <div className='espec-code__scroll' role='region' aria-label='Gate pseudo-code' tabIndex={0}>
                        <pre className='espec-code__body'>
                            <code>{section.code.text}</code>
                        </pre>
                    </div>
                </figure>
            )}
        </section>
    );
}

function SpecTable({ table }: { table: SpecTableData }) {
    const label = table.title ?? table.columns.join(', ');
    return (
        <figure className='espec-table'>
            {table.title && <figcaption className='espec-table__caption'>{table.title}</figcaption>}
            <div className='espec-table__scroll' role='region' aria-label={label} tabIndex={0}>
                <table style={{ minWidth: `${table.minWidth ?? 720}px` }}>
                    <thead>
                        <tr>
                            {table.columns.map(column => (
                                <th scope='col' key={column}>
                                    {column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map(row => (
                            <tr key={row[0]}>
                                {row.map((cell, index) =>
                                    index === 0 ? (
                                        <th scope='row' key={`${row[0]}-${index}`}>
                                            {cell}
                                        </th>
                                    ) : (
                                        <td key={`${row[0]}-${index}`}>{cell}</td>
                                    )
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className='espec-table__hint'>Scroll sideways inside the table when a column is out of view.</p>
        </figure>
    );
}
