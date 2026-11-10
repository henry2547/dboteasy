/**
 * Trading mode — how many contracts one confirmed entry may take.
 *
 * The mode is a field of the trade definition ("1. Trade parameters" → Mode) and reaches the engine
 * through `Bot.init`'s `tradingMode` option:
 *
 * - CONTINUOUS (default): the first confirmed entry — the losing pairs plus the confirmation digit —
 *   stays live, so the bot takes trades continuously from it. After a settled WIN it trades again as
 *   soon as its own purchase conditions pass, without waiting for a fresh confirmation; a settled
 *   LOSS sends it to the Even/Odd recovery leg, and the live entry keeps carrying trades after that
 *   until the take profit, the stop loss or a stop rule ends the run.
 * - SINGLE: one contract per confirmed entry. Once the contract settles — won or lost — the entry is
 *   used up and the bot waits for the next confirmation: the pairs and the confirmation digit again
 *   (or a fresh observer entry signal on a canvas that gates entries). A settled loss still takes the
 *   Even/Odd recovery leg, which is an entry of its own and is never held back.
 *
 * The state is three-valued: `idle` (no entry confirmed), `open` (entry confirmed, may trade) and
 * `used` (a contract settled under it). Nothing here places a trade, sizes a stake or stops a
 * session; it only answers the run loop's "may this iteration start a trade?" and blocks a purchase
 * the single mode has already spent.
 */
import { observer as globalObserver } from '../../../utils/observer';
import { observerRuntime } from '../../observer';

const notify = (message, className = 'info') => globalObserver.emit('ui.log.notify', { className, message });

export const TRADING_MODES = {
    CONTINUOUS: 'CONTINUOUS',
    SINGLE: 'SINGLE',
};

const createTradingModeState = () => ({
    entry: 'idle',
    // Continuous mode: a confirmed entry that has already carried a trade, so its confirmation — the
    // pairs and the confirmation digit — does not have to be waited for again.
    entry_live: false,
    // The buy the blocks are attempting right now is the Even/Odd leg a settled loss opened.
    recovery: false,
    attempted_this_tick: false,
    waiting_notified: false,
    announced: false,
});

export default Engine =>
    class TradingMode extends Engine {
        /** The mode the trade definition carries; anything unrecognised is the continuous default. */
        tradingMode() {
            return this.options?.tradingMode === TRADING_MODES.SINGLE ? TRADING_MODES.SINGLE : TRADING_MODES.CONTINUOUS;
        }

        isSingleTradeMode() {
            return this.tradingMode() === TRADING_MODES.SINGLE;
        }

        /** Fresh state for a new run; `Bot.init` runs once per run, not once per trade loop. */
        resetTradingMode() {
            this.trading_mode_state = createTradingModeState();
        }

        getTradingModeState() {
            if (!this.trading_mode_state) this.resetTradingMode();
            return this.trading_mode_state;
        }

        /** True when the canvas carries an observer entry gate, which is what "an entry" means there. */
        tradingModeGated() {
            return observerRuntime.gateEnabled();
        }

        /** One journal line per run, so the mode a bot runs in is never a hidden setting. */
        tradingModeAnnounce() {
            const state = this.getTradingModeState();
            if (state.announced) return;
            state.announced = true;
            notify(
                this.isSingleTradeMode()
                    ? 'Trading mode: single — one contract per entry, then it waits for the next entry.'
                    : 'Trading mode: continuous — the first confirmed entry keeps trading until the take profit, with the Even/Odd leg after a loss.'
            );
        }

        /**
         * The run loop's gate: may this iteration start a trade?
         *
         * A canvas with no observer entry gate defines its entry by its purchase conditions, which
         * are re-read every tick, so the loop always continues and the single mode defers the
         * purchase instead (see `tradingModeBlocksPurchase`).
         */
        tradingModeEntryAllowed() {
            if (!this.tradingModeGated()) return true;

            const state = this.getTradingModeState();
            if (state.entry === 'open') return true;
            if (observerRuntime.consumeEntry()) {
                state.entry = 'open';
                return true;
            }
            return false;
        }

        /**
         * True while the confirmed entry may trade WITHOUT a fresh confirmation.
         *
         * Continuous mode keeps it live from the first trade of the entry until the run stops, so
         * the losing-pair confirmation the bot waited for gates that first trade only and the bot
         * then trades continuously. Single mode never skips a confirmation: every contract needs its
         * own pairs-plus-confirmation entry.
         */
        tradingModeEntryLive() {
            if (this.isSingleTradeMode()) return false;
            return this.getTradingModeState().entry_live;
        }

        /**
         * Single mode on a canvas without an entry gate: the entry the bot just traded is spent, so
         * the purchase is deferred until the entry conditions have lapsed once. The Even/Odd leg a
         * settled loss opens is a new entry of its own, so it is never held back.
         */
        tradingModeBlocksPurchase() {
            if (this.tradingModeGated() || !this.isSingleTradeMode()) return false;
            const state = this.getTradingModeState();
            return !state.recovery && state.entry === 'used';
        }

        /** The canvas reached its purchase block this tick — its entry conditions held. */
        tradingModePurchaseAttempted(options = {}) {
            const state = this.getTradingModeState();
            state.attempted_this_tick = true;
            state.recovery = Boolean(options?.recovery);
            if (state.entry !== 'used') state.entry = 'open';
        }

        /** A purchase was sent: the entry is live (and it stays live in continuous mode). */
        tradingModePurchased() {
            const state = this.getTradingModeState();
            state.entry = 'open';
            state.entry_live = true;
            state.waiting_notified = false;
        }

        /**
         * Called once after a settled contract, before the loop starts its next iteration.
         *
         * Single mode spends the entry whatever the result. Continuous mode never clears the live
         * entry — not after a win and not after a loss, so the Even/Odd leg a loss opens is followed
         * by more trades without another pairs-plus-confirmation wait — until the run stops on its
         * take profit or stop rule. `entry` still tracks the observer-gated loop, which closes on a
         * loss and reopens on the observer's next entry signal.
         */
        tradingModeTradeSettled() {
            const state = this.getTradingModeState();
            const result = this.sessionLastResult?.() ?? '';
            state.entry = this.isSingleTradeMode() ? 'used' : result === 'loss' ? 'idle' : 'open';
            state.recovery = false;
            state.waiting_notified = false;
        }

        tradingModeTickStart() {
            this.getTradingModeState().attempted_this_tick = false;
        }

        /**
         * A tick of the purchase loop that produced no purchase means the entry conditions did not
         * hold, so a single-mode entry that was used up is free again on the next qualifying tick.
         */
        tradingModeTickEnd() {
            const state = this.getTradingModeState();
            if (state.attempted_this_tick) return;
            if (!this.tradingModeGated() && state.entry === 'used') state.entry = 'idle';
        }

        /** Journals (once per entry) why a single-mode purchase was held back. */
        tradingModeJournalWaiting() {
            const state = this.getTradingModeState();
            if (state.waiting_notified) return;
            state.waiting_notified = true;
            notify('Trading mode: single — waiting for the next entry before trading again.', 'info');
        }
    };
