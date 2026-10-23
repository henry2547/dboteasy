/**
 * Even/Odd strategy runtime for the Digits palette's Even/Odd blocks.
 *
 * It keeps ONE rolling window of the last N genuine ticks, taken from the same subscription the
 * engine already runs (see `trade/Ticks.js`), and answers the palette's reads from it: parity
 * percentages, the threshold test, the selected signal direction and the once-per-signal gate. The
 * window is invalidated when continuity cannot be trusted (a repeated or out-of-order tick, a market
 * change, a closed connection), so an incomplete window can never signal and never trade.
 *
 * Purchases go through the engine's own purchase path — the same proposal/risk/confirmation code the
 * `Purchase` block uses — and a buy is only reported as confirmed when the engine really recorded a
 * contract. Nothing here builds a second trading engine.
 */
import { observer as globalObserver } from '../../../utils/observer';
import { api_base } from '../../api/api-base';
import {
    EO_CONTRACT_TYPES,
    configureEvenOdd,
    createEvenOddState,
    describeWindow,
    evenOddSnapshot,
    feedEvenOddTick,
    invalidateEvenOdd,
    normalizeParity,
    rememberSignal,
    signalKey,
    signalUsed,
    startEvenOddMonitoring,
} from '../utils/even-odd';
import * as constants from './state/constants';

const notify = (message, className = 'info') =>
    globalObserver.emit('ui.log.notify', { className, message });

/** The trade definition on the canvas, so a requested contract is checked against the bot's own. */
const readTradeDefinition = () => {
    try {
        const definition = globalThis?.window?.Blockly?.derivWorkspace?.getTradeDefinitionBlock?.();
        return {
            trade_type: definition?.getChildByType?.('trade_definition_tradetype')?.getFieldValue?.('TRADETYPE_LIST') ?? null,
            contract_type:
                definition?.getChildByType?.('trade_definition_contracttype')?.getFieldValue?.('TYPE_LIST') ?? null,
        };
    } catch (error) {
        return { trade_type: null, contract_type: null };
    }
};

