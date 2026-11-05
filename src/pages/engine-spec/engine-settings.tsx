import type { EngineSettings } from './engine-scoring';

interface EngineSettingsPanelProps {
    /** Raw editable values — weights are the percentages the user typed. */
    draft: EngineSettings;
    /** Weights renormalised to sum to 1, exactly what the engine uses. */
    effectiveWeights: { micro: number; mid: number; macro: number };
    onChange: (next: EngineSettings) => void;
    onReset: () => void;
}

/**
 * Configurable analysis settings: window weights, score floors, alignment floor,
 * cooldown sensitivity. Experimental defaults, not proven profit thresholds.
 */
export default function EngineSettingsPanel({
    draft,
    effectiveWeights,
    onChange,
    onReset,
}: EngineSettingsPanelProps) {
    const update = (patch: Partial<EngineSettings>) => onChange({ ...draft, ...patch });
    const updateWeight = (layer: 'micro' | 'mid' | 'macro', value: number) =>
        update({ weights: { ...draft.weights, [layer]: value } });

    const sum = draft.weights.micro + draft.weights.mid + draft.weights.macro;

    return (
        <details className='espec-settings'>
            <summary className='espec-settings__summary'>Analysis settings</summary>
            <p className='espec-settings__intro'>
                Defaults are experimental: micro 50% / mid 30% / macro 20%, entry at ±4.0 pp. Every value here feeds
                the same pure engine, so a change re-scores the live windows immediately.
            </p>

            <div className='espec-settings__grid'>
                <label className='espec-field'>
                    <span className='espec-field__label'>Micro weight (%)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        max={100}
                        step={5}
                        value={draft.weights.micro}
                        onChange={event => updateWeight('micro', Number(event.target.value))}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Mid weight (%)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        max={100}
                        step={5}
                        value={draft.weights.mid}
                        onChange={event => updateWeight('mid', Number(event.target.value))}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Macro weight (%)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        max={100}
                        step={5}
                        value={draft.weights.macro}
                        onChange={event => updateWeight('macro', Number(event.target.value))}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Entry / fade floor (pp)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        step={0.5}
                        value={draft.entryMasterPp}
                        onChange={event => update({ entryMasterPp: Number(event.target.value) })}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Alignment floor (pp)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        step={0.5}
                        value={draft.alignMinPp}
                        onChange={event => update({ alignMinPp: Number(event.target.value) })}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Opposing floor (pp)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        step={0.5}
                        value={draft.conflictPp}
                        onChange={event => update({ conflictPp: Number(event.target.value) })}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Cooldown (ticks)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        step={5}
                        value={draft.cooldownTicks}
                        onChange={event => update({ cooldownTicks: Number(event.target.value) })}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Micro flip swing (pp)</span>
                    <input
                        className='espec-field__input'
                        type='number'
                        min={0}
                        step={1}
                        value={draft.microFlipPp}
                        onChange={event => update({ microFlipPp: Number(event.target.value) })}
                    />
                </label>
                <label className='espec-field'>
                    <span className='espec-field__label'>Required alignment</span>
                    <select
                        className='espec-field__input'
                        value={draft.requiredAlignment}
                        onChange={event =>
                            update({ requiredAlignment: event.target.value === 'moderate' ? 'moderate' : 'strong' })
                        }
                    >
                        <option value='strong'>Strong (all three)</option>
                        <option value='moderate'>Moderate (macro neutral)</option>
                    </select>
                </label>
            </div>

            <p className='espec-settings__hint'>
                Weights sum to {sum.toFixed(0)}%, used as {(effectiveWeights.micro * 100).toFixed(1)}% /{' '}
                {(effectiveWeights.mid * 100).toFixed(1)}% / {(effectiveWeights.macro * 100).toFixed(1)}% after
                normalisation.
            </p>

            <button type='button' className='espec-settings__reset' onClick={onReset}>
                Reset to defaults
            </button>
        </details>
    );
}
