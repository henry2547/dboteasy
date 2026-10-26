/**
 * Spec helpers shared by every stage.
 *
 * A spec saved by an older version of the architect has one `filters.frequency` instead of a list of
 * `filters.frequencies`, and no entry digit list or bar-neutral digits. `normalizeSpec` upgrades such
 * a spec in place (without mutating it) so the builder, validator and explainer only ever see the
 * current shape — a bot saved last week still opens and runs.
 */

import type { FilterPlan, StrategyLeg, StrategySpec } from './types';

type LegacyFilterPlan = FilterPlan & { frequency?: { digit: number; operator: 'below' | 'above'; percent: number } | null };

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
          }
        : undefined;
    return {
        ...spec,
        ...(secondLeg ? { secondLeg } : {}),
        entry: { ...spec.entry, digits: Array.isArray(spec.entry?.digits) ? spec.entry.digits : [] },
        filters: { ...filters, frequencies, barNeutral },
    };
}

/** The primary rule first, then the second leg when the bot was combined with another. */
export function legsOf(spec: StrategySpec): StrategyLeg[] {
    const primary: StrategyLeg = {
        strategy: spec.entry.strategy,
        barrier: spec.entry.barrier,
        digits: spec.entry.digits ?? [],
        filters: spec.filters,
        label: spec.observation.strategyLabel,
    };
    return spec.secondLeg ? [primary, spec.secondLeg] : [primary];
}

/** `Over 1` / `Even` — the contract a leg buys, in the words the UI uses. */
export function legLabel(strategy: StrategyLeg['strategy'], barrier: number | null): string {
    const label = strategy[0].toUpperCase() + strategy.slice(1);
    return barrier === null ? label : `${label} ${barrier}`;
}

/** The digit filters and bar rules written as one short sentence, for the explanation panels. */
export function filterText(filters: FilterPlan): string {
    const parts = filters.frequencies.map(item => `digit ${item.digit} ${item.operator} ${item.percent}%`);
    filters.barNeutral.forEach(digit => parts.push(`digit ${digit} has no green or red bar`));
    if (filters.streakAtMost !== null) parts.push(`streak <= ${filters.streakAtMost}`);
    return parts.join(', ') || 'None';
}
