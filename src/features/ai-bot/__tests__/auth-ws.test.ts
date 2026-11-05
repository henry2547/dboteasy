/**
 * Unit tests for the authenticated trading WebSocket.
 *
 * These verify the deterministic auth-verification logic with a mock
 * WebSocket — specifically that authorization is confirmed via a `balance`
 * request (the documented OTP flow), NOT an `authorize` message, which was the
 * root cause of the "stuck on connecting" bug. Real API integration is verified
 * separately against a live Deriv account.
 */

// Numeric readyState constants matching the real WebSocket spec.
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

class MockWebSocket {
    static instances: MockWebSocket[] = [];
    static OPEN = WS_OPEN;
    static CONNECTING = WS_CONNECTING;
    static CLOSING = WS_CLOSING;
    static CLOSED = WS_CLOSED;

    url: string;
    readyState: number = WS_CONNECTING;
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    sent: Record<string, any>[] = [];

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(JSON.parse(data));
    }

    close(): void {
        this.readyState = WS_CLOSED;
    }

    /** Test helper: simulate the server opening the connection. */
    fireOpen(): void {
        this.readyState = WS_OPEN;
        this.onopen?.(new Event('open'));
    }

    /** Test helper: deliver a parsed message to onmessage. */
    fireMessage(payload: Record<string, any>): void {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
    }
}

const TOKEN = 'test-access-token';
const AUTH_INFO = { access_token: TOKEN, expires_at: 9999999999 };

jest.mock('@/external/deriv-core', () => ({
    getAuthInfo: jest.fn(() => AUTH_INFO),
    getPublicWsUrl: jest.fn(() => 'wss://public.test/ws'),
}));

jest.mock('@/services/derivws-accounts.service', () => ({
    DerivWSAccountsService: {
        getAuthenticatedWebSocketURL: jest.fn(async () => 'wss://otp.test/ws?otp=abc'),
    },
}));

import { AuthTradingWebSocket } from '../auth-ws';

// Wait one microtask tick so the async resolveWsUrl inside connect() settles
// and the MockWebSocket has been constructed.
const tick = () => new Promise(r => setTimeout(r, 0));

