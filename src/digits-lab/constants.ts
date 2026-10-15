/**
 * Deriv Digits Analysis Lab — Constants
 *
 * Public market-data WebSocket endpoint and configuration constants.
 * The app_id is read from the environment (NEXT_PUBLIC_DERIV_APP_ID).
 */

export const DERIV_PUBLIC_WS_URL =
    'wss://api.derivws.com/trading/v1/options/ws/public';

export const MAX_TICKS = 1000;
export const HISTORY_COUNT = 1000;

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const STALE_CONNECTION_MS = 75_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;

export const EXPECTED_DIGIT_PERCENTAGE = 10;

export const ANALYSIS_WINDOWS = [20, 50, 100, 200, 500, 1000] as const;
export type AnalysisWindow = (typeof ANALYSIS_WINDOWS)[number];

export const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Barrier thresholds for the learning program */
export const BARRIERS = {
    OVER_1: 1,
    OVER_2: 2,
    UNDER_7: 7,
    UNDER_8: 8,
} as const;
