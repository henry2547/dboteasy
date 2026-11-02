const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { DerivWSAccountsService } from '../derivws-accounts.service';

describe('DerivWSAccountsService.resetDemoBalance', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('POSTs to the account reset-demo-balance endpoint with the auth headers', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

        await DerivWSAccountsService.resetDemoBalance('token-123', 'VRTC9000');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toMatch(/\/trading\/v1\/options\/accounts\/VRTC9000\/reset-demo-balance$/);
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer token-123');
        expect(init.headers['Deriv-App-ID']).toBe(process.env.NEXT_PUBLIC_DERIV_APP_ID);
    });

    it("surfaces the API's own error message", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ errors: [{ message: 'Only demo accounts can have their balance reset' }] }),
        });

        await expect(DerivWSAccountsService.resetDemoBalance('token-123', 'CR9000')).rejects.toThrow(
            'Only demo accounts can have their balance reset'
        );
    });

    it('reports the status when the error body is unreadable', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.reject(new Error('no body')),
        });

        await expect(DerivWSAccountsService.resetDemoBalance('token-123', 'VRTC9000')).rejects.toThrow(
            'Could not reset the demo balance (500).'
        );
    });
});
