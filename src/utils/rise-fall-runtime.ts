/**
 * The one place the Bot Builder's generated code and the Rise/Fall engine meet.
 *
 * The engine itself is React state (its socket, its central executor, its
 * journal); the Blockly runtime is a plain interpreter. This tiny module holds
 * the provider the Rise/Fall tab registers while it is mounted, so a block can
 * read the CURRENT engine snapshot instead of a second implementation of the
 * strategies.
 *
 * It fails closed: with no provider every read answers a neutral value and
 * `requestEntry` refuses with the reason, so a bot running against a closed tab
 * can never pretend it entered through the engine.
 */

export type RiseFallDirection = 'rise' | 'fall' | 'none';

export type RiseFallStat = 'trades' | 'wins' | 'losses' | 'net' | 'open';

export interface RiseFallRuntimeSnapshot {
    /** True while the Rise/Fall tab's engine is mounted. */
    connected: boolean;
    running: boolean;
    mode: string;
    symbol: string;
    strategyId: string;
    strategyLabel: string;
    regime: string;
    direction: RiseFallDirection;
    suitable: boolean;
    riseScore: number;
    fallScore: number;
    explanation: string;
    /** The best qualifying strategy from the walk-forward backtest, if one qualified. */
    bestStrategy: string | null;
    bestScore: number | null;
    stats: Record<RiseFallStat, number>;
    /** Epoch seconds of the newest tick the reading came from. */
    tickEpoch: number;
    /** A journal-ready one-line summary. */
    detail: string;
}

export interface RiseFallEntryRequest {
    stake?: number;
    durationTicks?: number;
}

export interface RiseFallRuntimeProvider {
    snapshot: () => RiseFallRuntimeSnapshot;
    /** Asks the central executor for an entry. It still runs every check. */
    requestEntry: (request: RiseFallEntryRequest) => { ok: boolean; reason: string };
    /** A multi-line report of the engine's own numbers. */
    report: () => string;
}

const DISCONNECTED: RiseFallRuntimeSnapshot = {
    connected: false,
    running: false,
    mode: 'virtual',
    symbol: '',
    strategyId: '',
    strategyLabel: '',
    regime: 'uncertain',
    direction: 'none',
    suitable: false,
    riseScore: 0,
    fallScore: 0,
    explanation: 'The Rise/Fall engine is not open — no signal is being produced.',
    bestStrategy: null,
    bestScore: null,
    stats: { trades: 0, wins: 0, losses: 0, net: 0, open: 0 },
    tickEpoch: 0,
    detail: 'Rise/Fall engine not connected — open the Rise/Fall tab.',
};

class RiseFallRuntime {
    private provider: RiseFallRuntimeProvider | null = null;

    register(provider: RiseFallRuntimeProvider): () => void {
        this.provider = provider;
        return () => {
            if (this.provider === provider) this.provider = null;
        };
    }

    get connected(): boolean {
        return this.provider !== null;
    }

    snapshot(): RiseFallRuntimeSnapshot {
        return this.provider?.snapshot() ?? DISCONNECTED;
    }

    requestEntry(request: RiseFallEntryRequest = {}): { ok: boolean; reason: string } {
        if (!this.provider) {
            return {
                ok: false,
                reason: 'The Rise/Fall engine is not open — open the Rise/Fall tab so the entry can pass its checks.',
            };
        }
        return this.provider.requestEntry(request);
    }

    report(): string {
        if (!this.provider) return 'Rise/Fall engine not connected — open the Rise/Fall tab to read its numbers.';
        return this.provider.report();
    }
}

export const riseFallRuntime = new RiseFallRuntime();
