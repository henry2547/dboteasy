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

/** How long ago a timestamp was, e.g. "42s ago" — used for data freshness. */
export function formatAge(timestamp: number | null | undefined, now: number = Date.now()): string {
    if (!timestamp || !Number.isFinite(timestamp)) return '—';

    const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    return `${Math.floor(minutes / 60)}h ago`;
}

/** Scan duration in the shortest honest form: "3.4s" / "1m 12s". */
export function formatDuration(milliseconds: number | null | undefined): string {
    if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) return '—';
    if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;

    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;

    const wholeMinutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds - wholeMinutes * 60);
    return `${wholeMinutes}m ${rest}s`;
}
