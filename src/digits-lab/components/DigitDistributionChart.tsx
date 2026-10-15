/**
 * Digit distribution bar chart — SVG-based, responsive.
 * Shows percentage per digit with a 10% reference line.
 */

import React from 'react';
import { useDigitsLab } from '../store';
import { EXPECTED_DIGIT_PERCENTAGE } from '../constants';

const DigitDistributionChart: React.FC = () => {
    const { statistics } = useDigitsLab();

    if (statistics.sampleSize === 0) {
        return (
            <div className="dl-chart dl-chart--empty">
                <h3>Digit Distribution</h3>
                <p>No data</p>
            </div>
        );
    }

    const maxPct = Math.max(...statistics.frequencies.map((f) => f.percentage), EXPECTED_DIGIT_PERCENTAGE + 5);
    const chartHeight = 200;
    const barWidth = 40;
    const gap = 12;
    const svgWidth = 10 * (barWidth + gap) + gap;
    const refY = chartHeight - (EXPECTED_DIGIT_PERCENTAGE / maxPct) * chartHeight;

    return (
        <div className="dl-chart dl-chart--distribution">
            <h3>Digit Distribution</h3>
            <div className="dl-chart__container">
                <svg viewBox={`0 0 ${svgWidth} ${chartHeight + 40}`} className="dl-chart__svg" preserveAspectRatio="xMidYMid meet">
                    {/* Reference line at 10% */}
                    <line
                        x1={gap}
                        y1={refY}
                        x2={svgWidth - gap}
                        y2={refY}
                        stroke="#999"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                    />
                    <text x={svgWidth - gap} y={refY - 4} textAnchor="end" fontSize="10" fill="#999">
                        10%
                    </text>

                    {/* Bars */}
                    {statistics.frequencies.map((freq, i) => {
                        const barHeight = (freq.percentage / maxPct) * chartHeight;
                        const x = gap + i * (barWidth + gap);
                        const y = chartHeight - barHeight;
                        const color = freq.isMostFrequent
                            ? '#28a745'
                            : freq.isLeastFrequent
                                ? '#dc3545'
                                : '#4a90d9';
                        return (
                            <g key={freq.digit}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={barHeight}
                                    fill={color}
                                    rx="3"
                                >
                                    <title>
                                        Digit {freq.digit}: {freq.count} ({freq.percentage.toFixed(1)}%,
                                        {' '}deviation {freq.deviationFromExpected >= 0 ? '+' : ''}{freq.deviationFromExpected.toFixed(1)})
                                    </title>
                                </rect>
                                <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#666">
                                    {freq.percentage.toFixed(1)}%
                                </text>
                                <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" fontSize="12" fill="#333" fontWeight="bold">
                                    {freq.digit}
                                </text>
                                <text x={x + barWidth / 2} y={chartHeight + 30} textAnchor="middle" fontSize="9" fill="#999">
                                    {freq.count}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

export default DigitDistributionChart;
