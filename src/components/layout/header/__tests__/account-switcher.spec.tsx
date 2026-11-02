import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountSwitcher from '../account-switcher';

const mockCheckAndRegenerateWebSocket = jest.fn();

const mockAccountList = [
    { loginid: 'CR123', currency: 'USD', balance: 100, is_virtual: 0 },
    { loginid: 'VRTC456', currency: 'USD', balance: 9992.15, is_virtual: 1 },
];

jest.mock('@/hooks/useApiBase', () => ({
    useApiBase: jest.fn(() => ({
        accountList: mockAccountList,
        activeLoginid: 'CR123',
    })),
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: jest.fn(() => ({
        client: { checkAndRegenerateWebSocket: mockCheckAndRegenerateWebSocket },
        run_panel: { is_running: false },
    })),
}));

jest.mock('@/hooks/useLogout', () => ({
    useLogout: jest.fn(() => jest.fn()),
}));

jest.mock('@/external/bot-skeleton/services/api/api-base', () => ({
    api_base: { is_running: false },
}));

jest.mock('@/external/deriv-core', () => ({
    getAuthInfo: jest.fn(() => ({ access_token: 'test-token' })),
}));

jest.mock('@/services/derivws-accounts.service', () => ({
    DerivWSAccountsService: { resetDemoBalance: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@deriv-com/translations', () => ({
    Localize: ({ i18n_default_text }: { i18n_default_text: string }) => <span>{i18n_default_text}</span>,
    localize: (text: string) => text,
}));

jest.mock('@/components/shared', () => ({
    addComma: (val: string) => val,
    getCurrencyDisplayCode: (c: string) => c,
    getDecimalPlaces: () => 2,
}));

jest.mock('@/utils/account-helpers', () => ({
    isDemoAccount: (loginid: string) => loginid.startsWith('VR'),
}));

jest.mock('@/components/shared_ui/text', () => ({
    __esModule: true,
    default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <span className={className}>{children}</span>
    ),
}));

