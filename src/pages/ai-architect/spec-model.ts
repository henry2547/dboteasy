/**
 * Spec helpers shared by every stage.
 *
 * A spec saved by an older version of the architect has one `filters.frequency` instead of a list of
 * `filters.frequencies`, and no entry digit list, bar-neutral digits, custom indicators, analysis
 * tools or realism pacing. `normalizeSpec` upgrades such a spec (without mutating it) so the
 * builder, validator and explainer only ever see the current shape — a bot saved last week still
 * opens and runs exactly as it did.
 */

import type { AnalysisPlan, FilterPlan, IndicatorPlan, RealismPlan, StrategyLeg, StrategySpec } from './types';

type LegacyFilterPlan = FilterPlan & { frequency?: { digit: number; operator: 'below' | 'above'; percent: number } | null };

export const emptyAnalysis = (): AnalysisPlan => ({ rankMarkets: false, bestParityMarket: false, strategyReport: false });

/** Every pacing setting off, which is exactly how a bot built before this existed runs. */
export const emptyRealism = (): RealismPlan => ({ entryDelaySeconds: 0, entryJitterSeconds: 0, lossCooldownSeconds: 0, stakeJitterPercent: 0 });

export const emptyFilters = (window: number): FilterPlan => ({ window, frequencies: [], streakAtMost: null, barNeutral: [] });

/** The current filter shape, upgraded from the single-filter shape an older save may carry. */
function normalizeFilters(filters: FilterPlan | undefined): FilterPlan {
    const legacy = (filters ?? emptyFilters(100)) as LegacyFilterPlan;
    return {
        ...legacy,
        frequencies: Array.isArray(legacy.frequencies) ? legacy.frequencies : legacy.frequency ? [legacy.frequency] : [],
        barNeutral: Array.isArray(legacy.barNeutral) ? legacy.barNeutral : [],
    };
}

const normalizeIndicators = (indicators: IndicatorPlan[] | undefined, window: number): IndicatorPlan[] =>
    Array.isArray(indicators) ? indicators.map(indicator => ({ ...indicator, window: indicator.window ?? window })) : [];

function normalizeRealism(realism: RealismPlan | undefined): RealismPlan {
    const base = emptyRealism();
    if (!realism) return base;
    const bounded = (value: unknown, max: number) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? Math.min(max, Math.round(numeric * 10) / 10) : 0;
    };
    return {
        entryDelaySeconds: bounded(realism.entryDelaySeconds, 300),
        entryJitterSeconds: bounded(realism.entryJitterSeconds, 300),
        lossCooldownSeconds: bounded(realism.lossCooldownSeconds, 300),
        stakeJitterPercent: bounded(realism.stakeJitterPercent, 50),
    };
}

/** Every field the current shape needs, filled from the legacy shape where it is missing. */
export function normalizeSpec(spec: StrategySpec): StrategySpec {
    const filters = (spec.filters ?? emptyFilters(100)) as LegacyFilterPlan;
    const frequencies = Array.isArray(filters.frequencies) ? filters.frequencies : filters.frequency ? [filters.frequency] : [];
    const barNeutral = Array.isArray(filters.barNeutral) ? filters.barNeutral : [];
    const secondLeg = spec.secondLeg
        ? {
              ...spec.secondLeg,
              digits: Array.isArray(spec.secondLeg.digits) ? spec.secondLeg.digits : [],
              filters: normalizeFilters(spec.secondLeg.filters),
              indicators: normalizeIndicators(spec.secondLeg.indicators, spec.secondLeg.filters?.window ?? 100),
          }
        : undefined;
    return {
        ...spec,
        ...(secondLeg ? { secondLeg } : {}),
        entry: { ...spec.entry, digits: Array.isArray(spec.entry?.digits) ? spec.entry.digits : [] },
        filters: { ...filters, frequencies, barNeutral },
        indicators: normalizeIndicators(spec.indicators, filters.window ?? 100),
        analysis: { ...emptyAnalysis(), ...(spec.analysis ?? {}) },
        realism: normalizeRealism(spec.realism),
    };
}

/** The primary rule first, then the second leg when the bot was combined with another. */
export function legsOf(spec: StrategySpec): StrategyLeg[] {
    const primary: StrategyLeg = {
        strategy: spec.entry.strategy,
        barrier: spec.entry.barrier,
        digits: spec.entry.digits ?? [],
        filters: spec.filters,
        indicators: spec.indicators ?? [],
        label: spec.observation.strategyLabel,
    };
    return spec.secondLeg ? [primary, spec.secondLeg] : [primary];
}

/** The digit filters and bar rules written as one short sentence, for the explanation panels. */
export function filterText(filters: FilterPlan): string {
    const parts = filters.frequencies.map(item => `digit ${item.digit} ${item.operator} ${item.percent}%`);
    filters.barNeutral.forEach(digit => parts.push(`digit ${digit} has no green or red bar`));
    if (filters.streakAtMost !== null) parts.push(`streak <= ${filters.streakAtMost}`);
    return parts.join(', ') || 'None';
}

/** One line per custom indicator, in the words the analysis panel shows. */
export function indicatorText(indicators: IndicatorPlan[]): string {
    return indicators
        .map(indicator =>
            indicator.kind === 'high_run'
                ? `last ${indicator.count ?? 3} digits ${String(indicator.mode).replace(/_/g, ' ')} ${indicator.digit}`
                : `${indicator.mode} digit is ${indicator.digit}`
        )
        .join(', ');
}
