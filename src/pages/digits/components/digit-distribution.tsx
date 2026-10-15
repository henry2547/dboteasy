import { formatPercent } from '../format';
import { EXPECTED_DIGIT_PERCENTAGE } from '../statistics';
import type { DigitStatistics } from '../types';

interface DigitDistributionProps {
    statistics: DigitStatistics;
}

const CHART_WIDTH = 360;
const CHART_HEIGHT = 210;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PLOT_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

/** The bar chart is the distribution view; the ring is the digit-circle view. */
export default function DigitDistribution({ statistics }: DigitDistributionProps) {
    const { frequencies, sampleSize } = statistics;
    const maxPercentage = Math.max(20, ...frequencies.map(item => item.percentage));
    const barWidth = PLOT_WIDTH / frequencies.length;

    const yFor = (percentage: number) => PAD_TOP + PLOT_HEIGHT * (1 - percentage / maxPercentage);
    const referenceY = yFor(EXPECTED_DIGIT_PERCENTAGE);

    return (
        <section className='digits-panel'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Distribution &amp; digit circle</h3>
                <span className='digits-panel__note'>Expected 10% per digit</span>
            </header>

            {sampleSize === 0 ? (
                <p className='digits-empty'>Waiting for ticks to build a distribution…</p>
            ) : (
                <div className='digits-distribution'>
                    <svg
                        className='digits-chart'
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        role='img'
                        aria-label='Digit distribution bar chart'
                    >
                        {[0, 10, 20, 30].map(tick => {
                            if (tick > maxPercentage) return null;
                            const y = yFor(tick);
                            return (
                                <g key={tick}>
                                    <line
                                        x1={PAD_LEFT}
                                        x2={CHART_WIDTH - PAD_RIGHT}
                                        y1={y}
                                        y2={y}
                                        className='digits-chart__grid'
                                    />
                                    <text x={PAD_LEFT - 6} y={y + 3} className='digits-chart__axis'>
                                        {tick}%
                                    </text>
                                </g>
                            );
                        })}

                        <line
                            x1={PAD_LEFT}
                            x2={CHART_WIDTH - PAD_RIGHT}
                            y1={referenceY}
                            y2={referenceY}
                            className='digits-chart__reference'
                        />
                        <text x={CHART_WIDTH - PAD_RIGHT} y={referenceY - 4} className='digits-chart__reference-label'>
                            10%
                        </text>

                        {frequencies.map((item, index) => {
                            const x = PAD_LEFT + index * barWidth + barWidth * 0.18;
                            const width = barWidth * 0.64;
                            const y = yFor(item.percentage);
                            const height = PAD_TOP + PLOT_HEIGHT - y;
                            return (
                                <g key={item.digit}>
                                    <rect
                                        x={x}
                                        y={height > 0 ? y : PAD_TOP + PLOT_HEIGHT}
                                        width={width}
                                        height={Math.max(height, 1)}
                                        rx={3}
                                        className={
                                            item.isMostFrequent
                                                ? 'digits-chart__bar digits-chart__bar--top'
                                                : 'digits-chart__bar'
                                        }
                                    />
                                    <text
                                        x={x + width / 2}
                                        y={PAD_TOP + PLOT_HEIGHT + 17}
                                        className='digits-chart__axis digits-chart__axis--digit'
                                    >
                                        {item.digit}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>

                    <DigitCircle statistics={statistics} />
                </div>
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
 * appeared, with its percentage just outside.
 */
function DigitCircle({ statistics }: { statistics: DigitStatistics }) {
    const { frequencies, sampleSize } = statistics;
    const maxPercentage = Math.max(...frequencies.map(item => item.percentage), 1);

    return (
        <svg
            className='digits-circle'
            viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
            role='img'
            aria-label='Digit circle percentages'
        >
            <circle cx={CIRCLE_CENTER} cy={CIRCLE_CENTER} r={CIRCLE_RADIUS} className='digits-circle__ring' />

            {frequencies.map((item, index) => {
                const angle = (index / frequencies.length) * Math.PI * 2 - Math.PI / 2;
                const nodeX = CIRCLE_CENTER + Math.cos(angle) * CIRCLE_RADIUS;
                const nodeY = CIRCLE_CENTER + Math.sin(angle) * CIRCLE_RADIUS;
                const labelX = CIRCLE_CENTER + Math.cos(angle) * LABEL_RADIUS;
                const labelY = CIRCLE_CENTER + Math.sin(angle) * LABEL_RADIUS;
                const radius = 15 + (item.percentage / maxPercentage) * 7;

                return (
                    <g key={item.digit}>
                        <circle cx={nodeX} cy={nodeY} r={radius} className='digits-circle__node' />
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
