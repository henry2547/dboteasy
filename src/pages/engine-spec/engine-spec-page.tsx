import { useCallback } from 'react';
import {
    SPEC_METRICS,
    SPEC_SECTIONS,
    type SpecSectionData,
    type SpecTableData,
} from './engine-spec-content';
import './engine-spec-page.scss';

/**
 * Engine Spec tab - the written multi-window design: 30-tick micro window,
 * 750-tick macro baseline, confluence gates, confirmation triggers, timing and
 * risk controls. It is documentation only: the page never evaluates a market,
 * loads a bot or sends a trade.
 */
export default function EngineSpecPage() {
    const jumpTo = useCallback((id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    return (
        <div className='espec'>
            <header className='espec-hero'>
                <div>
                    <span className='espec-hero__kicker'>Design reference</span>
                    <h2 className='espec-hero__title'>Multi-Window Digit Engine</h2>
                    <p className='espec-hero__subtitle'>
                        30 / 750-tick confluence framework for Over / Under, Even / Odd and Matches / Differs on
                        Deriv volatility indices. Rules only - this tab never trades.
                    </p>
                </div>
            </header>

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
