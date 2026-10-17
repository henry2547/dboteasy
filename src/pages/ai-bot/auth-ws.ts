/**
 * Authenticated WebSocket client for Deriv trading operations.
 *
 * This is SEPARATE from the public market-data WebSocket (deriv-public-ws.ts).
 * It handles: authorization verification, balance subscription, proposal,
 * buy, and proposal_open_contract monitoring.
 *
 * Authentication model (per the current official Deriv "Options" API):
 * - The OAuth flow exchanges an authorization code for an access token.
 * - A REST call to `options/accounts/{accountId}/otp` returns a WebSocket URL
 *   that is ALREADY authenticated (the OTP in the query string carries the
 *   authorization). See https://developers.deriv.com/docs/workflows/
 * - Therefore this client does NOT send an `authorize` message. It verifies
 *   the connection is authorized by requesting `balance` — a successful
 *   balance response confirms the account is authenticated and readable.
 *   Sending `authorize` on the pre-authenticated OTP connection is wrong: it
 *   is either rejected or ignored, which is exactly what left the UI stuck on
 *   "connecting" indefinitely.
 *
 * State machine:
 *   disconnected → connecting → connected → authorized → (ready, owned by the engine)
 *   plus: authorization_required (no token), error (auth failed), reconnecting.
 *
 * Security:
 * - Never requests or stores the user's Deriv password.
 * - The OAuth access token is read from the vendored deriv-core auth storage
 *   (localStorage) and sent only over HTTPS REST to obtain the OTP URL — never
 *   over the WebSocket, never logged, never written to source or configs.
 */

import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { getAuthInfo, getPublicWsUrl } from '@/external/deriv-core';

export type AuthMessage = Record<string, unknown> & { msg_type?: string; req_id?: number };
type MessageHandler = (message: AuthMessage) => void;
type StatusHandler = (status: AuthWsStatus) => void;

export type WsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type AuthPhase = 'none' | 'verifying' | 'authorized' | 'failed' | 'no_token';

export interface AuthWsStatus {
    connected: boolean;
    authorized: boolean;
    loginid: string | null;
    balance: number | null;
    currency: string | null;
    isVirtual: boolean;
    error: string | null;
    // ── diagnostics (no tokens / secrets) ──
    wsState: WsState;
    authPhase: AuthPhase;
    lastAuthAt: number | null;
    lastError: string | null;
    reconnectAttempt: number;
    hasToken: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const AUTH_VERIFY_TIMEOUT_MS = 10_000;

/** Map a Deriv error object to a safe, user-readable message (no token echo). */
function describeAuthError(error: Record<string, any> | undefined): string {
    if (!error) return 'Authorization failed.';
    const code = String(error.code ?? error.message ?? '').toUpperCase();
    const message = String(error.message ?? 'Authorization failed.');
    switch (code) {
        case 'INVALIDTOKEN':
        case 'INVALID_TOKEN':
            return 'Your Deriv authorization is invalid or expired. Please log in again.';
        case 'AUTHORIZATIONREQUIRED':
        case 'AUTH_REQUIRED':
            return 'This account is not authorized for trading. Reconnect or log in again.';
        case 'INVALIDCREDENTIALS':
            return 'Deriv rejected the authorization. Please log in again.';
        default:
            return message;
    }
}

export class AuthTradingWebSocket {
    private socket: WebSocket | null = null;
    private nextReqId = 1;
    private manualClose = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private authTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempt = 0;
    private status: AuthWsStatus = {
        connected: false,
        authorized: false,
        loginid: null,
        balance: null,
        currency: null,
        isVirtual: false,
        error: null,
        wsState: 'disconnected',
        authPhase: 'none',
        lastAuthAt: null,
        lastError: null,
        reconnectAttempt: 0,
        hasToken: false,
    };
    private readonly messageHandlers = new Set<MessageHandler>();
    private readonly statusHandlers = new Set<StatusHandler>();
    private activeSubscriptions = new Set<string>();

