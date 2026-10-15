/**
 * A small, dependency-free client for Deriv's PUBLIC market-data WebSocket.
 *
 * It only ever sends public market-data requests (active_symbols, ticks_history,
 * ticks, ping, forget). No authenticated or trading message is sent.
 *
 * Responsibilities: open/close the socket, monotonic request ids, JSON framing,
 * heartbeats, stale-connection detection, capped exponential backoff with
 * jitter, browser online/offline and visibility handling, and safe teardown.
 */

import type { ConnectionState } from './types';

export const DERIV_PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_CONNECTION_MS = 75_000;
const STALE_CHECK_INTERVAL_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type DerivMessage = Record<string, unknown> & { msg_type?: string; req_id?: number };
type MessageHandler = (message: DerivMessage) => void;
type StatusHandler = (state: ConnectionState) => void;

const INITIAL_STATE: ConnectionState = {
    status: 'idle',
    reconnectAttempt: 0,
    lastMessageAt: null,
    lastPingAt: null,
    lastPongAt: null,
    latencyMs: null,
    errorMessage: null,
};

export class DerivPublicWebSocketClient {
    private readonly url: string;
    private socket: WebSocket | null = null;
    private nextRequestId = 1;
    private state: ConnectionState = { ...INITIAL_STATE };
    private readonly messageHandlers = new Set<MessageHandler>();
    private readonly statusHandlers = new Set<StatusHandler>();
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private staleTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pingSentAt = 0;
    private manualClose = false;
    private listenersAttached = false;

    constructor(url: string = DERIV_PUBLIC_WS_URL) {
        this.url = url;
    }

    getState(): ConnectionState {
        return { ...this.state };
    }

    isOpen(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    onMessage(handler: MessageHandler): () => void {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    onStatus(handler: StatusHandler): () => void {
        this.statusHandlers.add(handler);
        handler(this.getState());
        return () => this.statusHandlers.delete(handler);
    }

    connect(): void {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.manualClose = false;
        this.attachBrowserListeners();
        this.setState({
            status: this.state.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
            errorMessage: null,
        });

        try {
            this.socket = new WebSocket(this.url);
        } catch (error) {
            this.setState({ status: 'error', errorMessage: (error as Error).message });
            this.scheduleReconnect();
            return;
        }

        this.socket.onopen = () => {
            this.setState({ status: 'connected', reconnectAttempt: 0, errorMessage: null });
            this.startHeartbeat();
        };

        this.socket.onmessage = event => this.handleMessage(event);

        this.socket.onerror = () => {
            this.setState({ errorMessage: 'WebSocket error' });
        };

        this.socket.onclose = () => {
            this.stopHeartbeat();
            this.socket = null;
            this.setState({ status: 'disconnected' });
            if (!this.manualClose) this.scheduleReconnect();
        };
    }

    disconnect(): void {
        this.manualClose = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.detachBrowserListeners();

        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                /* socket already gone */
            }
            this.socket = null;
        }

        this.setState({ status: 'disconnected' });
    }

    /** Sends a request with the next monotonic request id. Returns the id used. */
    send(message: Record<string, unknown>): number {
        const reqId = this.nextRequestId++;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ ...message, req_id: reqId }));
        }
        return reqId;
    }

    private handleMessage(event: MessageEvent): void {
        this.setState({ lastMessageAt: Date.now() });

        let parsed: DerivMessage;
        try {
            parsed = JSON.parse(String(event.data));
        } catch {
            return;
        }

        if (parsed?.msg_type === 'ping') {
            this.setState({
                lastPongAt: Date.now(),
                latencyMs: this.pingSentAt ? Date.now() - this.pingSentAt : null,
            });
        }

        this.messageHandlers.forEach(handler => handler(parsed));
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            this.pingSentAt = Date.now();
            this.setState({ lastPingAt: Date.now() });
            this.send({ ping: 1 });
        }, HEARTBEAT_INTERVAL_MS);

        this.staleTimer = setInterval(() => {
            const last = this.state.lastMessageAt;
            if (last && Date.now() - last > STALE_CONNECTION_MS) {
                this.setState({ errorMessage: 'Connection went quiet — reconnecting' });
                try {
                    this.socket?.close();
                } catch {
                    /* socket already gone */
                }
            }
        }, STALE_CHECK_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.staleTimer) clearInterval(this.staleTimer);
        this.heartbeatTimer = null;
        this.staleTimer = null;
    }

    private scheduleReconnect(): void {
        if (this.manualClose || this.reconnectTimer) return;

        const attempt = this.state.reconnectAttempt;
        const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS) + Math.random() * 500;

        this.setState({ status: 'reconnecting', reconnectAttempt: attempt + 1 });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    private attachBrowserListeners(): void {
        if (this.listenersAttached || typeof window === 'undefined') return;
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        document.addEventListener('visibilitychange', this.handleVisibility);
        this.listenersAttached = true;
    }

    private detachBrowserListeners(): void {
        if (!this.listenersAttached || typeof window === 'undefined') return;
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        document.removeEventListener('visibilitychange', this.handleVisibility);
        this.listenersAttached = false;
    }

    private handleOnline = () => {
        if (!this.socket) this.connect();
    };

    private handleOffline = () => {
        this.setState({ errorMessage: 'Browser offline' });
    };

    private handleVisibility = () => {
        if (document.visibilityState !== 'visible') return;
        const last = this.state.lastMessageAt;
        if (!last || Date.now() - last > STALE_CONNECTION_MS) {
            try {
                this.socket?.close();
            } catch {
                /* socket already gone */
            }
        }
    };

    private setState(patch: Partial<ConnectionState>): void {
        this.state = { ...this.state, ...patch };
        const snapshot = this.getState();
        this.statusHandlers.forEach(handler => handler(snapshot));
    }
}
