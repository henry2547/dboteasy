import { TStrategy } from './strategy.types';

/**
 * Lifecycle state of a saved bot. A bot trades only while its workspace is the
 * one running, so 'running' is resolved from the live run state, never stored.
 */
export type TBotStatus = 'running' | 'stopped';

/** The trade setup a bot carries, read from its trade parameters blocks. */
export type TBotConfig = {
    symbol: string;
    trade_type: string;
    contract_type: string;
    stake: string;
    duration: string;
    currency: string;
};

/** A saved bot: what it is called, where it stands, and how it is configured to trade. */
export type TBot = TStrategy & {
    status: TBotStatus;
    config: TBotConfig;
};
