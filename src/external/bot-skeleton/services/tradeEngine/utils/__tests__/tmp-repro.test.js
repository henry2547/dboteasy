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

describe('repro: market blocks runtime', () => {
    jest.setTimeout(40000);

    it('switch active market scan runs', async () => {
        const engine = new TradeEngine(makeScope());
        engine.options = { symbol: 'R_10', contractTypes: ['DIGITOVER'] };
        const out = [];
        out.push(await engine.marketScanBegin({ order: 'sequential', max_switches: 2 }));
        out.push(await engine.marketScanNext());
        out.push(await engine.marketScanLock());
        console.log(
            'SCAN',
            JSON.stringify(
                out.map(r => ({ state: r && r.state, message: r && r.message, symbol: r && r.symbol })),
                null,
                1
            )
        );
    });

    it('find eligible markets runs', async () => {
        const engine = new TradeEngine(makeScope());
        engine.options = { symbol: 'R_10', contractTypes: ['DIGITOVER'] };
        const res = await engine.marketIntelligenceDiscover({
            category: 'all',
            verify_contracts: true,
            min_history: 20,
        });
        const count = await engine.marketIntelligenceEligibleCount();
        console.log('DISCOVER', JSON.stringify({ res, count }));
    });
});
