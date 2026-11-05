import { useCallback, useMemo, useState } from 'react';
import { useDigitsLabContext } from '../digits/digits-lab-context';
import ConsolidatedSignal from './consolidated-signal';
import DigitDistribution from './digit-distribution';
import EngineSettingsPanel from './engine-settings';
import {
    BARRIER_BOUNDS,
    DEFAULT_SETTINGS,
    STRATEGY_FAMILIES,
    clampTarget,
    normalizeSettings,
    type EngineSettings,
    type StrategyFamily,
    type StrategySelection,
} from './engine-scoring';
import { SPEC_METRICS, SPEC_SECTIONS, type SpecSectionData, type SpecTableData } from './engine-spec-content';
import SignalJournal from './signal-journal';
import { useConfluenceEngine } from './use-confluence-engine';
import WindowComparison from './window-comparison';
import './engine-spec-page.scss';

/** Editable settings start at the documented defaults, weights as percentages. */
const DEFAULT_DRAFT: EngineSettings = { ...DEFAULT_SETTINGS, weights: { micro: 50, mid: 30, macro: 20 } };

/**
 * Engine tab — the real-time multi-window confluence engine.
 *
 * The top blocks are live: the shared Digits feed fills the micro (25), mid
 * (100) and macro (500) windows, the engine scores the selected strategy
 * against its fair baseline, validates alignment and statistical reliability,
 * and prints ONE consolidated verdict. Everything below is the written
 * specification of the same rules plus the session's virtual signal journal.
 *
 * Read-only analysis: the page never sends a trade.
 */
export default function EngineSpecPage() {
    const lab = useDigitsLabContext();
    const [selection, setSelection] = useState<StrategySelection>({ family: 'under', target: 7 });
    const [draft, setDraft] = useState<EngineSettings>(DEFAULT_DRAFT);

    const settings = useMemo(() => normalizeSettings(draft), [draft]);

    const markets = useMemo(
        () => [...lab.markets].sort((a, b) => a.displayName.localeCompare(b.displayName)),
        [lab.markets]
    );

    const marketName = lab.selectedMarket?.displayName ?? 'No market selected';
    const connected = lab.connection.status === 'connected';
    const precisionReady = lab.precision.resolvedDecimalPlaces !== null;

    const engine = useConfluenceEngine({
        ticks: lab.ticks,
        selection,
        settings,
        marketName,
        connectionStatus: lab.connection.status,
        precisionReady,
    });

    const bounds = BARRIER_BOUNDS[selection.family];
    const barrierOptions = bounds
        ? Array.from({ length: bounds.max - bounds.min + 1 }, (_, index) => bounds.min + index)
        : [];

    const jumpTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    return (
        <div className='espec'>
            <header className='espec-hero'>
                <div>
                    <span className='espec-hero__kicker'>Live engine</span>
                    <h2 className='espec-hero__title'>Multi-Window Digit Confluence Engine</h2>
                    <p className='espec-hero__subtitle'>
                        25 / 100 / 500-tick weighted confluence for Under, Over, Even, Odd, Matches and Differs on
                        Deriv volatility indices. Three windows, one Master Score, one verdict — analysis only, it
                        never places an order.
                    </p>
                </div>
            </header>

            <section className='espec-controls'>
                <label className='espec-control'>
                    <span className='espec-control__label'>Volatility index</span>
                    <select
                        id='espec-market'
                        className='espec-control__select'
                        value={lab.selectedMarket?.apiSymbol ?? ''}
                        onChange={event => {
                            const market = markets.find(item => item.apiSymbol === event.target.value);
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
                    <span className='espec-control__label'>Strategy family</span>
                    <select
                        id='espec-family'
                        className='espec-control__select'
                        value={selection.family}
                        onChange={event => {
                            const family = event.target.value as StrategyFamily;
                            setSelection({ family, target: clampTarget(family, selection.target) });
                        }}
                    >
                        {STRATEGY_FAMILIES.map(family => (
                            <option key={family.id} value={family.id}>
                                {family.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='espec-control'>
                    <span className='espec-control__label'>{bounds?.label ?? 'Contract'}</span>
                    {bounds ? (
                        <select
                            id='espec-target'
                            className='espec-control__select'
                            value={selection.target}
                            onChange={event => setSelection({ ...selection, target: Number(event.target.value) })}
                        >
                            {barrierOptions.map(digit => (
                                <option key={digit} value={digit}>
                                    {digit}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className='espec-control__static'>
                            {selection.family === 'even' ? 'Even digits 0,2,4,6,8' : 'Odd digits 1,3,5,7,9'}
                        </span>
                    )}
                </label>
            </section>

            <ConsolidatedSignal
                result={engine.result}
                marketName={marketName}
                sample={engine.sample}
                connected={connected}
                precisionReady={precisionReady}
                isLoading={lab.isLoadingHistory}
                errorMessage={lab.errorMessage}
            />

            <WindowComparison result={engine.result} />
            <DigitDistribution result={engine.result} />

            <EngineSettingsPanel
                draft={draft}
                effectiveWeights={settings.weights}
                onChange={setDraft}
                onReset={() => setDraft(DEFAULT_DRAFT)}
            />

            <SignalJournal journal={engine.journal} onReset={engine.resetJournal} />

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
                    <button type='button' key={section.id} className='espec-nav__item' onClick={() => jumpTo(section.id)}>
                        {section.kicker}
                    </button>
                ))}
            </nav>

            {SPEC_SECTIONS.map(section => (
                <SpecSection key={section.id} section={section} />
            ))}

            <p className='espec-footnote'>
                Educational analysis only. Past digit shares describe the ticks already seen, not the next one; no
                verdict here is a profit guarantee, and no order is placed from this page. Test every rule on a Demo
                account before risking a real balance.
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
