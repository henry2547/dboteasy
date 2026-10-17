/**
 * Analysis view — a detailed breakdown of the top-ranked market's digit
 * analysis: per-digit frequency bars (with deviation from expected), even/odd
 * and high/low splits, the current streak, sample size and feed freshness.
 * Renders inside the Trade Monitor as the "Analysis" tab.
 */

import { useAiBotContext } from '../ai-bot-context';
import type { DigitFrequencyInfo, MarketAnalysis, MarketRanking } from '../types';

function FrequencyBar({ freq }: { freq: DigitFrequencyInfo }) {
    const expected = 10;
    const over = freq.percentage >= expected;
    const cls = freq.isMostFrequent
        ? 'aibot-freq--hot'
        : freq.isLeastFrequent
          ? 'aibot-freq--cold'
          : over
            ? 'aibot-freq--over'
            : 'aibot-freq--under';
    const width = Math.min(100, Math.max(2, (freq.percentage / 20) * 100));

    return (
        <div className={`aibot-freq ${cls}`}>
            <span className='aibot-freq__digit'>{freq.digit}</span>
            <div className='aibot-freq__bar-track'>
                <div className='aibot-freq__bar' style={{ width: `${width}%` }} />
            </div>
            <span className='aibot-freq__pct'>{freq.percentage.toFixed(1)}%</span>
            <span className='aibot-freq__dev'>
                {freq.deviationFromExpected >= 0 ? '+' : ''}
                {freq.deviationFromExpected.toFixed(1)}
            </span>
        </div>
    );
}

function SplitBar({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className='aibot-split'>
            <span className='aibot-split__label'>{label}</span>
            <div className='aibot-split__bar'>
                <div className={`aibot-split__fill aibot-split__fill--${tone}`} style={{ width: `${value}%` }} />
            </div>
            <span className='aibot-split__value'>{value.toFixed(1)}%</span>
        </div>
    );
}

function AnalysisContent({ analysis }: { analysis: MarketAnalysis }) {
    const streak = analysis.currentStreak;

    return (
        <div className='aibot-analysis'>
            <div className='aibot-analysis__head'>
                <span className='aibot-analysis__name'>{analysis.displayName}</span>
                <span className='aibot-analysis__symbol'>{analysis.symbol}</span>
                <span className={`aibot-badge ${analysis.feedFresh ? 'aibot-badge--success' : 'aibot-badge--warning'}`}>
                    {analysis.feedFresh ? 'Feed live' : 'Stale feed'}
                </span>
            </div>

            <div className='aibot-analysis__meta'>
                <span>Sample: {analysis.sampleSize} ticks</span>
                <span>Mean abs. deviation: {analysis.meanAbsoluteDeviation.toFixed(2)}</span>
                {streak && (
                    <span>
                        Current streak: digit <strong>{streak.digit}</strong> ×{streak.length}
                    </span>
                )}
            </div>

            <div className='aibot-analysis__freqs'>
                <h4 className='aibot-analysis__subtitle'>Digit frequency</h4>
                <div className='aibot-freqs'>
                    {analysis.frequencies.map(f => (
                        <FrequencyBar key={f.digit} freq={f} />
                    ))}
                </div>
            </div>

            <div className='aibot-analysis__splits'>
                <h4 className='aibot-analysis__subtitle'>Distribution</h4>
                <SplitBar label='Even' value={analysis.evenPercentage} tone='even' />
                <SplitBar label='Odd' value={analysis.oddPercentage} tone='odd' />
                <SplitBar label='Low (0–4)' value={analysis.lowPercentage} tone='low' />
                <SplitBar label='High (5–9)' value={analysis.highPercentage} tone='high' />
            </div>
        </div>
    );
}

export default function AnalysisView() {
    const { state } = useAiBotContext();
    const { rankings } = state;

    if (rankings.length === 0) {
        return (
            <p className='aibot-empty'>
                No analysis yet. Click "Scan now" to evaluate the markets — the top market&apos;s digit breakdown
                appears here.
            </p>
        );
    }

    const top = rankings[0] as MarketRanking;

    return <AnalysisContent analysis={top.analysis} />;
}
