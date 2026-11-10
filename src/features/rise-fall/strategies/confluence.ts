/**
 * Confluence — strategy #8.
 *
 * It owns no rule of its own: it reads the other seven strategies' signals for
 * the same tick and only trades when at least two of them agree on one side.
 *
 * The score is the average of the AGREEING strategies' own scores, so two voters
 * at 80/100 read as 80/100 — not as a fraction of all seven. A strong dissent
 * (another strategy scoring 80 or more on the other side) refuses the entry.
 */

import type { RegimeState, RiseFallSignal, SignalContribution, TradeDirection, Tick } from '../types';
import { assembleSignal, emptySignal, type StrategyConfig } from './shared';

/** How many strategies have to agree before confluence trades. */
export const CONFLUENCE_MIN_AGREEMENT = 2;

/** A strategy scoring this much on the other side refuses the agreement. */
export const CONFLUENCE_DISSENT_SCORE = 80;

/**
 * @param base the seven base strategies' signals for the SAME ticks. Confluence
 * is never computed from a cached or older signal.
 */
export function evaluateConfluence(
    base: RiseFallSignal[],
    ticks: Tick[],
    symbol: string,
    config: StrategyConfig,
    regime: RegimeState
): RiseFallSignal {
    const voters = base.filter(signal => signal.direction !== 'none' && signal.suitable);
    if (voters.length === 0) {
        return emptySignal(
            'confluence',
            symbol,
            ticks,
            'No trade — none of the other strategies is offering an entry on this tick, so there is nothing to agree on.'
        );
    }

    const riseVoters = voters.filter(signal => signal.direction === 'rise');
    const fallVoters = voters.filter(signal => signal.direction === 'fall');
    const riseTotal = riseVoters.reduce((sum, signal) => sum + signal.riseScore, 0);
    const fallTotal = fallVoters.reduce((sum, signal) => sum + signal.fallScore, 0);
    const side: TradeDirection =
        riseVoters.length === fallVoters.length ? (riseTotal >= fallTotal ? 'rise' : 'fall') : riseVoters.length > fallVoters.length ? 'rise' : 'fall';

    const agreeing = side === 'rise' ? riseVoters : fallVoters;
    const dissenting = side === 'rise' ? fallVoters : riseVoters;
    const agreeingIds = new Set(agreeing.map(signal => signal.strategyId));
    const weight = 100 / Math.max(1, agreeing.length);

    const contributions: SignalContribution[] = base.map(signal => {
        const score = signal.direction === 'rise' ? signal.riseScore : signal.fallScore;
        const agrees = agreeingIds.has(signal.strategyId);
        return {
            id: signal.strategyId,
            label: signal.strategyId.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
            weight: agrees ? weight : 0,
            score: agrees ? weight * (score / 100) : 0,
            direction: agrees ? signal.direction : 'none',
            detail: agrees
                ? `${signal.direction === 'rise' ? 'Rise' : 'Fall'} ${score}/100 — agrees`
                : signal.direction === 'none'
                  ? 'No signal'
                  : `${signal.direction === 'rise' ? 'Rise' : 'Fall'} ${score}/100 — ${
                        signal.suitable ? 'dissents' : 'filtered out'
                    }`,
        };
    });

    const strongestDissent = dissenting.reduce(
        (max, signal) => Math.max(max, signal.direction === 'rise' ? signal.riseScore : signal.fallScore),
        0
    );

    return assembleSignal({
        strategyId: 'confluence',
        symbol,
        ticks,
        contributions,
        regime,
        minScore: config.minScore,
        suitableWhen: ({ direction }) => {
            if (direction === 'none') return { suitable: false, reason: null };
            if (agreeing.length < CONFLUENCE_MIN_AGREEMENT) {
                return {
                    suitable: false,
                    reason: `only ${agreeing.length} of the seven strategies agrees — ${CONFLUENCE_MIN_AGREEMENT} are required`,
                };
            }
            if (strongestDissent >= CONFLUENCE_DISSENT_SCORE) {
                return {
                    suitable: false,
                    reason: `a strategy on the other side scored ${strongestDissent.toFixed(0)}, which is too strong to ignore`,
                };
            }
            return { suitable: true, reason: null };
        },
    });
}
