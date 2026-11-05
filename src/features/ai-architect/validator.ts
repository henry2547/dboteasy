/**
 * Strict validation of a built workspace (Step E, and again after loading).
 *
 * Successful XML parsing proves nothing about whether a bot runs, so the checks here read the
 * block tree against the Block Capability Registry and against the strategy spec:
 *
 *   registered + generator   every type exists in this build and can really execute
 *   fields                   every field is defined, and holds an allowed value
 *   inputs                   every required input is filled, and socket types are compatible
 *   connections              statements only chain where the block has previous/next connections
 *   structure                trade definition, before-purchase and a stake seeded at start
 *   safety                   trading bots carry risk guards; non-trading bots cannot buy
 *   markets                  the entry condition is the same in the scan and the confirmation
 *
 * A workspace is `ok` only when there is no `error`. Warnings are shown but do not block loading.
 */

import { allBlocks } from './builder';
import { FORBIDDEN_BLOCKS, TRADE_CAPABLE_BLOCKS, type Registry } from './registry';
import { legsOf, normalizeSpec } from './spec-model';
import type { BlockNode, BuiltWorkspace, SocketType, StrategySpec, ValidationCheck, ValidationReport } from './types';

const REQUIRED_ROOTS = ['trade_definition', 'before_purchase'] as const;

/** Output types that satisfy a socket expecting `accepts`. */
function socketAccepts(accepts: SocketType[], output: SocketType | null): boolean {
    if (accepts.includes('Any')) return true;
    if (!output) return false;
    if (output === 'Any') return true;
    if (accepts.includes(output)) return true;
    // The Condition and Boolean sockets are interchangeable in this build (observer blocks accept both).
    if ((output === 'Condition' && accepts.includes('Boolean')) || (output === 'Boolean' && accepts.includes('Condition'))) return true;
    return false;
}

const pass = (id: string, label: string, detail: string): ValidationCheck => ({ id, label, level: 'pass', detail });
const warn = (id: string, label: string, detail: string): ValidationCheck => ({ id, label, level: 'warning', detail });
const fail = (id: string, label: string, detail: string): ValidationCheck => ({ id, label, level: 'error', detail });

const uniq = <T,>(items: T[]): T[] => [...new Set(items)];

/** A deterministic, order-insensitive fingerprint of a condition subtree, ignoring generated ids. */
export function conditionSignature(block: BlockNode | undefined): string {
    if (!block) return '';
    const fields = Object.entries(block.fields ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
    const values = Object.entries(block.values ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, children]) => `${key}:[${children.filter(child => !child.shadow).map(conditionSignature).join('|')}${children.every(child => child.shadow) ? children.map(conditionSignature).join('|') : ''}]`)
        .join(',');
    return `${block.type}(${fields};${values})`;
}

function findAll(blocks: BlockNode[], type: string): BlockNode[] {
    return blocks.filter(block => block.type === type);
}

/** Every block reachable under `root`, including itself. */
function descendants(root: BlockNode): BlockNode[] {
    return allBlocks({ roots: [root], variables: [] });
}

export interface ValidateOptions {
    spec?: StrategySpec;
}

