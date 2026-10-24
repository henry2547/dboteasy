/**
 * The engine path behind the "Use the best Even/Odd market" block.
 *
 * The scan reads the app's own market-discovery service and the trade engine's own tick service, so
 * both are mocked here and the assertions are on what the engine reports back to the generated
 * program: which markets it measured, on how many ticks, which one it kept, and that the engine
 * really trades on that market afterwards.
 *
 * Nothing in these tests invents a tick: every market's digits come from the quote history the
 * mocked tick service hands over, with that market's own pip size — exactly the data the live scan
 * reads.
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
        pip_sizes: {},
        has_active_symbols: true,
        active_symbols: [],
    },
}));

import ApiHelpers from '../../../api/api-helpers';
import TradeEngine from '../../trade';
import { paritySplit, rankParityMarkets, resolveBestMarketSample } from '../even-odd';

/** The three markets the scan compares, named as Deriv names them so the app's own market
 * classification keeps all three in the eligible pool. */
const markets = [
    ['R_10', 'Volatility 10 Index'],
    ['R_25', 'Volatility 25 Index'],
    ['1HZ100V', 'Volatility 100 (1s) Index'],
];

const symbols = markets.map(([code, name]) => ({
    underlying_symbol: code,
    underlying_symbol_name: name,
    exchange_is_open: 1,
    is_trading_suspended: 0,
    market: 'synthetic_index',
    submarket: 'random_index',
    pip_size: 0.01,
}));

/** Every market offers the two digit contracts this bot trades, unless a test takes one away. */
const contracts = { withheld: null };

ApiHelpers.singleton = {
    active_symbols: {
        has_initialization_error: false,
        retrieveActiveSymbols: async () => symbols,
        isSymbolClosed: () => false,
    },
    contracts_for: {
        getContractsFor: async symbol =>
            symbol === contracts.withheld
                ? [{ contract_type: 'DIGITOVER' }]
                : [{ contract_type: 'DIGITEVEN' }, { contract_type: 'DIGITODD' }],
    },
};

/**
 * The last digit each market's own history carries, repeated three times so the split of a 10-tick
 * sample and of the whole 30-tick history are the same measurement.
 */
