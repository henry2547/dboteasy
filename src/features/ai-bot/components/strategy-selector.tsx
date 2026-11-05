/**
 * Strategy selector — enable/disable each strategy independently, and for
 * Matches/Differs choose a digit manually or use the AI suggestion.
 */

import { useAiBotContext } from '../ai-bot-context';
import type { StrategyConfig } from '../types';

export default function StrategySelector() {
    const bot = useAiBotContext();
    const { strategies, updateStrategies } = bot;

    const toggle = (id: string) => {
        updateStrategies(strategies.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
    };

    /** `null` means "use the AI suggestion" (the hottest / coldest digit). */
    const setDigit = (id: string, digit: number | null) => {
        updateStrategies(strategies.map(s => (s.id === id ? { ...s, digit } : s)));
    };

    const isMatchesOrDiffers = (s: StrategyConfig) => s.id === 'matches' || s.id === 'differs';

    return (
        <section className='aibot-panel'>
            <h3 className='aibot-panel__title'>Strategy Selection</h3>
            <p className='aibot-panel__hint'>
                Enable strategies independently. The deterministic engine decides if conditions are met.
            </p>
            <div className='aibot-strategies'>
                {strategies.map(s => (
                    <div key={s.id} className={`aibot-strategy ${s.enabled ? 'aibot-strategy--on' : ''}`}>
                        <label className='aibot-strategy__toggle'>
                            <input
                                type='checkbox'
                                checked={s.enabled}
                                onChange={() => toggle(s.id)}
                                disabled={s.id === 'custom'}
                            />
                            <span className='aibot-strategy__label'>{s.label}</span>
                        </label>
                        <p className='aibot-strategy__desc'>{s.description}</p>
                        {isMatchesOrDiffers(s) && s.enabled && (
                            <div className='aibot-strategy__digit'>
                                <span>Digit:</span>
                                <div className='aibot-strategy__digits'>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                                        <button
                                            key={d}
                                            type='button'
                                            className={`aibot-digit-btn ${s.digit === d ? 'aibot-digit-btn--active' : ''}`}
                                            onClick={() => setDigit(s.id, d)}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type='button'
                                    className={`aibot-btn aibot-btn--sm ${s.digit === null ? 'aibot-btn--active' : ''}`}
                                    onClick={() => setDigit(s.id, null)}
                                    title='Use AI suggestion'
                                >
                                    Auto
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
