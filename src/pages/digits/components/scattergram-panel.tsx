import { SCATTER_DEPTH } from '../engines';
import type { Scattergram } from '../engines';

interface ScattergramPanelProps {
    scattergram: Scattergram;
}

const WIDTH = 320;
const HEIGHT = 148;
const PAD_LEFT = 20;
const PAD_BOTTOM = 16;
const PAD_TOP = 8;
const PAD_RIGHT = 8;

/** A stable hue per digit so the same digit reads the same colour everywhere. */
function digitColor(digit: number): string {
    return `hsl(${digit * 36} 68% 55%)`;
}

/** Engine D — the digit stream re-projected onto digit (y) vs tick index (x). */
export default function ScattergramPanel({ scattergram }: ScattergramPanelProps) {
    const { points, mostClustered, mostRhythmic } = scattergram;
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const oldestIndex = points.length ? points[0].tickIndex : -SCATTER_DEPTH;
    const span = Math.max(1, -oldestIndex);

    return (
        <section className='digits-panel digits-scatter'>
            <header className='digits-panel__head'>
                <h3 className='digits-panel__title'>Digit scattergram</h3>
                <span className='digits-panel__note'>Pacing &amp; spacing · back to −{SCATTER_DEPTH}</span>
            </header>

            {points.length === 0 ? (
                <p className='digits-empty'>Waiting for ticks to map the pacing.</p>
            ) : (
                <svg
                    className='digits-scatter__chart'
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    preserveAspectRatio='none'
                    role='img'
                    aria-label='Digit occurrences plotted against tick index'
                >
                    {Array.from({ length: 10 }, (_, digit) => {
                        const y = PAD_TOP + ((9 - digit) / 9) * plotHeight;
                        return (
                            <g key={digit}>
                                <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} className='digits-scatter__grid' />
                                <text x={PAD_LEFT - 4} y={y + 3} className='digits-scatter__axis-label' textAnchor='end'>
                                    {digit}
                                </text>
                            </g>
                        );
                    })}

                    <text x={PAD_LEFT} y={HEIGHT - 4} className='digits-scatter__axis-label'>
                        −{Math.round(span)}
                    </text>
                    <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 4} className='digits-scatter__axis-label' textAnchor='end'>
                        now
                    </text>

                    {points.map(point => {
                        const x = PAD_LEFT + ((point.tickIndex + span) / span) * plotWidth;
                        const y = PAD_TOP + ((9 - point.digit) / 9) * plotHeight;
                        return (
                            <circle
                                key={`${point.tickIndex}:${point.epoch}`}
                                cx={x}
                                cy={y}
                                r={2.4}
                                fill={digitColor(point.digit)}
                                className='digits-scatter__dot'
                            />
                        );
                    })}
                </svg>
            )}

            <div className='digits-scatter__reads'>
                <span>
                    Most clustered:{' '}
                    <strong>
                        {mostClustered
                            ? `${mostClustered.digit} (${mostClustered.occurrences} hits, CV ${mostClustered.coefficientOfVariation?.toFixed(2)})`
                            : '—'}
                    </strong>
                </span>
                <span>
                    Most rhythmic:{' '}
                    <strong>
                        {mostRhythmic
                            ? `${mostRhythmic.digit} (${mostRhythmic.occurrences} hits, CV ${mostRhythmic.coefficientOfVariation?.toFixed(2)})`
                            : '—'}
                    </strong>
                </span>
            </div>
        </section>
    );
}
