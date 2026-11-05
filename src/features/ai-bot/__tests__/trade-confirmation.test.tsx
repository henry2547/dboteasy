/**
 * UI tests for the real-money confirmation dialog: it renders the order details
 * and the live Deriv quote, and its buttons approve or reject the held entry.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { BotEngineState } from '../bot-engine';

const mockConfirmTrade = jest.fn();
const mockCancelTrade = jest.fn();
let mockState: unknown;

jest.mock('../ai-bot-context', () => ({
    useAiBotContext: () => ({ state: mockState, confirmTrade: mockConfirmTrade, cancelTrade: mockCancelTrade }),
}));

import TradeConfirmation from '../components/trade-confirmation';

function pendingState(overrides: Record<string, unknown> = {}): BotEngineState {
    return {
        pendingTrade: {
            id: 'sig_1',
            requestedAt: Date.now(),
            quoteError: null,
            order: {
                symbol: 'R_100',
                displayName: 'Volatility 100 Index',
                strategyLabel: 'Matches',
                contractType: 'DIGITMATCH',
                prediction: 'Last digit matches 5',
                stake: 1,
                maxStake: 50,
                duration: 5,
                durationUnit: 't',
                currency: 'USD',
                accountMode: 'real',
                loginid: 'CR1234567',
                balance: 250.5,
            },
            quote: {
                id: 'prop_1',
                askPrice: 1,
                payout: 1.95,
                longcode: 'Win payout if the last digit matches 5 after 5 ticks.',
                spot: 629.81,
                spotTime: Math.floor(Date.now() / 1000),
                dateStart: 0,
                dateExpiry: 0,
            },
            ...overrides,
        },
    } as unknown as BotEngineState;
}

describe('trade confirmation dialog', () => {
    it('renders nothing while no real-money entry is pending', () => {
        mockState = { pendingTrade: null } as unknown as BotEngineState;

        const { container } = render(<TradeConfirmation />);

        expect(container).toBeEmptyDOMElement();
    });

    it('shows the order details, the live quote and the real account', () => {
        mockState = pendingState();

        render(<TradeConfirmation />);

        expect(screen.getByText('Confirm Real-Money Trade')).toBeInTheDocument();
        expect(screen.getByText('Volatility 100 Index')).toBeInTheDocument();
        expect(screen.getByText('DIGITMATCH')).toBeInTheDocument();
        expect(screen.getByText('Last digit matches 5')).toBeInTheDocument();
        expect(screen.getByText('1 USD')).toBeInTheDocument();
        expect(screen.getByText('5 ticks')).toBeInTheDocument();
        expect(screen.getByText(/REAL · CR…567/)).toBeInTheDocument();
        expect(screen.getByText('Payout if won')).toBeInTheDocument();
        expect(screen.getByText('1.95 USD')).toBeInTheDocument();
        expect(screen.getByText(/Win payout if the last digit matches 5/)).toBeInTheDocument();
        expect(screen.getByText(/Live quote · updated \d+s ago/)).toBeInTheDocument();
    });

    it('reports a quote that could not be fetched instead of showing a price', () => {
        mockState = pendingState({ quote: null, quoteError: 'Live quote unavailable right now — retry.' });

        render(<TradeConfirmation />);

        expect(screen.getByText(/Live quote unavailable right now/)).toBeInTheDocument();
        expect(screen.queryByText('Payout if won')).not.toBeInTheDocument();
        // The order details are still there, so the entry can be judged.
        expect(screen.getByText('Last digit matches 5')).toBeInTheDocument();
    });

    it('approves through Confirm and rejects through Cancel', () => {
        mockState = pendingState();

        render(<TradeConfirmation />);
        fireEvent.click(screen.getByRole('button', { name: 'Confirm & Buy' }));
        expect(mockConfirmTrade).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(mockCancelTrade).toHaveBeenCalledTimes(1);
    });
});