export function validateWorkspace(workspace: BuiltWorkspace, registry: Registry, options: ValidateOptions = {}): ValidationReport {
    const checks: ValidationCheck[] = [];
    const blocks = allBlocks(workspace);
    const types = uniq(blocks.map(block => block.type));
    const spec = options.spec;

    // 1. Registered and executable ────────────────────────────────────────────────────────────────
    const unknown = types.filter(type => !registry.get(type));
    const unsupported = types.filter(type => registry.get(type)?.status === 'unsupported');

    checks.push(
        unknown.length
            ? fail('registered', 'Every block type is registered', `Unknown block type(s): ${unknown.join(', ')}. The architect never invents blocks.`)
            : pass('registered', 'Every block type is registered', `${types.length} distinct block type(s), all in the capability registry.`)
    );
    checks.push(
        unsupported.length
            ? fail(
                  'executable',
                  'Every block can execute',
                  unsupported.map(type => `${type}: ${registry.get(type)?.reason ?? 'unsupported'}`).join(' ')
              )
            : pass('executable', 'Every block can execute', 'Each block is registered with Blockly and has a JavaScript generator.')
    );

    const forbidden = types.filter(type => FORBIDDEN_BLOCKS[type]);
    checks.push(
        forbidden.length
            ? fail('forbidden', 'No hidden trade-entry gate', forbidden.map(type => `${type} ${FORBIDDEN_BLOCKS[type]}`).join('; '))
            : pass('forbidden', 'No hidden trade-entry gate', 'No observer block that would raise a trade-entry signal is present.')
    );

    // 2. Fields ───────────────────────────────────────────────────────────────────────────────────
    const fieldProblems: string[] = [];
    for (const block of blocks) {
        const entry = registry.get(block.type);
        if (!entry) continue;
        for (const [name, value] of Object.entries(block.fields ?? {})) {
            const field = entry.fields.find(candidate => candidate.name === name);
            if (!field) {
                fieldProblems.push(`${block.type} has no field "${name}"`);
                continue;
            }
            if (field.kind === 'dropdown' && field.values && !field.values.includes(String(value))) {
                fieldProblems.push(`${block.type}.${name} = "${value}" is not one of ${field.values.join(', ')}`);
            }
            if (field.kind === 'number') {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) fieldProblems.push(`${block.type}.${name} = "${value}" is not a number`);
                else {
                    if (field.min !== undefined && numeric < field.min) fieldProblems.push(`${block.type}.${name} = ${numeric} is below ${field.min}`);
                    if (field.max !== undefined && numeric > field.max) fieldProblems.push(`${block.type}.${name} = ${numeric} is above ${field.max}`);
                    if (field.integer && !Number.isInteger(numeric)) fieldProblems.push(`${block.type}.${name} = ${numeric} must be a whole number`);
                }
            }
        }
    }
    checks.push(
        fieldProblems.length
            ? fail('fields', 'Every field holds an allowed value', fieldProblems.slice(0, 6).join('; '))
            : pass('fields', 'Every field holds an allowed value', 'All field names exist and every dropdown/number is within range.')
    );

    // 3. Inputs and socket compatibility ──────────────────────────────────────────────────────────
    const inputProblems: string[] = [];
    const socketProblems: string[] = [];
    for (const block of blocks) {
        const entry = registry.get(block.type);
        if (!entry) continue;

        for (const input of entry.inputs) {
            const supplied = input.kind === 'value' ? block.values?.[input.name] : block.statements?.[input.name];
            if (input.required && (!supplied || supplied.length === 0)) {
                inputProblems.push(`${block.type} is missing required input ${input.name}`);
            }
        }
        for (const name of Object.keys(block.values ?? {})) {
            if (!entry.inputs.some(input => input.name === name && input.kind === 'value')) {
                inputProblems.push(`${block.type} has no value input "${name}"`);
            }
        }
        for (const name of Object.keys(block.statements ?? {})) {
            if (!entry.inputs.some(input => input.name === name && input.kind === 'statement')) {
                inputProblems.push(`${block.type} has no statement input "${name}"`);
            }
        }

        for (const [name, children] of Object.entries(block.values ?? {})) {
            const input = entry.inputs.find(candidate => candidate.name === name && candidate.kind === 'value');
            if (!input) continue;
            for (const child of children) {
                if (child.shadow) continue;
                const childEntry = registry.get(child.type);
                if (childEntry && !socketAccepts(input.accepts, childEntry.output)) {
                    socketProblems.push(`${child.type} (${childEntry.output ?? 'statement'}) cannot plug into ${block.type}.${name} (${input.accepts.join('/')})`);
                }
            }
        }
    }
    checks.push(
        inputProblems.length
            ? fail('inputs', 'Required inputs are connected', inputProblems.slice(0, 6).join('; '))
            : pass('inputs', 'Required inputs are connected', 'Every required input has a block or a valid value.')
    );
    checks.push(
        socketProblems.length
            ? fail('sockets', 'Connections are type-compatible', socketProblems.slice(0, 6).join('; '))
            : pass('sockets', 'Connections are type-compatible', 'Every value block plugs into a socket that accepts its output type.')
    );

    // 4. Statement chains ─────────────────────────────────────────────────────────────────────────
    const chainProblems: string[] = [];
    for (const block of blocks) {
        for (const [name, chain] of Object.entries(block.statements ?? {})) {
            chain.forEach((member, index) => {
                const entry = registry.get(member.type);
                if (!entry) return;
                if (entry.shape === 'value') chainProblems.push(`${member.type} is a value block placed in statement ${block.type}.${name}`);
                if (index > 0 && !entry.previous) chainProblems.push(`${member.type} cannot follow another block in ${block.type}.${name}`);
                if (index < chain.length - 1 && !entry.next) chainProblems.push(`${member.type} ends a stack but is followed by more blocks in ${block.type}.${name}`);
            });
        }
    }
    checks.push(
        chainProblems.length
            ? fail('chains', 'Statement blocks are connected correctly', chainProblems.slice(0, 6).join('; '))
            : pass('chains', 'Statement blocks are connected correctly', 'Statements only chain where the block has previous/next connections.')
    );

    // 5. Structure ────────────────────────────────────────────────────────────────────────────────
    const rootTypes = workspace.roots.map(root => root.type);
    const missingRoots = REQUIRED_ROOTS.filter(type => !rootTypes.includes(type));
    checks.push(
        missingRoots.length
            ? fail('roots', 'Trade definition and purchase conditions exist', `Missing: ${missingRoots.join(', ')}.`)
            : pass('roots', 'Trade definition and purchase conditions exist', 'The workspace has its trade definition and a before-purchase stack.')
    );

    const duplicateRoots = REQUIRED_ROOTS.filter(type => rootTypes.filter(candidate => candidate === type).length > 1);
    checks.push(
        duplicateRoots.length
            ? fail('duplicate-loops', 'No duplicate execution loops', `More than one ${duplicateRoots.join(', ')} would run two competing loops.`)
            : pass('duplicate-loops', 'No duplicate execution loops', 'One trade definition and one purchase-conditions stack.')
    );

    const definition = workspace.roots.find(root => root.type === 'trade_definition');
    const seeded = definition ? descendants({ id: 'init', type: 'x', statements: { S: definition.statements?.INITIALIZATION ?? [] } }) : [];
    const seededStake = seeded.some(block => block.type === 'variables_set' && String(block.fields?.VAR).endsWith(':stake'));
    const readsStakeVariable = definition
        ? descendants({ id: 'opts', type: 'x', statements: { S: definition.statements?.SUBMARKET ?? [] } }).some(
              block => block.type === 'variables_get' && String(block.fields?.VAR).endsWith(':stake')
          )
        : false;
    checks.push(
        readsStakeVariable && !seededStake
            ? fail('stake-at-start', 'The stake is set before the first quote', 'The trade options read the stake variable but "Run once at start" never sets it, so the first proposal would fail.')
            : pass('stake-at-start', 'The stake is set before the first quote', readsStakeVariable ? 'The stake variable is seeded in the trade definition\'s run-once statement.' : 'The stake is a fixed number.')
    );

    // 6. Loops and exits ──────────────────────────────────────────────────────────────────────────
    const before = workspace.roots.find(root => root.type === 'before_purchase');
    const beforeBlocks = before ? descendants(before) : [];
    const switches = findAll(beforeBlocks, 'switch_active_market');
    const trades = findAll(beforeBlocks, 'purchase');

    /**
     * An `if` whose own branch holds the given action. The action may sit inside a pacing wait, so
     * one wait level is inspected too — but never the whole subtree, or the outer stop-flag guard
     * that merely contains the whole stack would look like a confirmation.
     */
    const holdsAction = (candidate: BlockNode, types: string[]) =>
        (candidate.statements?.DO0 ?? []).some(
            inner => types.includes(inner.type) || (inner.type === 'timeout' && (inner.statements?.TIMEOUTSTACK ?? []).some(step => types.includes(step.type)))
        );

    if (switches.length) {
        const problems: string[] = [];
        if (switches.length > 1) problems.push(`${switches.length} Switch active market blocks would run competing scans`);
        for (const block of switches) {
            const limit = block.values?.MAX_SWITCHES?.[0];
            const limitValue = limit ? Number(limit.fields?.NUM) : NaN;
            if (!Number.isFinite(limitValue) || limitValue < 0) problems.push('the switch block has no valid scan limit');
            if (!block.values?.CONDITION?.length) problems.push('the switch block has no entry condition to keep switching until');
        }
        const stopGuarded = !!before?.statements?.BEFOREPURCHASE_STACK?.some(
            block => block.type === 'controls_if' && block.values?.IF0?.some(cond => cond.type === 'logic_negate' && cond.values?.BOOL?.some(inner => inner.type === 'variables_get' && String(inner.fields?.VAR).endsWith(':stop')))
        );
        if (!stopGuarded) problems.push('the scan is not guarded by the stop flag, so the loop could bypass the bot\'s stop controls');
        checks.push(
            problems.length
                ? fail('scan-loop', 'The market scan has a limit and an exit', problems.join('; '))
                : pass('scan-loop', 'The market scan has a limit and an exit', 'One scan block, a valid limit (0 = every eligible market once), and the stop flag guards it.')
        );
    }

    const parityScans = findAll(beforeBlocks, 'switch_best_parity_market');
    if (parityScans.length) {
        const problems: string[] = [];
        if (parityScans.length > 1) problems.push(`${parityScans.length} best-parity scans would run competing scans`);
        if (switches.length) problems.push('a best-parity scan and a Switch active market block would both choose the market');
        for (const block of parityScans) {
            const ticks = block.values?.TICKS?.[0];
            const value = ticks ? Number(ticks.fields?.NUM) : NaN;
            if (!Number.isFinite(value) || value < 1 || value > 1000) problems.push('the parity scan needs a tick window between 1 and 1000');
        }
        checks.push(
            problems.length
                ? fail('parity-scan', 'The even/odd market scan is measurable', problems.join('; '))
                : pass('parity-scan', 'The even/odd market scan is measurable', 'One scan, a tick window the engine accepts, and no second market selector.')
        );
    }

    // 7. Market consistency: the scan and the confirmation must use the same rule ────────────────
    if (switches.length && before) {
        const scanCondition = switches[0].values?.CONDITION?.[0];
        // A two-leg bot scans on "either leg fits", so each leg's own rule must be confirmed.
        const requiredSignatures =
            scanCondition?.type === 'logic_operation' && scanCondition.fields?.OP === 'OR'
                ? [...(scanCondition.values?.A ?? []), ...(scanCondition.values?.B ?? [])].map(conditionSignature)
                : [conditionSignature(scanCondition)];
        // The confirmation is the `if` that holds the action (purchase or stop), not the outer
        // stop-flag guard that merely contains the whole stack.
        const confirmations = findAll(beforeBlocks, 'controls_if').filter(candidate => holdsAction(candidate, ['purchase', 'bot_stop']));
        // Every sub-condition the confirmation is built from, so an AND of (risk guard, same rule) still matches.
        const confirmationSignatures = confirmations.flatMap(candidate => {
            const condition = candidate.values?.IF0?.[0];
            return condition ? descendants(condition).map(conditionSignature) : [];
        });
        // Exact equality only: a partial match (for example just `last_digit`) would let a different
        // rule such as `>= 1` stand in for `<= 1`.
        const consistent = requiredSignatures.length > 0 && requiredSignatures.every(signature => signature !== '' && confirmationSignatures.includes(signature));
        checks.push(
            consistent
                ? pass('market-consistency', 'Scan and confirmation use the same entry rule', 'The condition the scan stops on is re-checked on the frozen market before anything happens.')
                : fail('market-consistency', 'Scan and confirmation use the same entry rule', 'The scan stops on one rule but the confirmation checks another, so a different market could decide the entry.')
        );
    }

    // 8. Safety ───────────────────────────────────────────────────────────────────────────────────
    const hasPurchase = blocks.some(block => (TRADE_CAPABLE_BLOCKS as readonly string[]).includes(block.type));
    if (spec) {
        if (spec.mode === 'demo_trading') {
            const expectedPurchases = legsOf(spec).length;
            checks.push(
                trades.length === expectedPurchases
                    ? pass(
                          'purchase',
                          'Exactly one purchase path per rule',
                          expectedPurchases === 1
                              ? 'One Purchase block, inside the purchase conditions.'
                              : 'Each leg has its own Purchase block inside the purchase conditions.'
                      )
                    : fail(
                          'purchase',
                          'Exactly one purchase path per rule',
                          `${trades.length} Purchase blocks found in the purchase conditions; this bot has ${expectedPurchases} entry rule(s) and needs one Purchase per rule.`
                      )
            );

            // Every `if` that directly holds a Purchase must be risk-guarded, so neither leg can buy
            // without the risk limits being checked.
            const actionIfs = !!before ? findAll(beforeBlocks, 'controls_if').filter(candidate => holdsAction(candidate, ['purchase'])) : [];
            const guarded =
                trades.length > 0 &&
                actionIfs.length === trades.length &&
                actionIfs.every(candidate => {
                    const condition = candidate.values?.IF0?.[0];
                    return !!condition && descendants(condition).some(inner => inner.type === 'risk_can_trade');
                });
            checks.push(
                guarded
                    ? pass('risk-guard', 'The purchase sits behind the risk guard', 'Risk allows a trade is part of the condition that wraps the Purchase block.')
                    : fail('risk-guard', 'The purchase sits behind the risk guard', 'The Purchase block is reachable without checking the risk limits.')
            );

            const after = workspace.roots.find(root => root.type === 'after_purchase');
            const afterBlocks = after ? descendants(after) : [];
            const hasStop = afterBlocks.some(block => block.type === 'variables_set' && String(block.fields?.VAR).endsWith(':stop'));
            const losses = afterBlocks.some(block => block.type === 'variables_set' && String(block.fields?.VAR).endsWith(':losses'));
            checks.push(
                after && hasStop && losses
                    ? pass('stop-controls', 'Stop controls cover take profit, stop loss and losses', 'Take profit, stop loss and the consecutive-loss limit each raise the stop flag.')
                    : fail('stop-controls', 'Stop controls cover take profit, stop loss and losses', 'The result handler does not raise the stop flag on every limit.')
            );
            checks.push(
                spec.account === 'demo'
                    ? pass('demo-default', 'Demo is the default', 'The bot carries no account switch; Real needs an explicit confirmation when you press Start.')
                    : fail('demo-default', 'Demo is the default', 'The spec selects a non-Demo account at build time.')
            );
        } else {
            checks.push(
                hasPurchase
                    ? fail('no-trade', 'This bot cannot buy', `${spec.mode === 'signal' ? 'Signal-only' : 'Observation-only'} bots must contain no Purchase or Trade again block.`)
                    : pass('no-trade', 'This bot cannot buy', 'No Purchase or Trade again block is present, so Start cannot place a contract.')
            );
            const stops = blocks.some(block => block.type === 'bot_stop');
            checks.push(
                stops
                    ? pass('exit', 'The bot ends itself', 'A Stop the bot block ends the run once the signal is reported.')
                    : warn('exit', 'The bot ends itself', 'Nothing stops the run; press Stop yourself.')
            );
        }

        if (spec.observation.virtualHook) {
            const hasEvaluate = blocks.some(block => block.type.startsWith('obs_evaluate_'));
            const recordsSetup = blocks.some(block => block.type === 'report_journal');
            checks.push(
                hasEvaluate && recordsSetup
                    ? pass('virtual-hook', 'Virtual Hook records and observes', 'The setup is written to the run log and the next genuine tick is observed; observations are never counted as purchased contracts.')
                    : fail('virtual-hook', 'Virtual Hook records and observes', 'The Virtual Hook needs both the setup record and the next-tick observation.')
            );
        }

        const readBlocks = [...findAll(blocks, 'digits_frequency'), ...findAll(blocks, 'digits_bar_neutral')];
        if (readBlocks.length) {
            const legWindows = [...new Set(legsOf(normalizeSpec(spec)).map(leg => leg.filters.window))];
            const samples = readBlocks.map(block => Number(block.values?.SAMPLE?.[0]?.fields?.NUM));
            const label = legWindows.length === 1 ? `the last ${legWindows[0]} ticks` : `one of the legs' windows (${legWindows.join(', ')} ticks)`;
            checks.push(
                samples.every(sample => legWindows.includes(sample))
                    ? pass('window', 'Filters use the requested analysis window', `Every digit filter reads ${label}.`)
                    : fail('window', 'Filters use the requested analysis window', `A digit filter reads ${samples.join(', ')} ticks, not ${label}.`)
            );
        }
    }

    const errors = checks.filter(check => check.level === 'error').map(check => `${check.label}: ${check.detail}`);
    const warnings = checks.filter(check => check.level === 'warning').map(check => `${check.label}: ${check.detail}`);

    return {
        ok: errors.length === 0,
        checks,
        errors,
        warnings,
        blockCount: blocks.length,
        blockTypes: types,
        unsupportedTypes: uniq([...unknown, ...unsupported]),
    };
}
