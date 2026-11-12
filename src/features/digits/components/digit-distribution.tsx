import { useMemo, useState } from 'react';
import { formatPercent } from '../format';
import type { DigitStatistics } from '../types';

interface DigitDistributionProps {
    statistics: DigitStatistics;
    /** The most recent digits, oldest first — the history strip draws the newest 20. */
    recentDigits?: number[];
}

type HistoryMode = 'even_odd' | 'over_under';
type BarrierSide = 'over' | 'under';

const HISTORY_LENGTH = 20;
const SIDES: { id: BarrierSide; label: string; strategies: number[] }[] = [
    { id: 'over', label: 'Over', strategies: [1, 2] },
    { id: 'under', label: 'Under', strategies: [7, 8] },
];

/**
 * Digit history and digit circle.
 *
 * Even/Odd marks each of the last 20 digits with its first letter (E or O) in
 * its own colour. Over/Under lets the user pick a side and the barrier they
 * trade, then colours every digit green when that contract would have won and
 * red when it would have lost.
 */
export default function DigitDistribution({ statistics, recentDigits = [] }: DigitDistributionProps) {
    const [mode, setMode] = useState<HistoryMode>('even_odd');
    const [side, setSide] = useState<BarrierSide>('over');
    const [barrier, setBarrier] = useState(1);

    const history = recentDigits.slice(-HISTORY_LENGTH);
    const strategies = SIDES.find(item => item.id === side)?.strategies ?? [1, 2];

    const chooseSide = (next: BarrierSide) => {
        setSide(next);
        setBarrier(SIDES.find(item => item.id === next)?.strategies[0] ?? 1);
    };

    const wins = useMemo(
        () => history.filter(digit => (side === 'over' ? digit > barrier : digit < barrier)).length,
        [history, side, barrier]
    );
    const evenCount = history.filter(digit => digit % 2 === 0).length;

    const isWinner = (digit: number) =>
        mode === 'even_odd' ? digit % 2 === 0 : side === 'over' ? digit > barrier : digit < barrier;

    return (
        <section className='digits-panel digits-history'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Digit history &amp; circle</h3>
                <span className='digits-panel__note'>Last {HISTORY_LENGTH} digits</span>
            </header>

            <div className='digits-history__modes' role='group' aria-label='History market'>
                <button
                    type='button'
                    className={`digits-history__mode${mode === 'even_odd' ? ' digits-history__mode--active' : ''}`}
                    onClick={() => setMode('even_odd')}
                >
                    Even / Odd
                </button>
                <button
                    type='button'
                    className={`digits-history__mode${mode === 'over_under' ? ' digits-history__mode--active' : ''}`}
                    onClick={() => setMode('over_under')}
                >
                    Over / Under
                </button>
            </div>

            {mode === 'over_under' && (
                <div className='digits-history__picks'>
                    <div className='digits-history__pick' role='group' aria-label='Side'>
                        <span className='digits-history__pick-label'>Side</span>
                        {SIDES.map(item => (
                            <button
                                type='button'
                                key={item.id}
                                className={`digits-history__option${side === item.id ? ' digits-history__option--active' : ''}`}
                                onClick={() => chooseSide(item.id)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className='digits-history__pick' role='group' aria-label='Strategy'>
                        <span className='digits-history__pick-label'>Strategy</span>
                        {strategies.map(value => (
                            <button
                                type='button'
                                key={value}
                                className={`digits-history__option${barrier === value ? ' digits-history__option--active' : ''}`}
                                onClick={() => setBarrier(value)}
                            >
                                {side === 'over' ? 'Over' : 'Under'} {value}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {history.length === 0 ? (
                <p className='digits-empty'>Waiting for ticks to build the digit history…</p>
            ) : (
                <>
                    <ul className='digits-history__strip' aria-label='Last 20 digits'>
                        {history.map((digit, index) => {
                            const newest = index === history.length - 1;
                            const tone =
                                mode === 'even_odd'
                                    ? digit % 2 === 0
                                        ? 'even'
                                        : 'odd'
                                    : isWinner(digit)
                                      ? 'win'
                                      : 'lose';

                            return (
                                <li
                                    key={`${index}-${digit}`}
                                    className={`digits-history__cell digits-history__cell--${tone}${
                                        newest ? ' digits-history__cell--newest' : ''
                                    }`}
                                    title={`Digit ${digit}`}
                                >
                                    {mode === 'even_odd' ? (digit % 2 === 0 ? 'E' : 'O') : digit}
                                </li>
                            );
                        })}
                    </ul>

                    {mode === 'even_odd' ? (
                        <p className='digits-history__legend'>
                            <span className='digits-history__key digits-history__key--even'>E</span> even{' '}
                            {evenCount}/{history.length} ·{' '}
                            <span className='digits-history__key digits-history__key--odd'>O</span> odd{' '}
                            {history.length - evenCount}/{history.length} ·{' '}
                            {evenCount >= history.length - evenCount ? 'Even' : 'Odd'} leaned last{' '}
                            {history.length} digits
                        </p>
                    ) : (
                        <p className='digits-history__legend'>
                            <span className='digits-history__key digits-history__key--win'>win</span> {wins}/
                            {history.length} ·{' '}
                            <span className='digits-history__key digits-history__key--lose'>lose</span>{' '}
                            {history.length - wins}/{history.length} on{' '}
                            {side === 'over' ? 'Over' : 'Under'} {barrier} · expected{' '}
                            {side === 'over' ? `${((9 - barrier) * 10).toFixed(0)}%` : `${(barrier * 10).toFixed(0)}%`}
                        </p>
                    )}

                    {mode === 'over_under' && (
                        <p className='digits-history__note'>
                            {side === 'over'
                                ? `Over ${barrier} wins on ${barrier + 1}–9 and loses on 0–${barrier}.`
                                : `Under ${barrier} wins on 0–${barrier - 1} and loses on ${barrier}–9.`}
                        </p>
                    )}
                </>
            )}

            {statistics.sampleSize > 0 && (
                <DigitCircle statistics={statistics} mode={mode} side={side} barrier={barrier} />
            )}
        </section>
    );
}

const CIRCLE_SIZE = 240;
const CIRCLE_CENTER = CIRCLE_SIZE / 2;
const CIRCLE_RADIUS = 74;
const LABEL_RADIUS = 101;

/**
 * The digit circle: each digit sits on the ring, sized by how often it has
 * appeared. In Over/Under mode the winning digits are drawn green and the
 * losing ones red, so the selected contract is readable at a glance.
 */
function DigitCircle({
    statistics,
    mode,
    side,
    barrier,
}: {
    statistics: DigitStatistics;
    mode: HistoryMode;
    side: BarrierSide;
    barrier: number;
}) {
    const { frequencies, sampleSize } = statistics;
    const maxPercentage = Math.max(...frequencies.map(item => item.percentage), 1);

    const toneOf = (digit: number) => {
        if (mode === 'even_odd') return digit % 2 === 0 ? 'even' : 'odd';
        const wins = side === 'over' ? digit > barrier : digit < barrier;
        return wins ? 'win' : 'lose';
    };

    return (
        <svg
            className='digits-circle'
            viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
            role='img'
            aria-label='Digit circle percentages coloured by the selected market'
        >
            <circle cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={CIRCLE_RADIUS} className='digits-circle__ring' />

            {frequencies.map((item, index) => {
                const angle = (index / frequencies.length) * Math.PI * 2 - Math.PI / 2;
                const nodeX = CIRCLE_CENTER + Math.cos(angle) * CIRCLE_RADIUS;
                const nodeY = CIRCLE_CENTER + Math.sin(angle) * CIRCLE_RADIUS;
                const labelX = CIRCLE_CENTER + Math.cos(angle) * LABEL_RADIUS;
                const labelY = CIRCLE_CENTER + Math.sin(angle) * LABEL_RADIUS;
                const radius = 15 + (item.percentage / maxPercentage) * 7;
                const tone = toneOf(item.digit);

                return (
                    <g key={item.digit}>
                        {item.isMostFrequent && (
                            <circle
                                cx={nodeX}
                                cy={nodeY}
                                r={radius + 4}
                                className='digits-circle__marker digits-circle__marker--top'
                            />
                        )}
                        <circle
                            cx={nodeX}
                            cy={nodeY}
                            r={radius}
                            className={`digits-circle__node digits-circle__node--${tone}`}
                        />
                        <text x={nodeX} y={nodeY + 4} className='digits-circle__digit'>
                            {item.digit}
                        </text>
                        <text x={labelX} y={labelY + 3} className='digits-circle__percent'>
                            {formatPercent(item.percentage, 0)}
                        </text>
                    </g>
                );
            })}

            <text x={CIRCLE_CENTER} y={CIRCLE_CENTER - 3} className='digits-circle__center-value'>
                {sampleSize}
            </text>
            <text x={CIRCLE_CENTER} y={CIRCLE_CENTER + 13} className='digits-circle__center-label'>
                ticks
            </text>
        </svg>
    );
}
