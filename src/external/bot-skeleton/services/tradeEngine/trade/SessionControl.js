/**
 * Session control for the Bot Builder: the runtime behind the "Trading & Execution", "Bot Control"
 * and "Reporting" blocks.
 *
 * It only reads what the trade engine already did — the contracts it bought, the settlement it
 * booked, the contract id that is still open — and it stops a session through the very same event the
 * run panel's Stop button emits, so a program that decides to stop is indistinguishable from a user
 * clicking Stop. Nothing here places a trade or sizes a stake on its own.
 */
import { observer as globalObserver } from '../../../utils/observer';
import * as constants from './state/constants';
import {
    createSessionState,
    journalLevel,
    lastTradeResult,
    normalizeStopReason,
    recordSessionEntry,
    recordSessionSettlement,
    sessionSummary,
    tradeLimitReached,
} from '../utils/session-control';

const notify = (message, className = 'info') => globalObserver.emit('ui.log.notify', { className, message });

export default Engine =>
    class SessionControl extends Engine {
        constructor() {
            super();
            this.session_control = createSessionState();
            this.session_stop_requested = false;
            globalObserver.register('statistics.clear', this.resetSessionControl.bind(this));
        }

        getSessionControl() {
            if (!this.session_control) this.session_control = createSessionState();
            return this.session_control;
        }

        /** The snapshot the blocks (and tests) read — real session values only. */
        sessionSnapshot() {
            const state = this.getSessionControl();
            return { ...state, open: this.sessionOpenContracts(), symbol: this.symbol || '' };
        }

        /** Called by the purchase path for every contract the engine really bought. */
        recordSessionEntry() {
            this.session_control = recordSessionEntry(this.getSessionControl());
        }

        /** Called by the settlement path with the profit the engine really booked. */
        recordSessionSettlement({ profit, stake } = {}) {
            this.session_control = recordSessionSettlement(this.getSessionControl(), { profit, stake });
        }

        resetSessionControl() {
            this.session_control = createSessionState();
            this.session_stop_requested = false;
        }

        /** The engine's own open-contract id is authoritative, so this never counts a phantom. */
        sessionOpenContracts() {
            return this.contractId ? 1 : 0;
        }

        sessionHasOpenContract() {
            return Boolean(this.contractId);
        }

        sessionLastResult() {
            return lastTradeResult(this.getSessionControl());
        }

        sessionLastProfit() {
            return this.getSessionControl().last_profit;
        }

        sessionProfit() {
            return this.getSessionControl().profit;
        }

        sessionTradesTaken() {
            return this.getSessionControl().bought;
        }

        sessionTradeLimitReached(limit) {
            return tradeLimitReached(this.getSessionControl(), limit);
        }

        /**
         * Resolves once the open contract settles, or once the session stops — never before, and
         * immediately when no contract is open. The engine dispatches `sell` on settlement and
         * clears `contractId`, which is what this waits for.
         */
        waitForSessionSettlement() {
            if (!this.contractId) return Promise.resolve(false);
            if (!this.store?.subscribe) return Promise.resolve(false);

            return new Promise(resolve => {
                const unsubscribe = this.store.subscribe(() => {
                    const settled = !this.contractId;
                    const stopped = this.store.getState().scope === constants.STOP;
                    if (!settled && !stopped) return;
                    unsubscribe();
                    resolve(settled);
                });
            });
        }

        /** Stops the session through the same path as the run panel's Stop button, once. */
        stopBotWithReason(reason) {
            const text = normalizeStopReason(reason);
            if (this.session_stop_requested) return;
            this.session_stop_requested = true;
            this.session_control = { ...this.getSessionControl(), stopped_reason: text };
            notify(`Bot control: stopping — ${text}`, 'warn');
            globalObserver.emit('bot.stop_button_click');
        }

        /** Writes one line into the run journal at the requested level. */
        journalNote(message, level = 'info') {
            notify(String(message ?? ''), journalLevel(level));
        }

        sessionReport() {
            return sessionSummary(this.getSessionControl(), {
                symbol: this.symbol || '',
                currency: this.accountInfo?.currency || '',
                open: this.sessionOpenContracts(),
            });
        }
    };
