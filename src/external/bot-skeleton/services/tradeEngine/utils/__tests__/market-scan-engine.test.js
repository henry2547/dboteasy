/**
 * The two market blocks' engine paths, end to end inside the trade engine.
 *
 * `Switch active market` drives the scan state machine; `Find eligible markets` drives market
 * discovery. Both read the app's own market-discovery service, so the API is mocked here and the
 * assertions are on what the engine reports back to the generated program.
 */
jest.mock('../../../api/api-base', () => ({
    api_base: {
        is_running: true,
        is_stopping: false,
        api: {
            send: jest.fn(async () => ({ ok: 1 })),
            onMessage: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
            forgetAll: jest.fn(async () => ({})),
        },
        pushSubscription: jest.fn(),
        clearSubscriptions: jest.fn(),
        toggleRunButton: jest.fn(),
        pip_sizes: { R_10: 0.001 },
        has_active_symbols: true,
        active_symbols: [],
    },
}));

import ApiHelpers from '../../../api/api-helpers';
import TradeEngine from '../../trade';

const symbols = ['R_10', 'R_25', '1HZ100V'].map(code => ({
    underlying_symbol: code,
    underlying_symbol_name: `${code} Index`,
    exchange_is_open: 1,
    is_trading_suspended: 0,
    market: 'synthetic_index',
    submarket: 'random_index',
    pip_size: 0.001,
}));

ApiHelpers.singleton = {
    active_symbols: {
        has_initialization_error: false,
        retrieveActiveSymbols: async () => symbols,
        isSymbolClosed: () => false,
    },
    contracts_for: {
        getContractsFor: async () => [{ contract_type: 'DIGITOVER' }],
    },
};

const tickState = { epoch: 1700000000 };

const makeScope = () => ({
    stopped: false,
    observer: { register: jest.fn(), unregister: jest.fn(), emit: jest.fn(), unregisterAll: jest.fn() },
    ticksService: {
        request: jest.fn(async () => {
            tickState.epoch += 1;
            return Array.from({ length: 30 }, (_, i) => ({ epoch: tickState.epoch + i, quote: 100 + i }));
        }),
        monitor: jest.fn(async () => 'key-1'),
        pipSizes: { R_10: 3, R_25: 3, '1HZ100V': 2 },
        stopMonitor: jest.fn(async () => {}),
        subscriptions: { getIn: () => undefined, deleteIn: () => undefined },
        tickListeners: { hasIn: () => true, getIn: () => ({ size: 1 }) },
        ticks: { delete: () => undefined },
    },
});

const makeEngine = () => {
    const engine = new TradeEngine(makeScope());
    engine.options = { symbol: 'R_10', contractTypes: ['DIGITOVER'] };
    return engine;
};

describe('switch active market block', () => {
    jest.setTimeout(40000);

    it('selects a discovered volatility market and allows the strategy to analyse it', async () => {
        const engine = makeEngine();

        const status = await engine.marketScanBegin({ order: 'sequential', max_switches: 2 });

        expect(status.state).toBe('ANALYZING');
        expect(status.symbol).toBe('1HZ100V');
        expect(status.display_name).toBe('1HZ100V Index');
        expect(status.data_ready).toBe(true);
        expect(status.total).toBe(1);
    });

    it('names the market it freezes when the entry condition is met', async () => {
        const engine = makeEngine();
        await engine.marketScanBegin({ order: 'sequential', max_switches: 2 });

        const locked = await engine.marketScanLock();

        expect(locked.state).toBe('ENTRY_FOUND');
        expect(locked.entry_found).toBe(true);
        expect(locked.display_name).toBe('1HZ100V Index');
        expect(engine.getScanState().message).toContain('1HZ100V Index (1HZ100V)');
    });
});

describe('find eligible markets block', () => {
    it('discovers the markets the bot may switch to', async () => {
        const engine = makeEngine();

        const result = await engine.marketIntelligenceDiscover({
            category: 'all',
            verify_contracts: true,
            min_history: 20,
        });

        expect(result.ok).toBe(true);
        expect(result.count).toBe(1);
        expect(await engine.marketIntelligenceEligibleCount()).toBe(1);
    });
});
