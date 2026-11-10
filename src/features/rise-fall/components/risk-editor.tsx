import React from 'react';
import { localize } from '@deriv-com/translations';
import type { RiskConfig } from '../risk-engine';
import { RISK_FIELD_LABELS } from '../risk-engine';

interface RiskEditorProps {
    risk: Record<string, number>;
    onChange: (field: keyof RiskConfig, value: number) => void;
}

const FIELDS: Array<{ field: keyof RiskConfig; step: number; suffix?: string }> = [
    { field: 'stake', step: 0.05 },
    { field: 'maxStake', step: 0.05 },
    { field: 'maxDailyLoss', step: 1 },
    { field: 'maxConsecutiveLosses', step: 1 },
    { field: 'maxTradesPerSession', step: 1 },
    { field: 'maxSessionDrawdown', step: 1 },
];

/** Per-mode risk limits. Every value is re-checked in code by the risk engine. */
const RiskEditor = ({ risk, onChange }: RiskEditorProps) => (
    <div className='rise-fall__grid' data-testid='rise-fall-risk'>
        {FIELDS.map(({ field, step }) => (
            <label className='rise-fall__field' key={field} htmlFor={`rise-fall-risk-${field}`}>
                <span>{localize(RISK_FIELD_LABELS[field])}</span>
                <input
                    id={`rise-fall-risk-${field}`}
                    data-testid={`rise-fall-risk-${field}`}
                    type='number'
                    inputMode='decimal'
                    step={step}
                    min={0}
                    value={risk[field] ?? 0}
                    onChange={event => onChange(field, Number(event.target.value))}
                />
            </label>
        ))}
        <label className='rise-fall__field' htmlFor='rise-fall-risk-cooldown'>
            <span>{localize('Cool-down after a loss (seconds)')}</span>
            <input
                id='rise-fall-risk-cooldown'
                data-testid='rise-fall-risk-cooldown'
                type='number'
                inputMode='numeric'
                step={5}
                min={0}
                value={Math.round((risk.cooldownAfterLossMs ?? 0) / 1000)}
                onChange={event => onChange('cooldownAfterLossMs', Number(event.target.value) * 1000)}
            />
        </label>
        <label className='rise-fall__field' htmlFor='rise-fall-risk-open-contracts'>
            <span>{localize('Maximum open contracts')}</span>
            <input
                id='rise-fall-risk-open-contracts'
                data-testid='rise-fall-risk-openContracts'
                type='number'
                inputMode='numeric'
                step={1}
                min={0}
                value={risk.maxOpenContracts ?? 0}
                onChange={event => onChange('maxOpenContracts', Number(event.target.value))}
            />
        </label>
    </div>
);

export default RiskEditor;
