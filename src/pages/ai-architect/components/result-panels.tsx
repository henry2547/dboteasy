import type { AppliedDefault, Explanation, ValidationReport } from '../types';

const STAGE_LABEL: Record<string, string> = {
    discovery: 'Market discovery',
    analysis: 'Historical analysis',
    entry: 'Entry condition',
    observation: 'Virtual setup observation',
    validation: 'Validation',
    purchase: 'Contract purchase',
    monitoring: 'Trade monitoring',
    reporting: 'Reporting',
};

export function ReasoningPanel({ reasoning, summary }: { reasoning: string[]; summary: string[] }) {
    return (
        <section className='aa-card' aria-labelledby='aa-reasoning-title'>
            <h3 id='aa-reasoning-title' className='aa-card__title'>
                What the bot does
            </h3>
            <ul className='aa-list'>
                {summary.map(line => (
                    <li key={line}>{line}</li>
                ))}
            </ul>
            {reasoning.length > 0 && (
                <details className='aa-details'>
                    <summary>How the request was understood</summary>
                    <ul className='aa-list aa-list--muted'>
                        {reasoning.map(line => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}

export function ConfigurationPanel({ explanation, defaults }: { explanation: Explanation; defaults: AppliedDefault[] }) {
    return (
        <section className='aa-card' aria-labelledby='aa-config-title'>
            <h3 id='aa-config-title' className='aa-card__title'>
                Configuration
            </h3>
            <dl className='aa-config'>
                {explanation.configuration.map(row => (
                    <div key={row.label} className='aa-config__row'>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                    </div>
                ))}
            </dl>
            {defaults.length > 0 && (
                <div className='aa-defaults' role='note'>
                    <strong>Defaults I applied because the request did not say:</strong>
                    <ul className='aa-list aa-list--muted'>
                        {defaults.map(item => (
                            <li key={item.field}>
                                <b>{item.field}:</b> {item.value} — {item.reason}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

export function FlowPanel({ explanation }: { explanation: Explanation }) {
    return (
        <section className='aa-card' aria-labelledby='aa-flow-title'>
            <h3 id='aa-flow-title' className='aa-card__title'>
                Execution flow
            </h3>
            <ol className='aa-flow'>
                {explanation.flow.map(step => (
                    <li key={step.order} className={`aa-flow__step aa-flow__step--${step.stage}`}>
                        <span className='aa-flow__stage'>{STAGE_LABEL[step.stage] ?? step.stage}</span>
                        <span className='aa-flow__title'>{step.title}</span>
                        <span className='aa-flow__blocks'>{step.blocks.join(' · ')}</span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export function BlocksPanel({ explanation }: { explanation: Explanation }) {
    const groups = new Map<string, Explanation['blocks']>();
    explanation.blocks.forEach(block => groups.set(block.category, [...(groups.get(block.category) ?? []), block]));

    return (
        <section className='aa-card' aria-labelledby='aa-blocks-title'>
            <h3 id='aa-blocks-title' className='aa-card__title'>
                Blocks used <span className='aa-count'>{explanation.blocks.reduce((sum, block) => sum + block.count, 0)}</span>
            </h3>
            {[...groups.entries()].map(([category, blocks]) => (
                <div key={category} className='aa-blocks__group'>
                    <h4 className='aa-blocks__category'>{category}</h4>
                    <ul className='aa-blocks__list'>
                        {blocks.map(block => (
                            <li key={block.type} className='aa-blocks__item'>
                                <span className='aa-blocks__name'>
                                    {block.displayName}
                                    {block.count > 1 && <span className='aa-blocks__times'> ×{block.count}</span>}
                                </span>
                                <code className='aa-blocks__type'>{block.type}</code>
                                {block.role && <span className='aa-blocks__role'>{block.role}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}

export function ValidationPanel({ report, unsupported }: { report: ValidationReport; unsupported: string[] }) {
    const passed = report.checks.filter(check => check.level === 'pass').length;
    return (
        <section className='aa-card' aria-labelledby='aa-validation-title'>
            <h3 id='aa-validation-title' className='aa-card__title'>
                Validation{' '}
                <span className={`aa-badge ${report.ok ? 'aa-badge--ok' : 'aa-badge--bad'}`}>{report.ok ? 'Passed' : 'Failed'}</span>
            </h3>
            <p className='aa-card__hint'>
                {passed} of {report.checks.length} checks passed
                {report.warnings.length ? `, ${report.warnings.length} warning(s)` : ''}. Valid XML alone is not proof a bot runs, so every
                block, field, connection and safety rule is checked.
            </p>
            <ul className='aa-checks'>
                {report.checks.map(check => (
                    <li key={check.id} className={`aa-check aa-check--${check.level}`}>
                        <span className='aa-check__mark' aria-hidden='true'>
                            {check.level === 'pass' ? '✓' : check.level === 'warning' ? '!' : '✕'}
                        </span>
                        <span className='aa-check__body'>
                            <span className='aa-check__label'>{check.label}</span>
                            <span className='aa-check__detail'>{check.detail}</span>
                        </span>
                    </li>
                ))}
            </ul>
            {unsupported.length > 0 && (
                <div className='aa-unsupported' role='note'>
                    <strong>Not built:</strong>
                    <ul className='aa-list'>
                        {unsupported.map(line => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