const MARKET_DIGITS = {
    R_10: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    R_25: [1, 3, 5, 7, 9, 1, 3, 5, 7, 0],
    '1HZ100V': [0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
};

const quoteFor = digit => Number((100 + digit / 100).toFixed(2));

let epoch = 1700000000;

const historyFor = symbol => {
    const pattern = MARKET_DIGITS[symbol] ?? [];
    const digits = [...pattern, ...pattern, ...pattern];
    const ticks = digits.map((digit, index) => ({ epoch: 1700000000 + index, quote: quoteFor(digit) }));
    // Each poll of a subscribed market looks like a live feed moving on, and the last tick always
    // carries the market's own final digit.
    ticks[ticks.length - 1] = { ...ticks[ticks.length - 1], epoch: (epoch += 1) };
    return ticks;
};

const makeScope = () => ({
    stopped: false,
    observer: { register: jest.fn(), unregister: jest.fn(), emit: jest.fn(), unregisterAll: jest.fn() },
    ticksService: {
        request: jest.fn(async ({ symbol }) => historyFor(symbol)),
        monitor: jest.fn(async () => 'key-1'),
        pipSizes: { R_10: 2, R_25: 2, '1HZ100V': 2 },
        stopMonitor: jest.fn(async () => {}),
        subscriptions: { getIn: () => undefined, deleteIn: () => undefined },
        tickListeners: { hasIn: () => true, getIn: () => ({ size: 1 }) },
        ticks: { delete: () => undefined },
    },
});

const makeEngine = () => {
    const engine = new TradeEngine(makeScope());
    engine.options = { symbol: 'R_10', contractTypes: ['DIGITEVEN', 'DIGITODD'] };
    return engine;
};

const bySymbol = measurements =>
    Object.fromEntries(measurements.map(entry => [entry.symbol, entry]));

describe('Use the best even/odd market block', () => {
    jest.setTimeout(40000);

    beforeEach(() => {
        contracts.withheld = null;
    });

    it('measures every eligible market and keeps the one with the most lopsided parity split', async () => {
        const engine = makeEngine();

        const result = await engine.marketScanBestParity({ ticks: 10 });

        expect(result.ok).toBe(true);
        expect(result.state).toBe('ENTRY_FOUND');

        // Every market that was measured is reported back, best split first.
        expect(result.measurements.map(entry => entry.symbol)).toEqual(['R_25', '1HZ100V', 'R_10']);
        expect(result.measurements.map(entry => entry.rank)).toEqual([1, 2, 3]);

        const measured = bySymbol(result.measurements);
        expect(measured.R_10.split).toMatchObject({ parity: 'even', share: 60, total: 10 });
        expect(measured.R_25.split).toMatchObject({ parity: 'odd', share: 90, total: 10 });
        expect(measured['1HZ100V'].split).toMatchObject({ parity: 'even', share: 70, total: 10 });

        expect(result.best.symbol).toBe('R_25');
        expect(result.best.split).toMatchObject({ parity: 'odd', share: 90, total: 10 });

        // The engine genuinely trades on the market it picked, not on the last one it measured.
        expect(engine.symbol).toBe('R_25');
        expect(engine.options.symbol).toBe('R_25');

        const snapshot = engine.snapshotScan();
        expect(snapshot.entry_found).toBe(true);
        expect(snapshot.frozen).toBe(true);
        expect(snapshot.switches).toBe(3);
        expect(snapshot.analysed_count).toBe(3);
        expect(snapshot.active_symbol).toBe('R_25');
        expect(snapshot.skipped).toEqual([]);
    });

    it('falls back to the engine default sample when no tick count is configured', async () => {
        const engine = makeEngine();

        const result = await engine.marketScanBestParity();

        expect(result.ok).toBe(true);
        expect(result.best.symbol).toBe('R_25');
        // 100 is asked for; the history that exists is what is measured, never a padded number.
        result.measurements.forEach(entry => expect(entry.split.total).toBe(30));
    });

    it('passes over a market that does not offer the contracts and keeps the best of the rest', async () => {
        contracts.withheld = 'R_25';
        const engine = makeEngine();

        const result = await engine.marketScanBestParity({ ticks: 10 });

        expect(result.ok).toBe(true);
        expect(result.best.symbol).toBe('1HZ100V');
        expect(result.best.split).toMatchObject({ parity: 'even', share: 70 });
        expect(engine.options.symbol).toBe('1HZ100V');

        const snapshot = engine.snapshotScan();
        expect(snapshot.skipped).toEqual([
            {
                symbol: 'R_25',
                display_name: 'Volatility 25 Index',
                reason: 'Does not offer DIGITEVEN/DIGITODD',
            },
        ]);
    });

    it('leaves the market alone and reports it when the user has stopped the bot', async () => {
        const engine = makeEngine();
        engine.$scope.stopped = true;

        const result = await engine.marketScanBestParity({ ticks: 10 });

        expect(result.ok).toBe(false);
        expect(result.state).toBe('STOPPED');
        expect(result.measurements).toEqual([]);
        expect(engine.options.symbol).toBe('R_10');
    });
});

describe('parity ranking helpers', () => {
    it('ranks the largest share first and breaks a tie with the larger sample', () => {
        const ranked = rankParityMarkets([
            { symbol: 'A', split: { share: 70, total: 10 } },
            { symbol: 'B', split: { share: 70, total: 30 } },
            { symbol: 'C', split: { share: 90, total: 10 } },
        ]);

        expect(ranked.map(entry => entry.symbol)).toEqual(['C', 'B', 'A']);
        expect(ranked.map(entry => entry.rank)).toEqual([1, 2, 3]);
    });

    it('drops anything that was never measured instead of ranking it', () => {
        const ranked = rankParityMarkets([
            { symbol: 'A', split: paritySplit([2, 4, 6]) },
            { symbol: 'B', split: null },
            { split: { share: 90, total: 10 } },
            null,
        ]);

        expect(ranked).toHaveLength(1);
        expect(ranked[0]).toMatchObject({ symbol: 'A', rank: 1 });
        expect(ranked[0].split).toMatchObject({ parity: 'even', share: 100 });
    });

    it('keeps the sample inside the range the rolling window accepts', () => {
        expect(resolveBestMarketSample(undefined)).toBe(100);
        expect(resolveBestMarketSample(0)).toBe(100);
        expect(resolveBestMarketSample(25)).toBe(25);
        expect(resolveBestMarketSample(5000)).toBe(1000);
    });
});
