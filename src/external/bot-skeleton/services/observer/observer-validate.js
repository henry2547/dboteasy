/**
 * Pre-run validation of the observer program read off the canvas.
 *
 * The palette, the JavaScript generators and the evaluator/statement registries are all driven by
 * `observer-catalog.js`, so a program is only valid when every block on the canvas is one the
 * runtime can actually evaluate. This module answers that question *before* a session starts —
 * naming the offending block and how to correct it — instead of leaving the run to report
 * Inconclusive block by block, or to fail with
 * `JavaScript generator does not know how to generate code for block type`.
 *
 * - an error (a block with no evaluator in this version, a block type this version does not know,
 *   or a "When …" hat listening for an event the tick stream never raises) stops the observer
 *   session from starting;
 * - a warning (an unconnected socket, an empty field) is reported and the block stays Inconclusive,
 *   which never signals a trade.
 */
import { SPEC } from '../../scratch/blocks/Observer/observer-catalog';
import { DISPATCH_EVENTS, FLOW_OPS } from './observer-engine';
import { EVALUATORS } from './observer-evaluators';
import { STATEMENTS } from './observer-statements';

/** A value/condition block is evaluated; every other block is run as a statement. */
const hasImplementation = spec =>
    FLOW_OPS.has(spec.op) || (spec.output ? Boolean(EVALUATORS[spec.op]) : Boolean(STATEMENTS[spec.op]));

/**
 * @param {{ blocks: Map<string, object>, unknown?: object[] }} program as read by `observer-program.js`
 * @returns {{ ok: boolean, errors: object[], warnings: object[], issues: object[] }}
 */
export const validateProgram = program => {
    const issues = [];
    const report = (level, block, what, fix) =>
        issues.push({
            level,
            id: block.id,
            type: block.type,
            label: block.label ?? block.type,
            message: `"${block.label ?? block.type}" (${block.type}): ${what} ${fix}`,
        });

    (program?.unknown ?? []).forEach(block =>
        report(
            'error',
            block,
            'is not a block this version knows, so it cannot be evaluated.',
            'It comes from an older or renamed configuration — delete it, or replace it with the current block of the same name.'
        )
    );

    [...(program?.blocks?.values?.() ?? [])].forEach(block => {
        const spec = SPEC.get(block.type);
        // A trading block on the same canvas is not the observer's business.
        if (!spec) return;

        if (spec.event) {
            if (!DISPATCH_EVENTS.has(spec.event))
                report(
                    'error',
                    block,
                    `waits for "${spec.event}", an event this version never raises, so its sequence could never run.`,
                    'Replace it with a "When …" block for an event the runtime raises.'
                );
            return;
        }

        if (!hasImplementation(spec)) {
            report(
                'error',
                block,
                'has no evaluator in this version of the observer, so anything depending on it stays Inconclusive.',
                'Remove the block, or run a version of the app that implements it.'
            );
            return;
        }

        Object.keys(spec.inputs ?? {}).forEach(name => {
            if (!block.inputs?.[name])
                report('warning', block, `has nothing connected to "${name}".`, 'Connect a value block to that socket.');
        });

        (spec.fields ?? []).forEach(field => {
            const value = block.fields?.[field.name];
            const blank = value === undefined || value === null || String(value).trim() === '';
            if (blank)
                report(
                    'warning',
                    block,
                    `has no value in "${field.label ?? field.name}".`,
                    'Set that field, or the block has nothing to work with.'
                );
            else if (field.kind === 'number' && !Number.isFinite(Number(value)))
                report('warning', block, `needs a number in "${field.label ?? field.name}".`, 'Set that field to a number.');
        });
    });

    const errors = issues.filter(issue => issue.level === 'error');
    const warnings = issues.filter(issue => issue.level === 'warning');
    return { ok: errors.length === 0, errors, warnings, issues };
};

export default validateProgram;
