import { formatPercent } from '../digits/format';
import {
    ENTRY_MASTER_PP,
    MACRO_WINDOW,
    type ConfluenceResult,
    type WindowSnapshot,
} from './engine-scoring';

interface ConsolidatedSignalProps {
    result: ConfluenceResult | null;
    marketName: string;
    sample: number;
    connected: boolean;
    isLoading: boolean;
    errorMessage: string | null;
}

const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

/**
 * The ONE output block: market, strategy, final verdict, confluence
 * confidence and the single line of alignment context. The three window rows
 * below it are the evidence behind the verdict, never a second signal.
 */
export default function ConsolidatedSignal({
    result,
    marketName,
    sample,
    connected,
    isLoading,
    errorMessage,
}: ConsolidatedSignalProps) {
    const verdict = result?.verdict ?? 'hold';
    const warming = !result || !result.complete;

    return (
        <section className='espec-sig' aria-live='polite'>
            <div className='espec-sig__head'>
                <span className='espec-sig__kicker'>Single consolidated output</span>
                <span className={`espec-sig__live${connected ? ' espec-sig__live--on' : ''}`}>
                    {connected ? 'Live feed' : isLoading ? 'Connecting' : 'Offline'}
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
                <span className='espec-sig__verdict-label'>{result?.verdictLabel ?? 'HOLD — NEUTRAL'}</span>
                <span className='espec-sig__verdict-reason'>
                    {result?.reason ??
                        (errorMessage ?? (isLoading ? 'Loading tick history…' : 'Waiting for the live digit feed.'))}
                </span>
            </div>

            <div className='espec-sig__confidence'>
                <div className='espec-sig__confidence-top'>
                    <span className='espec-sig__confidence-label'>Master confluence confidence</span>
                    <span className='espec-sig__confidence-value'>
                        {result ? `${result.confidence.toFixed(1)}%` : '—'}
                    </span>
                </div>
                <div
                    className='espec-sig__bar'
                    role='progressbar'
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={result?.confidence ?? 0}
                >
                    <span
                        className={`espec-sig__bar-fill espec-sig__bar-fill--${verdict}`}
                        style={{ width: `${result?.confidence ?? 0}%` }}
                    />
                </div>
                <div className='espec-sig__confidence-meta'>
                    <span>
                        Master score{' '}
                        <strong className={(result?.masterScore ?? 0) >= 0 ? 'is-up' : 'is-down'}>
                            {result ? `${signed(result.masterScore, 2)} pp` : '—'}
                        </strong>
                    </span>
                    <span>
                        {result ? `${result.alignment}/3 windows aligned` : `0/${MACRO_WINDOW} ticks`} · entry at{' '}
                        {signed(ENTRY_MASTER_PP, 1)} pp
                    </span>
                </div>
            </div>

            <p className='espec-sig__headline'>
                {result
                    ? result.headline
                    : `Collecting the macro baseline — ${sample}/${MACRO_WINDOW} ticks stored.`}
            </p>

            {result && (
                <div className='espec-sig__windows'>
                    <WindowRow window={result.windows.micro} />
                    <WindowRow window={result.windows.mid} />
                    <WindowRow window={result.windows.macro} />
                </div>
            )}

            {result?.cooling && (
                <p className='espec-sig__notice'>
                    Auto-cooldown active — {result.coolingTicksLeft} ticks left after the micro window flipped
                    direction.
                </p>
            )}

            {result && !result.cooling && result.regime.broken && (
                <p className='espec-sig__notice espec-sig__notice--warn'>{result.regime.reason}</p>
            )}

            {warming && (
                <p className='espec-sig__notice'>
                    Warming up: the verdict stays HOLD until all three windows are full (25 / 100 / 500 ticks).
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
                <span className='espec-sig__window-weight'>×{w.weight.toFixed(2)}</span>
            </span>
        </div>
    );
}
