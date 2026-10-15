/**
 * Barrier Observation Panel — observes what happens when the ticker
 * hits numbers below and above barriers.
 *
 * Tracks hit rates, consecutive hits/misses, and patterns for
 * Over 1, Over 2, Under 8, Under 7 barriers.
 */

import React from 'react';
import { useDigitsLab } from '../store';
import type { BarrierObservation } from '../types';

const BarrierRow: React.FC<{ obs: BarrierObservation }> = ({ obs }) => {
    return (
        <div className="dl-barrier-row">
            <div className="dl-barrier-row__name">
                <strong>{obs.barrier}</strong>
                <span className="dl-barrier-row__threshold">
                    digit {obs.direction === 'over' ? '>' : '<'} {obs.threshold}
                </span>
            </div>
            <div className="dl-barrier-row__stats">
                <div className="dl-barrier-stat">
                    <span className="dl-barrier-stat__label">Hit Rate</span>
                    <span className="dl-barrier-stat__value">{obs.hitRate.toFixed(1)}%</span>
                </div>
                <div className="dl-barrier-stat">
                    <span className="dl-barrier-stat__label">Hits</span>
                    <span className="dl-barrier-stat__value dl-barrier-stat__value--hit">{obs.hits}</span>
                </div>
                <div className="dl-barrier-stat">
                    <span className="dl-barrier-stat__label">Misses</span>
                    <span className="dl-barrier-stat__value dl-barrier-stat__value--miss">{obs.misses}</span>
                </div>
                <div className="dl-barrier-stat">
                    <span className="dl-barrier-stat__label">Last</span>
                    <span className={`dl-barrier-stat__value ${obs.lastHit === true ? 'dl-barrier-stat__value--hit' : obs.lastHit === false ? 'dl-barrier-stat__value--miss' : ''}`}>
                        {obs.lastHit === true ? '✓ Hit' : obs.lastHit === false ? '✗ Miss' : '—'}
                    </span>
                </div>
                <div className="dl-barrier-stat">
                    <span className="dl-barrier-stat__label">Cons. Hits</span>
                    <span className="dl-barrier-stat__value">{obs.consecutiveHits}</span>
                </div>
                <div className="dl-barrier-stat">
                    <span className="dl-barrier-stat__label">Cons. Misses</span>
                    <span className="dl-barrier-stat__value">{obs.consecutiveMisses}</span>
                </div>
            </div>
            {/* Hit rate bar */}
            <div className="dl-barrier-row__bar">
                <div
                    className={`dl-barrier-row__bar-fill ${obs.lastHit === true ? 'dl-barrier-row__bar-fill--hit' : 'dl-barrier-row__bar-fill--miss'}`}
                    style={{ width: `${obs.hitRate}%` }}
                />
            </div>
        </div>
    );
};

const BarrierObservationPanel: React.FC = () => {
    const { barrierObservations, statistics } = useDigitsLab();

    if (statistics.sampleSize === 0) {
        return (
            <section className="dl-section dl-barriers">
                <h2>Barrier Observation</h2>
                <p className="dl-section__empty">Waiting for tick data…</p>
            </section>
        );
    }

    return (
        <section className="dl-section dl-barriers">
            <h2>Barrier Observation</h2>
            <p className="dl-section__desc">
                Observes what happens when the ticker hits numbers below and above barriers.
                Each barrier tracks hit rate, consecutive hits/misses, and the latest outcome.
            </p>
            <div className="dl-barrier-list">
                {barrierObservations.map((obs) => (
                    <BarrierRow key={obs.barrier} obs={obs} />
                ))}
            </div>
        </section>
    );
};

export default BarrierObservationPanel;
