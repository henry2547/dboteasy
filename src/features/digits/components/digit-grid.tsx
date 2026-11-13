import { formatCount, formatPercent, formatSigned } from '../format';
import type { DigitStatistics } from '../types';

interface DigitGridProps {
    statistics: DigitStatistics;
    /** The digit the ticker just landed on — marked with the yellow cursor. */
    currentDigit?: number | null;
}

const BUBBLE_SIZE = 48;
const BUBBLE_CENTER = BUBBLE_SIZE / 2;
const BUBBLE_RADIUS = 19;
const CURSOR_RADIUS = 22;

/**
 * Digit frequency bubbles: one circle per digit instead of a rectangle card.
 * The coloured disc inside grows with the digit's share of the window — green
 * for the hottest digit, purple for the second hottest, red for the coldest and
 * yellow for the second coldest — and a yellow cursor ring marks the digit the
 * ticker is on right now.
 */
export default function DigitGrid({ statistics, currentDigit = null }: DigitGridProps) {
    const hasSample = statistics.sampleSize > 0;
    const maxPercentage = Math.max(...statistics.frequencies.map(item => item.percentage), 1);

    return (
        <section className='digits-panel'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Digit frequency</h3>
                <span className='digits-panel__note'>
                    {hasSample ? `${formatCount(statistics.sampleSize)} ticks in window` : 'Waiting for ticks'}
                </span>
            </header>

            <div className='digits-grid'>
                {statistics.frequencies.map(frequency => {
                    const tie =
                        hasSample && statistics.frequencies.filter(item => item.count === frequency.count).length > 1;
                    const isCurrent = frequency.digit === currentDigit;
                    const heat = !hasSample
                        ? 'normal'
                        : frequency.isMostFrequent && !frequency.isLeastFrequent
                          ? 'hot'
                          : frequency.isLeastFrequent && !frequency.isMostFrequent
                            ? 'cold'
                            : frequency.isSecondMostFrequent
                              ? 'warm'
                              : frequency.isSecondLeastFrequent
                                ? 'cool'
                                : 'normal';
                    // How much of the circle is filled is the digit's share of the busiest digit.
                    const fillRadius = Math.max(2, (frequency.percentage / maxPercentage) * BUBBLE_RADIUS);
                    const percent = formatPercent(frequency.percentage);

                    return (
                        <article
                            key={frequency.digit}
                            className={
                                `digit-bubble digit-bubble--${heat}` +
                                (isCurrent ? ' digit-bubble--current' : '')
                            }
                            aria-current={isCurrent ? 'true' : undefined}
                        >
                            <svg
                                className='digit-bubble__dial'
                                viewBox={`0 0 ${BUBBLE_SIZE} ${BUBBLE_SIZE}`}
                                role='img'
                                aria-label={`Digit ${frequency.digit}: ${percent}${isCurrent ? ', current digit' : ''}`}
                            >
                                <circle
                                    cx={BUBBLE_CENTER}
                                    cy={BUBBLE_CENTER}
                                    r={BUBBLE_RADIUS}
                                    className='digit-bubble__track'
                                />
                                <circle
                                    cx={BUBBLE_CENTER}
                                    cy={BUBBLE_CENTER}
                                    r={fillRadius}
                                    className={`digit-bubble__fill digit-bubble__fill--${heat}`}
                                />
                                {isCurrent && (
                                    <>
                                        <circle
                                            cx={BUBBLE_CENTER}
                                            cy={BUBBLE_CENTER}
                                            r={CURSOR_RADIUS}
                                            className='digit-bubble__cursor'
                                        />
                                        <circle
                                            cx={BUBBLE_CENTER}
                                            cy={1.5}
                                            r={2}
                                            className='digit-bubble__cursor-pin'
                                        />
                                    </>
                                )}
                                <text
                                    x={BUBBLE_CENTER}
                                    y={BUBBLE_CENTER + 7}
                                    className='digit-bubble__digit'
                                >
                                    {frequency.digit}
                                </text>
                            </svg>

                            <span className='digit-bubble__percent'>{percent}</span>
                            <span className='digit-bubble__count'>{formatCount(frequency.count)} ticks</span>
                            <span
                                className={
                                    'digit-bubble__deviation ' +
                                    (frequency.deviationFromExpected >= 0
                                        ? 'digit-bubble__deviation--up'
                                        : 'digit-bubble__deviation--down')
                                }
                            >
                                {formatSigned(frequency.deviationFromExpected)} pts
                            </span>
                            <span className='digit-bubble__rank'>Rank {frequency.rank}</span>
                            {(heat !== 'normal' || tie) && (
                                <span className='digit-bubble__badges'>
                                    {heat === 'hot' && (
                                        <em className='digits-badge digits-badge--hot'>Hottest</em>
                                    )}
                                    {heat === 'warm' && (
                                        <em className='digits-badge digits-badge--warm'>2nd hottest</em>
                                    )}
                                    {heat === 'cool' && (
                                        <em className='digits-badge digits-badge--cool'>2nd coldest</em>
                                    )}
                                    {heat === 'cold' && (
                                        <em className='digits-badge digits-badge--cold'>Coldest</em>
                                    )}
                                    {tie && <em className='digits-badge digits-badge--tie'>Tie</em>}
                                </span>
                            )}
                        </article>
                    );
                })}
            </div>

            {hasSample && (
                <p className='digits-grid__legend'>
                    <span className='digits-grid__key digits-grid__key--cold'>Red · least frequent</span>
                    <span className='digits-grid__key digits-grid__key--cool'>Yellow · 2nd least</span>
                    <span className='digits-grid__key digits-grid__key--hot'>Green · most frequent</span>
                    <span className='digits-grid__key digits-grid__key--warm'>Purple · 2nd most</span>
                </p>
            )}
        </section>
    );
}
