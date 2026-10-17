/**
 * Authenticated WebSocket client for Deriv trading operations.
 *
 * This is SEPARATE from the public market-data WebSocket (deriv-public-ws.ts).
 * It handles: authorize, balance subscription, proposal, buy, and
 * proposal_open_contract monitoring.
 *
 * Security:
 * - Never requests or stores the user's Deriv password.
 * - The OAuth access token is read from the vendored deriv-core auth storage
 *   (localStorage) and sent only over the WebSocket to Deriv — never logged.
 * - The token is never written to source code, exported configs, or console.
 *
 * Connection:
 * - Uses the same OTP-based authenticated WebSocket URL flow as the existing
 *   api_base (DerivWSAccountsService), falling back to the public WS URL with
 *   an explicit authorize call.
 */

import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { getAuthInfo, getPublicWsUrl } from '@/external/deriv-core';
import { isProduction } from '@/components/shared';
import brandConfig from '../../../brand.config.json';

export type AuthMessage = Record<string, unknown> & { msg_type?: string; req_id?: number };
type MessageHandler = (message: AuthMessage) => void;
type StatusHandler = (status: AuthWsStatus) => void;

export interface AuthWsStatus {
    connected: boolean;
    authorized: boolean;
    loginid: string | null;
    balance: number | null;
    currency: string | null;
    isVirtual: boolean;
    error: string | null;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const AUTHORIZE_TIMEOUT_MS = 10_000;

export class AuthTradingWebSocket {
    private socket: WebSocket | null = null;
    private nextReqId = 1;
    private manualClose = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private authorizeTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempt = 0;
    private status: AuthWsStatus = {
        connected: false,
        authorized: false,
        loginid: null,
        balance: null,
        currency: null,
        isVirtual: false,
        error: null,
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
     * Connect and authorize. Resolves when authorized (or falls back to
     * public WS without auth if no token is available).
     */
    async connect(): Promise<void> {
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

        this.manualClose = false;
        const wsUrl = await this.resolveWsUrl();
        this.setPartial({ connected: false, error: null });

        try {
            this.socket = new WebSocket(wsUrl);
        } catch (error) {
            this.setPartial({ error: (error as Error).message });
            this.scheduleReconnect();
            return;
        }

        this.socket.onopen = () => {
            this.reconnectAttempt = 0;
            this.setPartial({ connected: true, error: null });
            this.startHeartbeat();
            this.authorize();
        };

        this.socket.onmessage = (event: MessageEvent) => this.handleMessage(event);
        this.socket.onerror = () => {
            this.setPartial({ error: 'WebSocket error' });
        };
        this.socket.onclose = () => {
            this.stopHeartbeat();
            this.clearAuthorizeTimer();
            this.socket = null;
            this.activeSubscriptions.clear();
            this.setPartial({ connected: false, authorized: false });
            if (!this.manualClose) this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.manualClose = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.clearAuthorizeTimer();
        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                /* socket already gone */
            }
            this.socket = null;
        }
        this.setPartial({ connected: false, authorized: false });
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
                // Fall back to public WS with explicit authorize.
            }
        }
        return getPublicWsUrl();
    }

    private authorize(): void {
        const authInfo = getAuthInfo();
        if (!authInfo?.access_token) {
            // No token — stay unauthorized (demo-public mode).
            this.setPartial({ authorized: false, error: 'Not logged in' });
            return;
        }

        // Send authorize to confirm the connection is authenticated.
        this.send({ authorize: authInfo.access_token });

        // Guard against a silent authorize (socket open but no response) —
        // without this the status hangs on "connecting" indefinitely.
        this.clearAuthorizeTimer();
        this.authorizeTimer = setTimeout(() => {
            if (!this.status.authorized) {
                this.setPartial({
                    authorized: false,
                    error: 'Authorization timed out — click Connect to retry.',
                });
            }
        }, AUTHORIZE_TIMEOUT_MS);
    }

    private clearAuthorizeTimer(): void {
        if (this.authorizeTimer) clearTimeout(this.authorizeTimer);
        this.authorizeTimer = null;
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

        if (msgType === 'authorize') {
            this.clearAuthorizeTimer();
            if (payload.error) {
                this.setPartial({ authorized: false, error: String(payload.error.message ?? 'Authorization failed') });
            } else {
                const auth = payload.authorize;
                this.setPartial({
                    authorized: true,
                    loginid: auth.loginid,
                    balance: Number(auth.balance),
                    currency: auth.currency,
                    isVirtual: Boolean(auth.is_virtual),
                    error: null,
                });
            }
        }

        if (msgType === 'balance') {
            const balance = payload.balance;
            if (balance && !payload.error) {
                this.setPartial({
                    balance: Number(balance.balance),
                    currency: balance.currency,
                    loginid: balance.loginid,
                    isVirtual: Boolean(balance.is_virtual),
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
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
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