    onMessage(handler: MessageHandler): () => void {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    onStatus(handler: StatusHandler): () => void {
        this.statusHandlers.add(handler);
        handler(this.getStatus());
        return () => this.statusHandlers.delete(handler);
    }

    getStatus(): AuthWsStatus {
        return { ...this.status };
    }

    isOpen(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    /**
     * Connect to the authenticated (OTP) WebSocket URL and verify authorization.
     * Resolves once authorization has been verified or has definitively failed.
     */
    async connect(): Promise<void> {
        // Prevent duplicate connections: an OPEN or CONNECTING socket is reused.
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

        this.manualClose = false;
        const hasToken = Boolean(getAuthInfo()?.access_token);

        let wsUrl: string;
        try {
            wsUrl = await this.resolveWsUrl();
        } catch (error) {
            this.setPartial({
                wsState: 'disconnected',
                authPhase: 'failed',
                error: `Could not obtain a connection URL: ${(error as Error).message}`,
                lastError: `Could not obtain a connection URL: ${(error as Error).message}`,
                hasToken,
            });
            this.scheduleReconnect();
            return;
        }

        this.setPartial({
            connected: false,
            authorized: false,
            error: null,
            wsState: 'connecting',
            authPhase: hasToken ? 'verifying' : 'no_token',
            hasToken,
        });

        try {
            this.socket = new WebSocket(wsUrl);
        } catch (error) {
            this.setPartial({
                wsState: 'disconnected',
                authPhase: 'failed',
                error: (error as Error).message,
                lastError: (error as Error).message,
            });
            this.scheduleReconnect();
            return;
        }

        this.socket.onopen = () => {
            this.reconnectAttempt = 0;
            this.setPartial({ connected: true, wsState: 'connected', error: null, reconnectAttempt: 0 });
            this.startHeartbeat();
            void this.verifyAuth();
        };

        this.socket.onmessage = (event: MessageEvent) => this.handleMessage(event);
        this.socket.onerror = () => {
            // The close handler reports the final state; keep a readable hint.
            this.setPartial({ error: 'WebSocket connection error.' });
        };
        this.socket.onclose = () => {
            this.stopHeartbeat();
            this.clearAuthTimer();
            this.socket = null;
            this.activeSubscriptions.clear();
            const reconnecting = !this.manualClose;
            this.setPartial({
                connected: false,
                authorized: false,
                wsState: reconnecting ? 'reconnecting' : 'disconnected',
                authPhase: reconnecting ? 'verifying' : 'none',
            });
            if (reconnecting) this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.manualClose = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.clearAuthTimer();
        this.forgetAllSubscriptions();
        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                /* socket already gone */
            }
            this.socket = null;
        }
        this.setPartial({
            connected: false,
            authorized: false,
            wsState: 'disconnected',
            authPhase: 'none',
            error: null,
        });
    }

    /** Send a request with the next monotonic request id. Returns the id. */
    send(message: Record<string, unknown>): number {
        const reqId = this.nextReqId++;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ ...message, req_id: reqId }));
        }
        return reqId;
    }

    /** Send a request and wait for the matching response by req_id. */
    sendAndWait(message: Record<string, unknown>, timeoutMs = 15000): Promise<AuthMessage> {
        return new Promise((resolve, reject) => {
            const reqId = this.send(message);
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                off();
                reject(new Error(`Request timed out: ${Object.keys(message)[0]}`));
            }, timeoutMs);

            const off = this.onMessage(msg => {
                if (msg.req_id !== reqId) return;
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                off();
                const error = (msg as Record<string, any>).error;
                if (error) reject(new Error(String(error.message ?? 'Request failed')));
                else resolve(msg);
            });
        });
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private async resolveWsUrl(): Promise<string> {
        const authInfo = getAuthInfo();
        if (authInfo?.access_token) {
            try {
                return await DerivWSAccountsService.getAuthenticatedWebSocketURL(authInfo.access_token);
            } catch {
                // Fall back to the public WS; verifyAuth() will then report that
                // the account is not authorized (balance returns an auth error),
                // rather than silently claiming success.
            }
        }
        return getPublicWsUrl();
    }

    /**
     * Verify the connection is authorized. The OTP URL is pre-authenticated, so
     * we confirm by requesting the account balance — a successful `balance`
     * response is proof of authorization. We never send `authorize` here.
     */
    private async verifyAuth(): Promise<void> {
        const authInfo = getAuthInfo();
        if (!authInfo?.access_token) {
            this.setPartial({
                authorized: false,
                authPhase: 'no_token',
                error: 'Not logged in. Click "Log in with Deriv" to authorize.',
            });
            return;
        }

        this.setPartial({ authPhase: 'verifying', error: null });

        this.clearAuthTimer();
        this.authTimer = setTimeout(() => {
            if (!this.status.authorized) {
                this.setPartial({
                    authorized: false,
                    authPhase: 'failed',
                    error: 'Authorization timed out — the account did not respond. Click Connect to retry.',
                    lastError: 'Authorization timed out',
                });
            }
        }, AUTH_VERIFY_TIMEOUT_MS);

        try {
            const response = await this.sendAndWait({ balance: 1, subscribe: 1 }, AUTH_VERIFY_TIMEOUT_MS);
            const payload = response as Record<string, any>;
            if (payload.error) {
                this.clearAuthTimer();
                const msg = describeAuthError(payload.error);
                this.setPartial({ authorized: false, authPhase: 'failed', error: msg, lastError: msg });
            }
            // Success is applied by the `balance` branch of handleMessage.
        } catch (error) {
            this.clearAuthTimer();
            const msg = (error as Error).message;
            this.setPartial({ authorized: false, authPhase: 'failed', error: msg, lastError: msg });
        }
    }

    private clearAuthTimer(): void {
        if (this.authTimer) clearTimeout(this.authTimer);
        this.authTimer = null;
    }

    private handleMessage(event: MessageEvent): void {
        let parsed: AuthMessage;
        try {
            parsed = JSON.parse(String(event.data));
        } catch {
            return;
        }

        const msgType = parsed.msg_type;
        const payload = parsed as Record<string, any>;

        if (msgType === 'balance') {
            const balance = payload.balance;
            if (payload.error) {
                this.clearAuthTimer();
                const msg = describeAuthError(payload.error);
                this.setPartial({ authorized: false, authPhase: 'failed', error: msg, lastError: msg });
            } else if (balance) {
                this.clearAuthTimer();
                const subId = payload.subscription?.id;
                if (subId) this.activeSubscriptions.add(String(subId));
                this.setPartial({
                    authorized: true,
                    authPhase: 'authorized',
                    loginid: balance.loginid ?? this.status.loginid,
                    balance: Number(balance.balance),
                    currency: balance.currency,
                    isVirtual: Boolean(balance.is_virtual),
                    error: null,
                    lastAuthAt: Date.now(),
                });
            }
        }

        if (msgType === 'ping') {
            // heartbeat response
        }

        this.messageHandlers.forEach(handler => handler(parsed));
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.send({ ping: 1 });
        }, HEARTBEAT_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
    }

    private scheduleReconnect(): void {
        if (this.manualClose || this.reconnectTimer) return;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
        this.reconnectAttempt += 1;
        this.setPartial({ reconnectAttempt: this.reconnectAttempt });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    private forgetAllSubscriptions(): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.activeSubscriptions.forEach(id => {
                try {
                    this.socket?.send(JSON.stringify({ forget: id }));
                } catch {
                    /* ignore */
                }
            });
        }
        this.activeSubscriptions.clear();
    }

    private setPartial(patch: Partial<AuthWsStatus>): void {
        this.status = { ...this.status, ...patch };
        const snapshot = this.getStatus();
        this.statusHandlers.forEach(handler => handler(snapshot));
    }
}

/** Get the app_id for the WebSocket connection (from brand config / env). */
export function getDerivAppId(): string {
    return process.env.NEXT_PUBLIC_DERIV_APP_ID || '';
}
