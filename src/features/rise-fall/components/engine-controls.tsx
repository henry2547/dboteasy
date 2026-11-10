import React from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import { EXECUTION_MODES, MODE_LABELS } from '../types';
import type { EngineSnapshot, ExecutionMode, ModeSnapshot } from '../types';

const STATE_LABELS: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    paused: 'Paused',
    stopped: 'Stopped',
    halted: 'Halted',
};

const MODE_NOTES: Record<ExecutionMode, string> = {
    virtual: 'Simulated fills on genuine live Deriv ticks. No purchase is sent to Deriv.',
    demo: 'Real proposals and purchases on your Demo account, over the authenticated Deriv socket.',
    real: 'Real money. Entries need an armed mode and your confirmation on every single trade.',
};

interface EngineControlsProps {
    mode: ExecutionMode;
    active: ModeSnapshot;
    notice: string | null;
    lastOutcome: EngineSnapshot['lastOutcome'];
    onSetMode: (mode: ExecutionMode) => void;
    onStart: () => void;
    onPause: () => void;
    onStop: () => void;
    onEmergency: () => void;
    onReleaseEmergency: () => void;
}

/** Mode selection and the run controls. Every switch is refused while a contract is open. */
const EngineControls = ({
    mode,
    active,
    notice,
    lastOutcome,
    onSetMode,
    onStart,
    onPause,
    onStop,
    onEmergency,
    onReleaseEmergency,
}: EngineControlsProps) => (
    <section className='rise-fall__section' data-testid='rise-fall-controls'>
        <div className='rise-fall__section-head'>
            <h3>{localize('Execution mode')}</h3>
            <span className='rise-fall__status' data-testid='rise-fall-status'>
                {STATE_LABELS[active.state] ?? active.state}
            </span>
        </div>
        <div className='rise-fall__modes' role='group' aria-label={localize('Execution mode')}>
            {EXECUTION_MODES.map(item => (
                <button
                    key={item}
                    type='button'
                    data-testid={`rise-fall-mode-${item}`}
                    aria-pressed={mode === item}
                    className={classNames('rise-fall__mode', { 'is-active': mode === item })}
                    onClick={() => onSetMode(item)}
                >
                    {MODE_LABELS[item]}
                </button>
            ))}
        </div>
        <p className='rise-fall__note' data-testid='rise-fall-mode-note'>
            {MODE_NOTES[mode]}
        </p>
        {active.haltReason && (
            <p className='rise-fall__note rise-fall__note--danger' data-testid='rise-fall-halt'>
                {active.haltReason}
            </p>
        )}
        <div className='rise-fall__controls'>
            <button
                type='button'
                className='rise-fall__button is-primary'
                data-testid='rise-fall-start'
                onClick={onStart}
                disabled={active.emergency}
            >
                {localize('Start')}
            </button>
            <button type='button' className='rise-fall__button' data-testid='rise-fall-pause' onClick={onPause}>
                {localize('Pause')}
            </button>
            <button type='button' className='rise-fall__button' data-testid='rise-fall-stop' onClick={onStop}>
                {localize('Stop')}
            </button>
            <button
                type='button'
                className='rise-fall__button is-danger'
                data-testid='rise-fall-emergency'
                onClick={active.emergency ? onReleaseEmergency : onEmergency}
            >
                {active.emergency ? localize('Release emergency stop') : localize('Emergency stop')}
            </button>
        </div>
        {notice && (
            <p className='rise-fall__note' data-testid='rise-fall-notice'>
                {notice}
            </p>
        )}
        {lastOutcome?.reason && (
            <p className='rise-fall__note rise-fall__note--muted' data-testid='rise-fall-outcome'>
                {localize('Last decision')}: {lastOutcome.reason}
            </p>
        )}
    </section>
);

export default EngineControls;