jest.mock('../account-info-wrapper', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockActiveAccount = {
    loginid: 'CR123',
    currency: 'USD',
    balance: '100.00',
    isVirtual: false,
    is_virtual: 0,
    isActive: true,
    currencyLabel: 'USD',
    icon: null,
};

describe('AccountSwitcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module mocks to defaults
        const { useApiBase } = require('@/hooks/useApiBase');
        useApiBase.mockReturnValue({ accountList: mockAccountList, activeLoginid: 'CR123' });
        const { useStore } = require('@/hooks/useStore');
        useStore.mockReturnValue({
            client: { checkAndRegenerateWebSocket: mockCheckAndRegenerateWebSocket },
            run_panel: { is_running: false },
        });
        require('@/external/bot-skeleton/services/api/api-base').api_base.is_running = false;
    });

    it('returns null when activeAccount is not provided', () => {
        const { container } = render(<AccountSwitcher activeAccount={undefined} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders active account type and balance', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        expect(screen.getByText('Real account')).toBeInTheDocument();
        expect(screen.getByTestId('dt_balance')).toHaveTextContent('100.00 USD');
    });

    it('offers no demo reset on a real account', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        expect(screen.queryByTestId('dt_reset_demo')).not.toBeInTheDocument();
    });

    it('resets the demo balance through the REST reset, then re-reads the balance', async () => {
        const { useApiBase } = require('@/hooks/useApiBase');
        useApiBase.mockReturnValue({ accountList: mockAccountList, activeLoginid: 'VRTC456' });
        const { api_base } = require('@/external/bot-skeleton/services/api/api-base');
        const { DerivWSAccountsService } = require('@/services/derivws-accounts.service');
        const send = jest.fn();
        api_base.api = { send };

        try {
            render(
                <AccountSwitcher
                    activeAccount={{ ...mockActiveAccount, loginid: 'VRTC456', isVirtual: true, balance: '5.00' }}
                />
            );
            fireEvent.click(screen.getByTestId('dt_reset_demo'));

            await waitFor(() =>
                expect(DerivWSAccountsService.resetDemoBalance).toHaveBeenCalledWith('test-token', 'VRTC456')
            );
            await waitFor(() => expect(send).toHaveBeenCalledWith({ balance: 1 }));
            await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('10,000 USD'));
        } finally {
            delete api_base.api;
        }
    });

    it('shows the API error when the demo reset is refused', async () => {
        const { useApiBase } = require('@/hooks/useApiBase');
        useApiBase.mockReturnValue({ accountList: mockAccountList, activeLoginid: 'VRTC456' });
        const { DerivWSAccountsService } = require('@/services/derivws-accounts.service');
        DerivWSAccountsService.resetDemoBalance.mockResolvedValueOnce(
            Promise.reject(new Error('Only demo accounts can have their balance reset'))
        );

        render(<AccountSwitcher activeAccount={{ ...mockActiveAccount, loginid: 'VRTC456', isVirtual: true }} />);
        fireEvent.click(screen.getByTestId('dt_reset_demo'));

        await waitFor(() =>
            expect(screen.getByRole('status')).toHaveTextContent('Only demo accounts can have their balance reset')
        );
    });

    it('opens dropdown on click when multiple accounts exist', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('does not open dropdown when bot is running via run_panel', () => {
        const { useStore } = require('@/hooks/useStore');
        useStore.mockReturnValue({
            client: { checkAndRegenerateWebSocket: mockCheckAndRegenerateWebSocket },
            run_panel: { is_running: true },
        });
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('does not open dropdown when api_base.is_running is true', () => {
        require('@/external/bot-skeleton/services/api/api-base').api_base.is_running = true;
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('does not open dropdown with a single account', () => {
        const { useApiBase } = require('@/hooks/useApiBase');
        useApiBase.mockReturnValue({
            accountList: [{ loginid: 'CR123', currency: 'USD', balance: 100, is_virtual: 0 }],
            activeLoginid: 'CR123',
        });
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('closes dropdown on outside click', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('closes dropdown on Escape key', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('sets localStorage and calls checkAndRegenerateWebSocket on account select', () => {
        const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        const options = screen.getAllByRole('option');
        const inactiveOption = options.find(o => o.getAttribute('aria-selected') === 'false');
        if (inactiveOption) fireEvent.click(inactiveOption);
        expect(setItemSpy).toHaveBeenCalledWith('active_loginid', 'VRTC456');
        expect(mockCheckAndRegenerateWebSocket).toHaveBeenCalledTimes(1);
        setItemSpy.mockRestore();
    });

    it('does not call checkAndRegenerateWebSocket when clicking the already-active account', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        const options = screen.getAllByRole('option');
        const activeOption = options.find(o => o.getAttribute('aria-selected') === 'true');
        if (activeOption) fireEvent.click(activeOption);
        expect(mockCheckAndRegenerateWebSocket).not.toHaveBeenCalled();
    });

    it('sorts active account to the top of the list', () => {
        const { useApiBase } = require('@/hooks/useApiBase');
        useApiBase.mockReturnValue({
            accountList: [
                { loginid: 'VRTC456', currency: 'USD', balance: 9992.15, is_virtual: 1 },
                { loginid: 'CR123', currency: 'USD', balance: 100, is_virtual: 0 },
            ],
            activeLoginid: 'CR123',
        });
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        fireEvent.click(screen.getByTestId('dt_acc_info'));
        const options = screen.getAllByRole('option');
        expect(options[0].getAttribute('aria-selected')).toBe('true');
    });

    it('trigger has correct ARIA attributes', () => {
        render(<AccountSwitcher activeAccount={mockActiveAccount} />);
        const trigger = screen.getByTestId('dt_acc_info');
        expect(trigger).toHaveAttribute('role', 'button');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
});
