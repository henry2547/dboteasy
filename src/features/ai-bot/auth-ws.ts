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
 * - Therefore this client does NOT send an `authorize` message. The WebSocket
 *   `open` event itself confirms the OTP was accepted — that is the
 *   "authenticated" state. A subsequent `balance` request loads the account
 *   balance and moves the state to "ready". Sending `authorize` on the
 *   pre-authenticated OTP connection is wrong: it is either rejected or
 *   ignored, which is exactly what left the UI stuck on "connecting".
 *
 * State machine:
 *   disconnected → connecting → connected → authenticated → loading_balance → ready
 *   plus: no_token (no OAuth token), balance_error (auth OK, balance failed),
 *   error (auth failed), reconnecting (socket dropped, retrying).
 *
 * Security:
 * - Never requests or stores the user's Deriv password.
 * - The OAuth access token is read from the vendored deriv-core auth storage
 *   (localStorage) and sent only over HTTPS REST to obtain the OTP URL — never
 *   over the WebSocket, never logged, never written to source or configs.
 * - No OTP URL, token, or secret appears in diagnostics or error messages.
 */

import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { getAuthInfo, getPublicWsUrl } from '@/external/deriv-core';

export type AuthMessage = Record<string, unknown> & { msg_type?: string; req_id?: number };
type MessageHandler = (message: AuthMessage) => void;
type StatusHandler = (status: AuthWsStatus) => void;

export type WsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type AuthPhase =
    | 'none'
    | 'connecting'
    | 'authenticated'
    | 'loading_balance'
    | 'ready'
    | 'balance_error'
    | 'failed'
    | 'no_token';

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