export default Engine =>
    class EvenOdd extends Engine {
        constructor() {
            super();
            this.even_odd_state = createEvenOddState();
            this.even_odd_waiters = [];
            globalObserver.register('statistics.clear', this.resetEvenOdd.bind(this));
            // A stopped session must not leave the program suspended on a tick that will never come.
            globalObserver.register('bot.stop_button_click', this.releaseEvenOddWaiters.bind(this));
        }

        getEvenOddState() {
            if (!this.even_odd_state) this.even_odd_state = createEvenOddState();
            return this.even_odd_state;
        }

        resetEvenOdd() {
            this.even_odd_state = createEvenOddState();
            this.releaseEvenOddWaiters();
        }

        /** Resolves every pending "wait for next valid tick" with `false`. */
        releaseEvenOddWaiters() {
            const waiters = this.even_odd_waiters || [];
            this.even_odd_waiters = [];
            waiters.forEach(resolve => resolve(false));
        }

        /** The Configure block: validates, stores and reports. Only a change is journalled. */
        eoConfigure(config = {}) {
            const before = this.getEvenOddState().config;
            const { state, errors, ok } = configureEvenOdd(this.getEvenOddState(), config);
            this.even_odd_state = state;

            errors.forEach(error => notify(`Even/Odd: ${error}`, 'warn'));

            const { ticks, percent, direction } = state.config;
            const changed =
                before.ticks !== ticks || before.percent !== percent || before.direction !== direction;
            if (ok && changed) {
                notify(`Even/Odd strategy configured: last ${ticks} ticks, ${percent}% threshold, ${direction} signals.`);
            }
            return { ...state.config };
        }

        /**
         * The "Monitor last N valid ticks" block. Re-arming with the same window size keeps the digits
         * already collected, so the block can sit inside the trade loop.
         */
        eoMonitor(ticks) {
            const before = this.getEvenOddState();
            const state = startEvenOddMonitoring(before, ticks);
            this.even_odd_state = state;

            if (state.window_size !== before.window_size || !before.monitoring) {
                notify(`Even/Odd: monitoring the last ${state.window_size} valid ticks.`);
            }
            return state.window_size;
        }

        /** Called from the engine's own tick callback — the only source of window digits. */
        eoFeedTick({ digit, epoch, symbol } = {}) {
            const result = feedEvenOddTick(this.getEvenOddState(), { digit, epoch, symbol });
            this.even_odd_state = result.state;

            if (result.accepted) {
                const waiters = this.even_odd_waiters || [];
                this.even_odd_waiters = [];
                waiters.forEach(resolve => resolve(true));
            } else if (result.reason && result.reason !== 'tick already processed') {
                notify(`Even/Odd: ${result.reason}.`, 'warn');
            }
            return result.accepted;
        }

        /** Invalidates the window (feed disconnected, market gone) so nothing trades on stale digits. */
        eoInvalidate(reason) {
            this.even_odd_state = invalidateEvenOdd(this.getEvenOddState(), reason);
        }

        /** True only for a full window of genuine ticks on a live connection. */
        eoWindowReady() {
            return this.eoSnapshot().ready;
        }

        eoEvenPercent() {
            return this.eoSnapshot().evenPercent;
        }

        eoOddPercent() {
            return this.eoSnapshot().oddPercent;
        }

        eoEvenMeets(percent) {
            const snapshot = this.eoSnapshot();
            return snapshot.ready && snapshot.evenPercent >= Number(percent);
        }

        eoOddMeets(percent) {
            const snapshot = this.eoSnapshot();
            return snapshot.ready && snapshot.oddPercent >= Number(percent);
        }

        /** The direction the configured strategy really selects, or NO SIGNAL when nothing qualifies. */
        eoSignalDirection() {
            return this.eoSnapshot().signal;
        }

        /** One line describing the window, its percentages and its decision — for the journal. */
        eoStatus() {
            const snapshot = this.eoSnapshot();
            const state = this.getEvenOddState();
            return `${describeWindow(snapshot)} · signal ${snapshot.signal} (${snapshot.signalReason}) · gate ${
                state.one_entry_per_signal ? 'one entry per signal' : 'open'
            }`;
        }

        eoSnapshot() {
            const state = this.getEvenOddState();
            return evenOddSnapshot(state, {
                connected: this.isEvenOddFeedConnected(),
            });
        }

        /**
         * A live connection is part of readiness: with the socket closed the newest window digit is
         * stale, so the analysis is invalid until real ticks arrive again.
         */
        isEvenOddFeedConnected() {
            const ready_state = api_base?.api?.connection?.readyState;
            return ready_state === undefined ? Boolean(api_base?.api) : ready_state === 1;
        }

        /** The "Allow one entry per signal" block: arms duplicate prevention for the session. */
        eoAllowOneEntry() {
            const state = this.getEvenOddState();
            if (state.one_entry_per_signal) return true;
            this.even_odd_state = { ...state, one_entry_per_signal: true };
            notify('Even/Odd: one entry per signal is enforced.');
            return true;
        }

        /** True while the current signal may still open an entry. */
        eoEntryAllowed() {
            const state = this.getEvenOddState();
            if (!state.one_entry_per_signal) return true;
            return !signalUsed(state, this.eoCurrentSignalKey());
        }

        eoCurrentSignalKey() {
            const snapshot = this.eoSnapshot();
            const state = this.getEvenOddState();
            return signalKey({
                symbol: snapshot.symbol,
                window: snapshot.window,
                threshold: snapshot.threshold,
                direction: state.config.direction,
                epoch: state.last_epoch,
            });
        }

        /**
         * The "Wait for next valid tick" block: suspends the program until a genuine new tick arrives.
         * It resolves `false` when the session stops, so a stalled market cannot leave the program
         * waiting forever.
         */
        eoWaitTick() {
            if (this.$scope?.stopped || this.store?.getState?.()?.scope === constants.STOP) {
                return Promise.resolve(false);
            }
            return new Promise(resolve => {
                this.even_odd_waiters = [...(this.even_odd_waiters || []), resolve];
            });
        }

        /**
         * Why an entry is refused, or `null` when it may go ahead. Every refusal is a real state of
         * the engine — a stopped session, an incomplete window, a signal the strategy did not select,
         * a breached risk limit or a contract the trade definition does not offer.
         */
        eoEntryBlockReason(parity) {
            const state = this.getEvenOddState();
            const snapshot = this.eoSnapshot();

            if (!this.tradeOptions) return 'the trade settings have not been read yet';
            if (this.$scope?.stopped || this.store?.getState?.()?.scope !== constants.BEFORE_PURCHASE) {
                return 'the bot is not in its purchase step — it is paused or stopped';
            }
            if (api_base?.is_stopping) return 'the bot is stopping';
            if (!api_base?.is_running) return 'the bot is not running';
            if (!this.symbol) return 'no market is subscribed';
            if (snapshot.symbol && snapshot.symbol !== this.symbol) {
                return `the tick window belongs to ${snapshot.symbol}, not ${this.symbol}`;
            }
            if (!snapshot.ready) {
                return `the tick window is not ready (${snapshot.collected}/${snapshot.window} valid ticks, stale ${snapshot.stale}, connected ${snapshot.connected})`;
            }

            const observed = snapshot.signal;
            if (observed === EO_NO_SIGNAL) return `no signal qualifies (${snapshot.signalReason})`;
            if (normalizeParity(parity) !== observed.toLowerCase()) {
                return `the selected signal is ${observed}, not ${normalizeParity(parity).toUpperCase()}`;
            }

            const amount = Number(this.tradeOptions?.amount);
            if (!Number.isFinite(amount) || amount <= 0) return `the stake (${this.tradeOptions?.amount}) is not a valid amount`;

            if (typeof this.riskCanTrade === 'function' && !this.riskCanTrade()) {
                const reason = this.riskBlockReason?.();
                return reason ? `risk limits: ${reason}` : 'the session risk limits block new entries';
            }

            const { trade_type, contract_type } = readTradeDefinition();
            if (trade_type && trade_type !== 'evenodd') {
                return `the trade definition trades ${trade_type}, not Even/Odd`;
            }
            const wanted = EO_CONTRACT_TYPES[normalizeParity(parity)];
            if (contract_type && contract_type !== 'both' && contract_type !== wanted) {
                return `the trade definition is set to ${contract_type}, so it cannot buy ${wanted}`;
            }

            if (state.one_entry_per_signal && signalUsed(state, this.eoCurrentSignalKey())) {
                return 'this signal already opened an entry';
            }
            if (this.contractId) return `contract ${this.contractId} is still open`;

            return null;
        }

        /**
         * Buys the requested parity through the engine's own purchase path.
         *
         * The returned value is the engine's confirmation, not the block's execution: it is true only
         * when a purchase acknowledgement really recorded a contract id.
         */
        async eoBuy(parity) {
            const wanted = normalizeParity(parity);
            const contract_type = EO_CONTRACT_TYPES[wanted];
            const snapshot = this.eoSnapshot();
            const blocked = this.eoEntryBlockReason(wanted);

            if (blocked) {
                notify(`Even/Odd: ${wanted.toUpperCase()} entry blocked — ${blocked}`, 'warn');
                return false;
            }

            const key = this.eoCurrentSignalKey();
            notify(
                `Even/Odd: requesting ${contract_type} — ${describeWindow(snapshot)} · signal ${snapshot.signal}`
            );

            const previous_contract = this.contractId;
            await this.purchase(contract_type);

            const confirmed = Boolean(this.contractId) && this.contractId !== previous_contract;
            if (!confirmed) {
                notify(`Even/Odd: the ${contract_type} purchase was not confirmed by Deriv.`, 'error');
                return false;
            }

            this.even_odd_state = rememberSignal(this.getEvenOddState(), key);
            this.even_odd_state = { ...this.even_odd_state, last_purchase: { contract_id: this.contractId, contract_type, parity: wanted } };
            notify(`Even/Odd: ${contract_type} confirmed · contract ${this.contractId} · stake ${this.tradeOptions?.amount}`);
            return true;
        }

        eoBuyEven() {
            return this.eoBuy('even');
        }

        eoBuyOdd() {
            return this.eoBuy('odd');
        }
    };