describe('AuthTradingWebSocket', () => {
    let originalWebSocket: typeof WebSocket;

    beforeEach(() => {
        originalWebSocket = global.WebSocket;
        MockWebSocket.instances = [];
        (global as any).WebSocket = MockWebSocket;
        // Restore default mock implementations between tests.
        const { getAuthInfo } = jest.requireMock('@/external/deriv-core') as any;
        (getAuthInfo as jest.Mock).mockReturnValue(AUTH_INFO);
        const { DerivWSAccountsService } = jest.requireMock('@/services/derivws-accounts.service') as any;
        (DerivWSAccountsService.getAuthenticatedWebSocketURL as jest.Mock).mockResolvedValue(
            'wss://otp.test/ws?otp=abc'
        );
    });

    afterEach(() => {
        (global as any).WebSocket = originalWebSocket;
    });

    it('verifies authorization with a balance request, not an authorize message', async () => {
        const ws = new AuthTradingWebSocket();
        const connectPromise = ws.connect();
        await tick(); // let resolveWsUrl settle
        // The OTP URL connection should have been created.
        expect(MockWebSocket.instances).toHaveLength(1);
        const socket = MockWebSocket.instances[0];
        expect(socket.url).toBe('wss://otp.test/ws?otp=abc');

        // Open the connection — this triggers loadBalance().
        socket.fireOpen();

        // The first message sent must be a balance request, never authorize.
        await tick();
        const sentTypes = socket.sent.map(m => Object.keys(m).filter(k => k !== 'req_id'));
        expect(sentTypes[0]).toContain('balance');
        expect(sentTypes.some(t => t.includes('authorize'))).toBe(false);

        await connectPromise;
    });

    it('sets authorized=true only after a successful balance response', async () => {
        const ws = new AuthTradingWebSocket();
        ws.connect();
        await tick();
        const socket = MockWebSocket.instances[0];
        socket.fireOpen();
        await tick();

        // Capture the balance req_id so we can reply with a matching response.
        const balanceReq = socket.sent.find(m => 'balance' in m);
        expect(balanceReq).toBeTruthy();

        // Deliver a successful balance response with the matching req_id.
        socket.fireMessage({
            msg_type: 'balance',
            req_id: balanceReq.req_id,
            balance: { balance: '100.50', currency: 'USD', loginid: 'VRT123456', is_virtual: 1 },
            subscription: { id: 'sub-1' },
        });

        const status = ws.getStatus();
        expect(status.authorized).toBe(true);
        expect(status.authPhase).toBe('ready');
        expect(status.loginid).toBe('VRT123456');
        expect(status.balance).toBe(100.5);
        expect(status.isVirtual).toBe(true);
        expect(status.lastAuthAt).toBeGreaterThan(0);
    });

    it('sets authorized=false with a readable error when balance is rejected', async () => {
        const ws = new AuthTradingWebSocket();
        ws.connect();
        await tick();
        const socket = MockWebSocket.instances[0];
        socket.fireOpen();
        await tick();

        const balanceReq = socket.sent.find(m => 'balance' in m);
        socket.fireMessage({
            msg_type: 'balance',
            req_id: balanceReq.req_id,
            error: { code: 'InvalidToken', message: 'Invalid token' },
        });

        const status = ws.getStatus();
        expect(status.authorized).toBe(false);
        expect(status.authPhase).toBe('balance_error');
        expect(status.error).toContain('invalid or expired');
    });

    it('reports authorization_required when there is no token', async () => {
        const { getAuthInfo } = jest.requireMock('@/external/deriv-core') as any;
        (getAuthInfo as jest.Mock).mockReturnValue(null);

        const ws = new AuthTradingWebSocket();
        await ws.connect();

        // No WebSocket should be created without a token — the OTP fetch is
        // not attempted, so there is no connection to open.
        expect(MockWebSocket.instances).toHaveLength(0);

        const status = ws.getStatus();
        expect(status.authorized).toBe(false);
        expect(status.authPhase).toBe('failed');
        expect(status.error).toContain('Not logged in');
    });

    it('cleans up subscriptions on disconnect', async () => {
        const ws = new AuthTradingWebSocket();
        ws.connect();
        await tick();
        const socket = MockWebSocket.instances[0];
        socket.fireOpen();
        await tick();

        const balanceReq = socket.sent.find(m => 'balance' in m);
        socket.fireMessage({
            msg_type: 'balance',
            req_id: balanceReq.req_id,
            balance: { balance: '10', currency: 'USD', loginid: 'CR123', is_virtual: 0 },
            subscription: { id: 'sub-9' },
        });
        expect(ws.getStatus().authorized).toBe(true);

        ws.disconnect();
        // A forget for the balance subscription should be sent before close.
        const forgets = socket.sent.filter(m => 'forget' in m);
        expect(forgets.some(f => f.forget === 'sub-9')).toBe(true);
        expect(ws.getStatus().authorized).toBe(false);
        expect(ws.getStatus().wsState).toBe('disconnected');
    });

    it('does not fall back to the public WebSocket when the OTP fetch fails', async () => {
        const { DerivWSAccountsService } = jest.requireMock('@/services/derivws-accounts.service') as any;
        (DerivWSAccountsService.getAuthenticatedWebSocketURL as jest.Mock).mockRejectedValueOnce(
            new Error('401 Unauthorized')
        );

        const ws = new AuthTradingWebSocket();
        await ws.connect();

        // No WebSocket should be created — the OTP failure must not silently
        // fall back to the public market-data WS (which can't handle balance
        // and caused the "Request timed out: balance" error).
        expect(MockWebSocket.instances).toHaveLength(0);

        const status = ws.getStatus();
        expect(status.authPhase).toBe('failed');
        expect(status.error).toContain('Could not obtain an authenticated connection URL');
    });

    it('resolves a balance response even when req_id is not echoed', async () => {
        const ws = new AuthTradingWebSocket();
        ws.connect();
        await tick();
        const socket = MockWebSocket.instances[0];
        socket.fireOpen();
        await tick();

        // Deliver a balance response WITHOUT req_id — the API may omit it.
        // The pending request should still resolve by matching msg_type.
        socket.fireMessage({
            msg_type: 'balance',
            balance: { balance: '50.00', currency: 'USD', loginid: 'CR999', is_virtual: 0 },
            subscription: { id: 'sub-x' },
        });

        const status = ws.getStatus();
        expect(status.authorized).toBe(true);
        expect(status.authPhase).toBe('ready');
        expect(status.balance).toBe(50);
    });
});
