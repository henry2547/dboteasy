/**
 * The whole generation pipeline as one pure function, so the page, the tests and the library all
 * run exactly the same stages: Understand/Plan -> Map/Build -> Validate -> Explain.
 *
 * Nothing here touches the Bot Builder workspace. A failure at any stage returns the failure and
 * leaves the user's existing workspace alone; loading is a separate, explicit step.
 */

import { buildBotXml } from './builder';
import { explainBot } from './explainer';
import { planStrategy, type StrategyPlanner } from './planner';
import { refineSpec, type RefineResult } from './refiner';
import { buildRegistry, type Registry } from './registry';
import { normalizeSpec } from './spec-model';
import { validateWorkspace } from './validator';
import type { AppliedDefault, BuiltWorkspace, Clarification, Explanation, Requirement, StrategySpec, ValidationReport } from './types';

export type PipelineStage = 'understand' | 'plan' | 'build' | 'validate' | 'explain';

export interface GeneratedBot {
    spec: StrategySpec;
    workspace: BuiltWorkspace;
    xml: string;
    validation: ValidationReport;
    explanation: Explanation;
}

export interface PipelineResult {
    ok: boolean;
    /** The stage that stopped the pipeline, when `ok` is false. */
    failedAt?: PipelineStage;
    message?: string;
    bot?: GeneratedBot;
    defaults: AppliedDefault[];
    clarifications: Clarification[];
    unsupported: string[];
    reasoning: string[];
    /** Every clause of the prompt, and whether the bot implements it. */
    requirements: Requirement[];
}

export interface GenerateOptions {
    registry?: Registry;
    planner?: StrategyPlanner;
}

/** Builds, validates and explains a spec. Throws nothing: errors become a failed result. */
export function assemble(input: StrategySpec, registry: Registry): { ok: true; bot: GeneratedBot } | { ok: false; failedAt: PipelineStage; message: string; bot?: GeneratedBot } {
    // A spec saved by an older version is upgraded once, here, so every later stage sees one shape.
    const spec = normalizeSpec(input);
    let built: ReturnType<typeof buildBotXml>;
    try {
        built = buildBotXml(spec);
    } catch (error) {
        return { ok: false, failedAt: 'build', message: `The workspace could not be built: ${(error as Error).message}` };
    }

    let validation: ValidationReport;
    try {
        validation = validateWorkspace(built.workspace, registry, { spec });
    } catch (error) {
        return { ok: false, failedAt: 'validate', message: `Validation failed to run: ${(error as Error).message}` };
    }

    const explanation = explainBot(spec, built.workspace, registry);
    const bot: GeneratedBot = { spec, workspace: built.workspace, xml: built.xml, validation, explanation };

    if (!validation.ok) {
        return {
            ok: false,
            failedAt: 'validate',
            message: `The bot did not pass validation: ${validation.errors.join(' ')}`,
            bot,
        };
    }
    return { ok: true, bot };
}

export function generateBot(prompt: string, options: GenerateOptions = {}): PipelineResult {
    const registry = options.registry ?? buildRegistry();
    const plan = planStrategy(prompt, options.planner);

    if (!plan.spec) {
        return {
            ok: false,
            failedAt: 'understand',
            message: plan.clarifications.length
                ? 'I need one more detail before I can build this.'
                : 'The request could not be turned into a strategy.',
            defaults: plan.defaults,
            clarifications: plan.clarifications,
            unsupported: plan.unsupported,
            reasoning: plan.reasoning,
            requirements: plan.requirements,
        };
    }

    const assembled = assemble(plan.spec, registry);
    const shared = {
        defaults: plan.defaults,
        clarifications: [],
        unsupported: plan.unsupported,
        reasoning: plan.reasoning,
        requirements: plan.requirements,
    };

    if (assembled.ok === true) return { ok: true, bot: assembled.bot, ...shared };
    return { ok: false, failedAt: assembled.failedAt, message: assembled.message, bot: assembled.bot, ...shared };
}

export interface RefineOutcome {
    ok: boolean;
    refine: RefineResult;
    result: ReturnType<typeof assemble>;
}

/** Applies a follow-up instruction to an existing spec, then rebuilds and revalidates everything. */
export function refineBot(current: StrategySpec, instruction: string, registry: Registry = buildRegistry()): RefineOutcome {
    const refine = refineSpec(current, instruction);
    const result = assemble(refine.spec, registry);
    return { ok: result.ok && refine.changes.length > 0, refine, result };
}
