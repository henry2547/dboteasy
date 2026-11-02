/**
 * Observation mode: run the blocks on the canvas through the trade engine, but never buy.
 *
 * The strategy keeps doing everything it does in a real run — the tick window, the parity reads,
 * the signal gates — and every entry that would have been bought is written to the journal instead.
 * The switch is a single runtime flag, so the engine's purchase path is the only place that has to
 * honour it; nothing else about the run changes and a stop or a market switch behaves as usual.
 */
import { observer as globalObserver } from '../utils/observer';

const STORAGE_KEY = 'dbot_observation_mode';

let observation = false;

export const isObservationMode = () => observation;

/** Turns observation on or off and remembers the choice for the next visit. */
export const setObservationMode = enabled => {
    observation = Boolean(enabled);
    try {
        localStorage.setItem(STORAGE_KEY, observation ? '1' : '0');
    } catch {
        // Storage can be blocked; the switch still holds for this session.
    }
    return observation;
};

export const loadObservationMode = () => {
    try {
        observation = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        observation = false;
    }
    return observation;
};

/** A journal line without the notification sound, exactly like the other strategy notes. */
export const journalObservation = message => globalObserver.emit('ui.log.notify', { className: 'info', message });
