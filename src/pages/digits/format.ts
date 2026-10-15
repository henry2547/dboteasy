/** Small presentation helpers — rounding happens here, never in the domain maths. */

export function formatPercent(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${value.toFixed(digits)}%`;
}

export function formatSigned(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function formatCount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toLocaleString();
}

export function formatClock(epochSeconds: number | null | undefined): string {
    if (!epochSeconds) return '—';
    try {
        return new Date(epochSeconds * 1000).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch {
        return '—';
    }
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(digits);
}
