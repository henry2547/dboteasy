/**
 * Deriv Digits Analysis Lab — Public WebSocket Client
 *
 * Manages a single WebSocket connection to Deriv's public market-data endpoint.
 * Handles heartbeats, reconnection with exponential backoff + jitter,
 * request ID management, message routing, and subscription cleanup.
 *
 * Only sends public market-data messages: active_symbols, ticks_history,
 * ticks, ping, forget. No authentication or trading requests.
 */

import {
    DERIV_PUBLIC_WS_URL,
    HEARTBEAT_INTERVAL_MS,
    STALE_CONNECTION_MS,
    MAX_RECONNECT_DELAY_MS,
} from './constants';
import type { ConnectionStatus, ConnectionState } from './types';

type MessageHandler = (data: any) => void;
type StatusHandler = (state: ConnectionState) => void;

export class DerivPublicWebSocketClient {
    private ws: WebSocket | null = null;
    private nextRequestId = 1;
    private pendingRequests = new Map<number, { type: string; resolve: (data: any) => void; reject: (err: Error) => void }>();
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private staleTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempt = 0;
    private isManualClose = false;
    private onlineHandler: (() => void) | null = null;
    private offlineHandler: (() => void) | null = null;
    private visibilityHandler: (() => void) | null = null;

    private messageHandler: MessageHandler | null = null;
    private statusHandler: StatusHandler | null = null;

    private state: ConnectionState = {
        status: 'idle',
        reconnectAttempt: 0,
        lastMessageAt: null,
        latencyMs: null,
        errorMessage: null,
    };

    onMessage(handler: MessageHandler): void {
        this.messageHandler = handler;
    }

    onStatus(handler: StatusHandler): void {
        this.statusHandler = handler;
        handler(this.state);
    }

    private updateState(partial: Partial<ConnectionState>): void {
        this.state = { ...this.state, ...partial };
        this.statusHandler?.(this.state);
    }

    private createRequestId(): number {
        return this.nextRequestId++;
    }

    connect(): void {
        this.isManualClose = false;
        this.updateState({ status: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting', errorMessage: null });
        this.openSocket();
    }

    private openSocket(): void {
        try {
            this.ws = new WebSocket(DERIV_PUBLIC_WS_URL);
        } catch (err) {
            this.updateState({ status: 'error', errorMessage: 'Failed to create WebSocket' });
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.reconnectAttempt = 0;
            this.updateState({
                status: 'connected',
                reconnectAttempt: 0,
                lastMessageAt: Date.now(),
                errorMessage: null,
            });
            this.startHeartbeat();
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.updateState({ lastMessageAt: Date.now() });
            let data: any;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }

            // Handle ping response
            if (data.pong) {
                const pending = this.pendingRequests.get(data.req_id);
                if (pending) {
                    this.updateState({
                        latencyMs: Date.now() - pending.sentAt,
                    });
                    this.pendingRequests.delete(data.req_id);
                }
                return;
            }

            // Route to pending request
            if (data.req_id && this.pendingRequests.has(data.req_id)) {
                const pending = this.pendingRequests.get(data.req_id)!;
                if (data.error) {
                    pending.reject(new Error(data.error.message || 'API error'));
                } else {
                    pending.resolve(data);
                }
                // Don't delete subscription-type pending requests (they keep streaming)
                if (pending.type !== 'live-ticks') {
                    this.pendingRequests.delete(data.req_id);
                }
            }

            this.messageHandler?.(data);
        };

        this.ws.onerror = () => {
            this.updateState({ status: 'error', errorMessage: 'WebSocket error' });
        };

        this.ws.onclose = () => {
            this.stopHeartbeat();
            if (!this.isManualClose) {
                this.updateState({ status: 'disconnected' });
                this.scheduleReconnect();
            }
        };

        this.attachBrowserEvents();
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.send({ ping: 1, req_id: this.createRequestId() }, 'ping');
        }, HEARTBEAT_INTERVAL_MS);

        this.staleTimer = setInterval(() => {
            if (this.state.lastMessageAt && Date.now() - this.state.lastMessageAt > STALE_CONNECTION_MS) {
                this.forceReconnect();
            }
        }, 10_000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.staleTimer) {
            clearInterval(this.staleTimer);
            this.staleTimer = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.isManualClose) return;
        this.reconnectAttempt++;
        this.updateState({ reconnectAttempt: this.reconnectAttempt, status: 'reconnecting' });

        const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS) + Math.random() * 500;
        this.reconnectTimer = setTimeout(() => {
            this.openSocket();
        }, delay);
    }

    private forceReconnect(): void {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.close();
            this.ws = null;
        }
        this.stopHeartbeat();
        this.scheduleReconnect();
    }

    private attachBrowserEvents(): void {
        if (!this.onlineHandler) {
            this.onlineHandler = () => {
                if (this.state.status === 'disconnected' || this.state.status === 'error') {
                    this.forceReconnect();
                }
            };
            window.addEventListener('online', this.onlineHandler);
        }
        if (!this.offlineHandler) {
            this.offlineHandler = () => {
                this.updateState({ status: 'disconnected', errorMessage: 'Browser is offline' });
            };
            window.addEventListener('offline', this.offlineHandler);
        }
        if (!this.visibilityHandler) {
            this.visibilityHandler = () => {
                if (document.visibilityState === 'visible' && this.state.status === 'disconnected') {
                    this.forceReconnect();
                }
            };
            document.addEventListener('visibilitychange', this.visibilityHandler);
        }
    }

    private detachBrowserEvents(): void {
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
            this.onlineHandler = null;
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
            this.offlineHandler = null;
        }
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
    }

    send(request: Record<string, any>, type: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket is not connected'));
                return;
            }

            const reqId = request.req_id ?? this.createRequestId();
            const payload = { ...request, req_id: reqId };

            this.pendingRequests.set(reqId, { type, resolve, reject, sentAt: Date.now() } as any);
            this.ws.send(JSON.stringify(payload));
        });
    }

    sendRaw(request: Record<string, any>): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const reqId = request.req_id ?? this.createRequestId();
        this.ws.send(JSON.stringify({ ...request, req_id: reqId }));
    }

    disconnect(): void {
        this.isManualClose = true;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.detachBrowserEvents();
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.close();
            this.ws = null;
        }
        this.pendingRequests.clear();
        this.updateState({ status: 'idle' });
    }

    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}
