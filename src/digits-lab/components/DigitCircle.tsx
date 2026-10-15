/**
 * Digit circle — circular visualization of digit percentages.
 * Each digit 0-9 is placed around a circle, with size/opacity
 * proportional to its frequency.
 */

import React from 'react';
import { useDigitsLab } from '../store';
import { DIGITS } from '../constants';

const DigitCircle: React.FC = () => {
    const { digitCirclePercentages, statistics } = useDigitsLab();

    if (statistics.sampleSize === 0) {
        return (
            <div className="dl-chart dl-chart--circle dl-chart--empty">
                <h3>Digit Circle</h3>
                <p>No data</p>
            </div>
        );
    }

    const cx = 130;
    const cy = 130;
    const radius = 90;
    const maxPct = Math.max(...digitCirclePercentages, 1);

    return (
        <div className="dl-chart dl-chart--circle">
            <h3>Digit Circle — Percentage Distribution</h3>
            <div className="dl-chart__container">
                <svg viewBox="0 0 260 260" className="dl-chart__svg" preserveAspectRatio="xMidYMid meet">
                    {/* Center circle */}
                    <circle cx={cx} cy={cy} r={radius - 20} fill="none" stroke="#e0e0e0" strokeWidth="1" />
                    <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#d0d0d0" strokeWidth="1" strokeDasharray="2 4" />

                    {DIGITS.map((digit, i) => {
                        const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
                        const pct = digitCirclePercentages[i] ?? 0;
                        const normalizedRadius = radius - 5;
                        const x = cx + normalizedRadius * Math.cos(angle);
                        const y = cy + normalizedRadius * Math.sin(angle);

                        // Bar from center to edge proportional to percentage
                        const barR = (pct / maxPct) * (radius - 25);
                        const barX = cx + barR * Math.cos(angle);
                        const barY = cy + barR * Math.sin(angle);

                        const freq = statistics.frequencies[i];
                        const color = freq?.isMostFrequent ? '#28a745' : freq?.isLeastFrequent ? '#dc3545' : '#4a90d9';

                        return (
                            <g key={digit}>
                                {/* Bar */}
                                <line
                                    x1={cx}
                                    y1={cy}
                                    x2={barX}
                                    y2={barY}
                                    stroke={color}
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    opacity="0.6"
                                >
                                    <title>Digit {digit}: {pct.toFixed(1)}%</title>
                                </line>
                                {/* Digit label */}
                                <circle cx={x} cy={y} r="14" fill={color} opacity="0.85" />
                                <text
                                    x={x}
                                    y={y + 5}
                                    textAnchor="middle"
                                    fontSize="14"
                                    fontWeight="bold"
                                    fill="white"
                                >
                                    {digit}
                                </text>
                                {/* Percentage */}
                                <text
                                    x={cx + (radius + 12) * Math.cos(angle)}
                                    y={cy + (radius + 12) * Math.sin(angle) + 4}
                                    textAnchor="middle"
                                    fontSize="9"
                                    fill="#666"
                                >
                                    {pct.toFixed(1)}%
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

export default DigitCircle;