interface PendingRequest {
    resolve: (msg: AuthMessage) => void;
    reject: (err: Error) => void;
    msgType: string;
    timer: ReturnType<typeof setTimeout>;
    connectionId: number;
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
    private reconnectAttempt = 0;
    /** Monotonically increasing connection epoch. Responses from a previous
     * connection carry a stale `connectionId` and are discarded so they can
     * never resolve a newer connection's pending request. */
    private connectionId = 0;
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
    private readonly pendingRequests = new Map<number, PendingRequest>();
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
     * Resolves once the connection is open and the balance has been loaded
     * (state "ready"), or once a definitive failure has been reported.
     */
    async connect(): Promise<void> {
        // Prevent duplicate connections: an OPEN or CONNECTING socket is reused.
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

        this.manualClose = false;
        this.connectionId += 1;
        const myConnectionId = this.connectionId;
        const hasToken = Boolean(getAuthInfo()?.access_token);

        let wsUrl: string;
        try {
            wsUrl = await this.resolveWsUrl();
        } catch (error) {
            const msg = `Could not obtain an authenticated connection URL: ${(error as Error).message}`;
            this.setPartial({
                wsState: 'disconnected',
                authPhase: 'failed',
                error: msg,
                lastError: msg,
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
            authPhase: 'connecting',
            hasToken,
        });

        try {
            this.socket = new WebSocket(wsUrl);
        } catch (error) {
            const msg = (error as Error).message;
            this.setPartial({
                wsState: 'disconnected',
                authPhase: 'failed',
                error: msg,
                lastError: msg,
            });
            this.scheduleReconnect();
            return;
        }

        this.socket.onopen = () => {
            // Discard if a newer connection has superseded this one.
            if (myConnectionId !== this.connectionId) {
                try { this.socket?.close(); } catch { /* ignore */ }
                return;
            }
            this.reconnectAttempt = 0;
            // The OTP URL is pre-authenticated: `onopen` means the server
            // accepted the OTP, so the connection IS authenticated. Balance
            // is loaded next as a separate step.
            this.setPartial({
                connected: true,
                wsState: 'connected',
                authPhase: 'authenticated',
                error: null,
                reconnectAttempt: 0,
            });
            this.startHeartbeat();
            void this.loadBalance();
        };

        this.socket.onmessage = (event: MessageEvent) => this.handleMessage(event);
        this.socket.onerror = () => {
            // The close handler reports the final state; keep a readable hint.
            this.setPartial({ error: 'WebSocket connection error.' });
        };
        this.socket.onclose = () => {
            this.stopHeartbeat();
            this.rejectAllPending('WebSocket connection closed', myConnectionId);
            this.socket = null;
            this.activeSubscriptions.clear();
            // If a newer connection already replaced this one, don't clobber it.
            if (myConnectionId !== this.connectionId) return;
            const reconnecting = !this.manualClose;
            this.setPartial({
                connected: false,
                authorized: false,
                wsState: reconnecting ? 'reconnecting' : 'disconnected',
                authPhase: reconnecting ? 'connecting' : 'none',
            });
            if (reconnecting) this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.manualClose = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.rejectAllPending('Disconnected by user');
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

    /**
     * Send a request and wait for the matching response.
     *
     * Matching strategy (matches the working DerivAPIBasic library behaviour):
     * 1. If the response carries `req_id`, match by it (the precise case).
     * 2. If the response omits `req_id`, fall back to matching by `msg_type`
     *    so a response that doesn't echo `req_id` still resolves the right
     *    pending request instead of timing out.
     *
     * Stale responses from a previous connection are rejected via
     * `connectionId`. All pending requests are rejected on close.
     */
    sendAndWait(message: Record<string, unknown>, timeoutMs = 15000): Promise<AuthMessage> {
        const expectedType = Object.keys(message)[0];

        if (!this.isOpen()) {
            return Promise.reject(new Error(`WebSocket is not connected (${expectedType})`));
        }

        const reqId = this.send(message);
        const myConnectionId = this.connectionId;

        return new Promise<AuthMessage>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(reqId);
                reject(new Error(`Request timed out: ${expectedType}`));
            }, timeoutMs);

            this.pendingRequests.set(reqId, {
                resolve,
                reject,
                msgType: expectedType,
                timer,
                connectionId: myConnectionId,
            });
        });
    }

    // ── Private ──────────────────────────────────────────────────────────────

    /**
     * Resolve the authenticated WebSocket URL via the OTP flow.
     *
     * Unlike the previous implementation, this does NOT silently fall back to
     * the public market-data WebSocket when the OTP fetch fails. The public WS
     * cannot handle `balance` or any authenticated request — falling back to it
     * caused the "Request timed out: balance" error because the public WS
     * simply ignores `balance` messages. Instead, the error is thrown so the
     * caller can report a clear authentication failure.
     */
    private async resolveWsUrl(): Promise<string> {
        const authInfo = getAuthInfo();
        if (!authInfo?.access_token) {
            throw new Error('Not logged in — no OAuth access token.');
        }
        // getAuthenticatedWebSocketURL fetches the accounts list (if not cached)
        // and then the OTP URL for the active account. Both REST calls now
        // include the Deriv-App-ID header (see derivws-accounts.service.ts).
        return await DerivWSAccountsService.getAuthenticatedWebSocketURL(authInfo.access_token);
    }

    /**
     * Load the account balance. The OTP connection is already authenticated
     * (the `open` event confirmed it), so this is a balance-retrieval step,
     * NOT an authorization step. If the balance fails, we report a balance
     * error separately — the connection itself remains authenticated.
     */
    private async loadBalance(): Promise<void> {
        const authInfo = getAuthInfo();
        if (!authInfo?.access_token) {
            this.setPartial({
                authorized: false,
                authPhase: 'no_token',
                error: 'Not logged in. Log in with Deriv from the header — the AI scanners use that same account.',
            });
            return;
        }

        this.setPartial({ authPhase: 'loading_balance', error: null });

        try {
            const response = await this.sendAndWait({ balance: 1, subscribe: 1 }, AUTH_VERIFY_TIMEOUT_MS);
            const payload = response as Record<string, any>;
            if (payload.error) {
                const msg = describeAuthError(payload.error);
                this.setPartial({
                    authorized: false,
                    authPhase: 'balance_error',
                    error: `Balance retrieval failed: ${msg}`,
                    lastError: `Balance retrieval failed: ${msg}`,
                });
            }
            // Success is applied by the `balance` branch of handleMessage.
        } catch (error) {
            const msg = (error as Error).message;
            // Distinguish a balance timeout from an auth failure: the connection
            // is authenticated (onopen fired), only the balance request failed.
            this.setPartial({
                authorized: false,
                authPhase: 'balance_error',
                error: `Balance retrieval failed: ${msg}`,
                lastError: `Balance retrieval failed: ${msg}`,
            });
        }
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
                const msg = describeAuthError(payload.error);
                this.setPartial({
                    authorized: false,
                    authPhase: 'balance_error',
                    error: `Balance retrieval failed: ${msg}`,
                    lastError: `Balance retrieval failed: ${msg}`,
                });
            } else if (balance) {
                const subId = payload.subscription?.id;
                if (subId) this.activeSubscriptions.add(String(subId));
                this.setPartial({
                    authorized: true,
                    authPhase: 'ready',
                    loginid: balance.loginid ?? this.status.loginid,
                    balance: Number(balance.balance),
                    currency: balance.currency,
                    isVirtual: Boolean(balance.is_virtual),
                    error: null,
                    lastError: null,
                    lastAuthAt: Date.now(),
                });
            }
        }

        if (msgType === 'ping') {
            // heartbeat response
        }

        // Resolve any pending sendAndWait request matching this response.
        this.resolvePending(parsed);

        this.messageHandlers.forEach(handler => handler(parsed));
    }

    /**
     * Resolve a pending `sendAndWait` request. Matches by `req_id` when the
     * response carries one; falls back to `msg_type` when it doesn't (matching
     * the DerivAPIBasic library's behaviour). Stale responses from a previous
     * connection are discarded.
     */
    private resolvePending(parsed: AuthMessage): void {
        const reqId = parsed.req_id;
        const msgType = parsed.msg_type;

        let pending: PendingRequest | undefined;

        // 1. Match by req_id when present.
        if (reqId !== undefined && reqId !== null) {
            pending = this.pendingRequests.get(reqId);
            if (pending) this.pendingRequests.delete(reqId);
        }

        // 2. Fallback: match by msg_type when req_id is absent or didn't match.
        if (!pending && msgType) {
            for (const [id, p] of this.pendingRequests) {
                if (p.msgType === msgType) {
                    pending = p;
                    this.pendingRequests.delete(id);
                    break;
                }
            }
        }

        if (!pending) return;

        // Discard stale responses from a previous connection.
        if (pending.connectionId !== this.connectionId) return;

        clearTimeout(pending.timer);
        const error = (parsed as Record<string, any>).error;
        if (error) {
            pending.reject(new Error(String(error.message ?? 'Request failed')));
        } else {
            pending.resolve(parsed);
        }
    }

    /** Reject all pending requests (called on disconnect/close). */
    private rejectAllPending(reason: string, connectionId?: number): void {
        for (const [id, p] of this.pendingRequests) {
            if (connectionId !== undefined && p.connectionId !== connectionId) continue;
            clearTimeout(p.timer);
            this.pendingRequests.delete(id);
            p.reject(new Error(reason));
        }
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
