import { useState } from 'react';
import { ENGINE_PRESETS, ENGINE_WINDOW, PRIMARY_DIGIT_CEILING, type EnginePreset } from '../config';

interface BeginnerGuideProps {
    /** True while the engine is running — presets change configuration, so they wait. */
    locked: boolean;
    isAuthorized: boolean;
    marketName: string;
    strategyLabel: string;
    windowTicks: number;
    onApplyPreset: (preset: EnginePreset) => void;
}

/**
 * Plain-language entry point for a first session: the three things a beginner
 * has to do, two ready-made settings presets, and an explainer of what the
 * engine actually does and what each setting means.
 *
 * It only describes the engine and writes configuration; it never starts,
 * stops or buys anything.
 */
export default function BeginnerGuide({
    locked,
    isAuthorized,
    marketName,
    strategyLabel,
    windowTicks,
    onApplyPreset,
}: BeginnerGuideProps) {
    const [appliedId, setAppliedId] = useState<string | null>(null);
    const windowReady = windowTicks >= ENGINE_WINDOW;

    return (
        <section className='ge-panel ge-guide' aria-label='Getting started with the trading engine'>
            <header className='ge-panel__head'>
                <h3 className='ge-panel__title'>New here? Start with these three steps</h3>
            </header>

            <ol className='ge-guide__steps'>
                <li>
                    <span className='ge-guide__step-number' aria-hidden='true'>
                        1
                    </span>
                    <span className='ge-guide__step-body'>
                        <strong>Sign in and stay on your Demo account.</strong> The engine sends real contract
                        purchases to Deriv, so practice on Demo first — the account shown at the top of the app is
                        the one it trades.
                        <span className={`ge-pill ${isAuthorized ? 'ge-pill--pass' : 'ge-pill--fail'}`}>
                            {isAuthorized ? 'Signed in' : 'Not signed in yet'}
                        </span>
                    </span>
                </li>
                <li>
                    <span className='ge-guide__step-number' aria-hidden='true'>
                        2
                    </span>
                    <span className='ge-guide__step-body'>
                        <strong>Pick a market and a strategy.</strong> Volatility markets run 24/7, so they are the
                        easiest place to start. “Over 1” wins when the last digit is 2–9, “Under 8” wins when it is
                        0–7.
                        <span className='ge-pill ge-pill--idle'>
                            {marketName} · {strategyLabel}
                        </span>
                    </span>
                </li>
                <li>
                    <span className='ge-guide__step-number' aria-hidden='true'>
                        3
                    </span>
                    <span className='ge-guide__step-body'>
                        <strong>Press Start engine and watch the panels below.</strong> The engine first loads the
                        latest {ENGINE_WINDOW.toLocaleString()} ticks, then waits for its entry pattern. It never
                        guesses: no entry means no trade.
                        <span className={`ge-pill ${windowReady ? 'ge-pill--pass' : 'ge-pill--idle'}`}>
                            {windowReady
                                ? `Window ready · ${ENGINE_WINDOW} ticks`
                                : `Loading the window · ${windowTicks}/${ENGINE_WINDOW}`}
                        </span>
                    </span>
                </li>
            </ol>

            <div className='ge-guide__presets'>
                <p className='ge-guide__presets-title'>
                    Or apply a ready-made setup <span className='ge-muted'>(you can still change every number)</span>
                </p>
                <div className='ge-guide__preset-row'>
                    {ENGINE_PRESETS.map(preset => (
                        <button
                            key={preset.id}
                            type='button'
                            className={`ge-guide__preset${appliedId === preset.id ? ' ge-guide__preset--applied' : ''}`}
                            disabled={locked}
                            title={locked ? 'Stop the engine before changing its settings.' : preset.description}
                            onClick={() => {
                                onApplyPreset(preset);
                                setAppliedId(preset.id);
                            }}
                        >
                            <span className='ge-guide__preset-label'>{preset.label}</span>
                            <span className='ge-guide__preset-text'>{preset.description}</span>
                        </button>
                    ))}
                </div>
            </div>

            <details className='ge-guide__details'>
                <summary>What the engine does, in plain words</summary>
                <dl className='ge-guide__terms'>
                    <div>
                        <dt>Over 1</dt>
                        <dd>
                            Wins when the last digit of the tick is anything except 0 or 1. It enters only while
                            digits 0 and 1 are each below {PRIMARY_DIGIT_CEILING}% of the last {ENGINE_WINDOW} ticks.
                        </dd>
                    </div>
                    <div>
                        <dt>Under 8</dt>
                        <dd>
                            Wins when the last digit is 0–7. It enters only while digits 8 and 9 are each below{' '}
                            {PRIMARY_DIGIT_CEILING}% of the window.
                        </dd>
                    </div>
                    <div>
                        <dt>The entry pattern</dt>
                        <dd>
                            Two consecutive losing digits (00, 01, 10 or 11 for Over 1) start a setup, and a later
                            digit from that same group confirms it. Digits in between never cancel it; a setup only
                            ends when it is confirmed or when its frequency filter fails.
                        </dd>
                    </div>
                    <div>
                        <dt>Even/Odd recovery</dt>
                        <dd>
                            After a primary loss the engine pauses primary entries and watches for two consecutive
                            even digits (it then buys ODD) or two odd digits (buys EVEN). A mixed pair is no entry,
                            and the attempt limit stops the episode — it is never an unlimited loop.
                        </dd>
                    </div>
                    <div>
                        <dt>Multiplier</dt>
                        <dd>
                            How much the stake grows after a loss. 1 keeps the stake flat; 2 doubles it (0.35 →
                            0.70 → 1.40), always capped by “Maximum stake”. A win resets it to the initial stake.
                        </dd>
                    </div>
                    <div>
                        <dt>Take profit / Stop loss</dt>
                        <dd>
                            The session stops itself at plus take profit or minus stop loss. Use small numbers for a
                            first run so the whole cycle is quick to watch.
                        </dd>
                    </div>
                </dl>
            </details>

            <details className='ge-guide__details'>
                <summary>What the status labels mean</summary>
                <dl className='ge-guide__terms'>
                    <div>
                        <dt>Frequency filter blocked</dt>
                        <dd>The losing digits are too common right now, so the engine waits instead of trading.</dd>
                    </div>
                    <div>
                        <dt>Waiting for pair / confirmation</dt>
                        <dd>A setup is forming. Nothing is bought until a confirmation digit arrives.</dd>
                    </div>
                    <div>
                        <dt>Purchase blocked</dt>
                        <dd>
                            A risk rule said no — for example an open contract, a closed market or the stake limit.
                            The exact reason is written in the journal below.
                        </dd>
                    </div>
                    <div>
                        <dt>Halted / Needs attention</dt>
                        <dd>Take profit, stop loss or a limit was reached. Open contracts still settle on Deriv.</dd>
                    </div>
                </dl>
            </details>

            <p className='ge-guide__risk'>
                Digit contracts are a high-risk product: every entry can lose its stake, and no window statistic
                predicts the next tick. Trade on Demo until you understand every panel on this page.
            </p>
        </section>
    );
}
