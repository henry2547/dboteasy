import type { AiBotSettings, ScanRow } from '../types';

interface ScannerFieldsProps {
    settings: AiBotSettings;
    rows: ScanRow[];
    onChange: (patch: Partial<AiBotSettings>) => void;
}

const NUMBER_FIELDS: { key: keyof Pick<AiBotSettings, 'stake' | 'ticks' | 'takeProfit' | 'stopLoss' | 'martingale'>; label: string }[] =
    [
        { key: 'stake', label: 'Stake' },
        { key: 'ticks', label: 'Ticks' },
        { key: 'takeProfit', label: 'Take profit' },
        { key: 'stopLoss', label: 'Stop loss' },
        { key: 'martingale', label: 'Martingale' },
    ];

/** Market scope plus the five numeric settings, styled like the reference setup panel. */
function ScannerFields({ settings, rows, onChange }: ScannerFieldsProps) {
    const markets = rows.filter(row => row.status === 'scanned');

    return (
        <div className='ai-fields'>
            <label className='ai-field ai-field--wide'>
                <span className='ai-field__label'>Market scope</span>
                <select
                    className='ai-field__select'
                    value={settings.marketScope}
                    onChange={event => onChange({ marketScope: event.target.value })}
                >
                    <option value='all'>All Markets</option>
                    {markets.map(market => (
                        <option key={market.symbol} value={market.symbol}>
                            {market.displayName}
                        </option>
                    ))}
                </select>
            </label>

            {NUMBER_FIELDS.map(field => (
                <label className='ai-field' key={field.key}>
                    <span className='ai-field__label'>{field.label}</span>
                    <input
                        className='ai-field__input'
                        type='number'
                        inputMode='decimal'
                        min='0'
                        step='any'
                        value={settings[field.key]}
                        onChange={event => {
                            const value = Number(event.target.value);
                            onChange({ [field.key]: Number.isFinite(value) ? value : 0 });
                        }}
                    />
                </label>
            ))}
        </div>
    );
}

export default ScannerFields;
