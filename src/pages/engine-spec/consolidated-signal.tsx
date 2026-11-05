import { formatPercent } from '../digits/format';
import { MACRO_WINDOW, type ConfluenceResult, type WindowSnapshot } from './engine-scoring';

interface ConsolidatedSignalProps {
    result: ConfluenceResult | null;
    marketName: string;
    sample: number;
    connected: boolean;
    precisionReady: boolean;
    isLoading: boolean;
    errorMessage: string | null;
}

const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

/**
 * The ONE consolidated output: market, strategy, final verdict, Master Score,
 * alignment, reliability, cooldown and the summary of why the engine decided.
 * The three window rows underneath are evidence, never a second signal.
 */
export default function ConsolidatedSignal({
    result,
    marketName,
    sample,
    connected,
    precisionReady,
    isLoading,
    errorMessage,
}: ConsolidatedSignalProps) {
    const verdict = result?.verdict ?? 'blocked';
    const warming = !result || !result.complete;

    const fallback = errorMessage ?? (isLoading ? 'Loading tick history…' : 'Waiting for the live digit feed.');

    return (
        <section className='espec-sig' aria-live='polite'>
            <div className='espec-sig__head'>
                <span className='espec-sig__kicker'>Single consolidated output</span>
                <span
                    className={`espec-sig__live${connected ? ' espec-sig__live--on' : ''}`}
                    title={precisionReady ? 'Quote precision resolved' : 'Quote precision unresolved'}
                >
                    {connected ? (precisionReady ? 'Live feed' : 'Precision pending') : isLoading ? 'Connecting' : 'Offline'}
                </span>
            </div>

            <div className='espec-sig__market'>
                <span className='espec-sig__market-name'>{marketName}</span>
                <span className='espec-sig__divider'>|</span>
                <span className='espec-sig__strategy'>
                    {result ? `${result.strategy.label} Strategy` : 'No strategy'}
                </span>
            </div>

            <div className={`espec-sig__verdict espec-sig__verdict--${verdict}`}>
                <span className='espec-sig__verdict-label'>{result?.verdictLabel ?? 'HOLD — BLOCKED'}</span>
                <span className='espec-sig__verdict-reason'>{result?.reason ?? fallback}</span>
            </div>

            <div className='espec-sig__grid'>
                <div className='espec-sig__cell'>
                    <span className='espec-sig__cell-label'>Master confluence score</span>
                    <span
                        className={`espec-sig__cell-value${
                            result && result.masterScore >= 0 ? ' is-up' : result ? ' is-down' : ''
                        }`}
                    >
                        {result ? `${signed(result.masterScore, 2)} pp` : '—'}
                    </span>
                    <span className='espec-sig__cell-hint'>percentage points, never a win probability</span>
                </div>
                <div className='espec-sig__cell'>
                    <span className='espec-sig__cell-label'>Window alignment</span>
                    <span className='espec-sig__cell-value'>{result?.alignmentLabel ?? '—'}</span>
                    <span className='espec-sig__cell-hint'>strong · moderate · conflict · none</span>
                </div>
                <div className='espec-sig__cell'>
                    <span className='espec-sig__cell-label'>Statistical reliability</span>
                    <span className='espec-sig__cell-value'>{result?.reliabilityLabel ?? '—'}</span>
                    <span className='espec-sig__cell-hint'>two-sided 95% significance per window</span>
                </div>
                <div className='espec-sig__cell'>
                    <span className='espec-sig__cell-label'>Cooldown</span>
                    <span className={`espec-sig__cell-value${result?.cooldown.active ? ' is-down' : ''}`}>
                        {result ? (result.cooldown.active ? `Active · ${result.cooldown.ticksLeft}t` : 'Inactive') : '—'}
                    </span>
                    <span className='espec-sig__cell-hint'>
                        {result?.cooldown.reason ?? 'no confluence break detected'}
                    </span>
                </div>
            </div>

            {result && (
                <p className='espec-sig__calc'>
                    Master = (micro {signed(result.windows.micro.deltaPp)} × {result.weights.micro.toFixed(2)}) +
                    (mid {signed(result.windows.mid.deltaPp)} × {result.weights.mid.toFixed(2)}) + (macro{' '}
                    {signed(result.windows.macro.deltaPp)} × {result.weights.macro.toFixed(2)}) ={' '}
                    <strong>{signed(result.masterScore, 2)} pp</strong>
                </p>
            )}

            {result && (
                <div className='espec-sig__windows'>
                    <WindowRow window={result.windows.micro} />
                    <WindowRow window={result.windows.mid} />
                    <WindowRow window={result.windows.macro} />
                </div>
            )}

            <p className='espec-sig__headline'>
                {result ? result.summary : `Collecting the macro baseline — ${sample}/${MACRO_WINDOW} ticks stored.`}
            </p>

            {warming && (
                <p className='espec-sig__notice'>
                    Warming up: the verdict stays HOLD until all three windows are full (25 / 100 / 500 ticks). No
                    order is ever placed from this page.
                </p>
            )}

            {result && !result.cooldown.active && result.regime.broken && (
                <p className='espec-sig__notice espec-sig__notice--warn'>{result.regime.reason}</p>
            )}

            {result && result.microShift.reason && (
                <p className='espec-sig__notice espec-sig__notice--warn'>
                    {result.microShift.reason} · micro change {signed(result.microShift.deltaChangePp)} pp (
                    {signed(result.microShift.velocityPpPerTick, 2)} pp/tick).
                </p>
            )}
        </section>
    );
}

function WindowRow({ window: w }: { window: WindowSnapshot }) {
    const positive = w.deltaPp >= 0;
    return (
        <div className='espec-sig__window'>
            <span className='espec-sig__window-name'>
                {w.label}
                <em>{w.size}t</em>
            </span>
            <span className='espec-sig__window-nums'>
                <span className='espec-sig__window-share'>{formatPercent(w.actual * 100, 1)}</span>
                <span className='espec-sig__window-base'>vs {formatPercent(w.expected * 100, 0)}</span>
                <span className={`espec-sig__window-delta${positive ? ' is-up' : ' is-down'}`}>
                    {signed(w.deltaPp, 1)} pp
                </span>
                <span className='espec-sig__window-weight'>
                    {formatPercent(w.ciLowPct, 0)}–{formatPercent(w.ciHighPct, 0)} CI
                </span>
            </span>
        </div>
    );
}
