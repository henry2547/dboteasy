import { fireEvent, render, screen } from '@testing-library/react';
import SessionLimitAlert from '../session-limit-alert';

const mockShowTrades = jest.fn();
const mockDismiss = jest.fn();
const mockRunAgain = jest.fn();

let mockAlert: Record<string, unknown> | null = null;

jest.mock('@/hooks/useStore', () => ({
    useStore: jest.fn(() => ({
        run_panel: {
            get session_limit_alert() {
                return mockAlert;
            },
            showSessionLimitTrades: mockShowTrades,
            dismissSessionLimitAlert: mockDismiss,
            onRunButtonClick: mockRunAgain,
        },
    })),
}));

jest.mock('@deriv-com/translations', () => ({
    Localize: ({ i18n_default_text, values }: { i18n_default_text: string; values?: Record<string, string> }) => (
        <span>
            {Object.entries(values ?? {}).reduce(
                (text, [key, value]) => text.replace(`{{ ${key} }}`, String(value)),
                i18n_default_text
            )}
        </span>
    ),
    localize: (text: string) => text,
}));

describe('SessionLimitAlert', () => {
    beforeEach(() => {
        // The shared Modal appends its card to #modal_root, which the app shell provides.
        document.body.innerHTML = '<div id="modal_root"></div>';
    });

    afterEach(() => {
        jest.clearAllMocks();
        mockAlert = null;
    });

    const alert = (kind: 'take_profit' | 'stop_loss') => {
        mockAlert = {
            kind,
            amount: 10,
            profit: kind === 'take_profit' ? 10.4 : -20.5,
            bot_name: 'Even / Odd — Last 2 Digits Reversal',
            currency: 'AUD',
        };
    };

    it('renders nothing until a limit is reached', () => {
        const { container } = render(<SessionLimitAlert />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows a centred take-profit notice with the run profit and the limit', () => {
        alert('take_profit');
        render(<SessionLimitAlert />);

        expect(screen.getByText('Take profit reached')).toBeInTheDocument();
        // The scss styles the card through the class the shared Modal derives from `className`.
        expect(document.querySelector('.dc-modal__container_session-limit-alert')).toBeTruthy();
        expect(screen.getByText(/Even \/ Odd — Last 2 Digits Reversal closed this run at 10.40 AUD/)).toBeInTheDocument();
        expect(screen.getByText(/past its \+10.00 AUD take profit/)).toBeInTheDocument();
    });

    it('reports a stop loss with the loss amount', () => {
        alert('stop_loss');
        render(<SessionLimitAlert />);

        expect(screen.getByText('Stop loss reached')).toBeInTheDocument();
        expect(screen.getByText(/past its −10.00 AUD stop loss/)).toBeInTheDocument();
    });

    it('marks the card green for take profit and red for stop loss', () => {
        alert('take_profit');
        const profit = render(<SessionLimitAlert />);
        expect(document.querySelector('.session-limit-alert__body--profit')).toBeTruthy();
        profit.unmount();

        alert('stop_loss');
        render(<SessionLimitAlert />);
        expect(document.querySelector('.session-limit-alert__body--loss')).toBeTruthy();
    });

    it('closes when the close button is clicked', () => {
        alert('take_profit');
        render(<SessionLimitAlert />);

        fireEvent.click(screen.getByLabelText('Close'));
        expect(mockDismiss).toHaveBeenCalledTimes(1);
    });

    it('Okay goes back to the trades of that bot', () => {
        alert('take_profit');
        render(<SessionLimitAlert />);

        fireEvent.click(screen.getByText('Okay'));
        expect(mockShowTrades).toHaveBeenCalledTimes(1);
        expect(mockRunAgain).not.toHaveBeenCalled();
    });

    it('Run again dismisses the alert and starts the next run', () => {
        alert('stop_loss');
        render(<SessionLimitAlert />);

        fireEvent.click(screen.getByText('Run again'));
        expect(mockDismiss).toHaveBeenCalledTimes(1);
        expect(mockRunAgain).toHaveBeenCalledTimes(1);
        expect(mockShowTrades).not.toHaveBeenCalled();
    });
});
