/**
 * Risk management for the Bot Builder: the runtime behind the "Risk Management" blocks.
 *
 * It tracks the session from events this trade engine already produces — the stake the engine
 * actually bought a contract for and the settlement profit the statistics already record — so a
 * guard never guesses. Limits are opt-in (0 = off); when one is breached the guard reports why,
 * journals it once, and `Bot.riskCanTrade()` answers false. Purchases stay where they were: the
 * program decides whether to buy, exactly like every other condition block.
 */
import { observer as globalObserver } from '../../../utils/observer';
import {
    createRiskLimits,
    createRiskState,
    giveBack,
    recordRiskEntry,
    recordRiskSettlement,
    riskBlockReasons,
    riskCanTrade,
    riskSummary,
    stakeForRisk,
} from '../utils/risk-management';

const journal = (message, className = 'info') => globalObserver.emit('ui.log.notify', { className, message });

const describeLimits = limits => {
    const parts = [];
    if (limits.max_consecutive_losses) parts.push(`${limits.max_consecutive_losses} consecutive loss(es)`);
    if (limits.max_give_back) parts.push(`${limits.max_give_back.toFixed(2)} give-back`);
    if (limits.max_exposure) parts.push(`${limits.max_exposure.toFixed(2)} exposure`);
    if (limits.risk_per_trade_percent) parts.push(`${limits.risk_per_trade_percent}% per trade`);
    return parts.length ? parts.join(', ') : 'none set';
};

export default Engine =>
    class RiskManagement extends Engine {
        constructor() {
            super();
            this.risk_state = createRiskState();
            this.risk_blocked_signature = '';
            this.risk_warnings = new Set();
            globalObserver.register('statistics.clear', this.resetRiskSession.bind(this));
        }

        getRiskState() {
            if (!this.risk_state) this.risk_state = createRiskState();
            return this.risk_state;
        }

        /** The snapshot the blocks (and tests) read — real session values only. */
        riskSnapshot() {
            const state = this.getRiskState();
            return {
                ...state,
                limits: { ...state.limits },
                give_back: giveBack(state),
                can_trade: riskCanTrade(state),
                reasons: riskBlockReasons(state),
            };
        }

        /** Journals a limit breach once, so a blocked session is visible in the run log. */
        noteRiskBlocks(reasons) {
            const signature = reasons.join(' | ');
            if (!reasons.length) {
                this.risk_blocked_signature = '';
                return;
            }
            if (signature === this.risk_blocked_signature) return;
            this.risk_blocked_signature = signature;
            journal(reasons.join(' '), 'warn');
        }

        /** Called by the purchase path with the stake the engine actually paid. */
        recordRiskEntry(stake) {
            const before = this.getRiskState();
            const after = recordRiskEntry(before, stake);
            if (after === before) return;
            this.risk_state = after;
            this.noteRiskBlocks(riskBlockReasons(after));
        }

        /** Called by the settlement path with the profit the engine actually booked. */
        recordRiskSettlement({ profit, stake } = {}) {
            const before = this.getRiskState();
            const after = recordRiskSettlement(before, { profit, stake });
            if (after === before) return;
            this.risk_state = after;

            if (after.consecutive_losses > before.consecutive_losses) {
                journal(
                    `Risk: loss streak is now ${after.consecutive_losses} (session ${after.session_profit.toFixed(2)}).`,
                    'info'
                );
            }
            this.noteRiskBlocks(riskBlockReasons(after));
        }

        resetRiskSession() {
            const limits = this.getRiskState().limits;
            this.risk_state = createRiskState(limits);
            this.risk_blocked_signature = '';
            this.risk_warnings = new Set();
        }

        setRiskLimits(limits = {}) {
            const state = this.getRiskState();
            const next_limits = createRiskLimits({ ...state.limits, ...limits });
            this.risk_state = { ...state, limits: next_limits };
            this.risk_blocked_signature = '';
            journal(`Risk limits set: ${describeLimits(next_limits)}.`);
            this.noteRiskBlocks(riskBlockReasons(this.risk_state));
        }

        riskCanTrade() {
            return riskCanTrade(this.getRiskState());
        }

        /** Why a new trade is blocked, as one sentence — empty while the guard allows trading. */
        riskBlockReason() {
            return riskBlockReasons(this.getRiskState()).join(' ');
        }

        riskConsecutiveLosses() {
            return this.getRiskState().consecutive_losses;
        }

        riskGiveBack() {
            return giveBack(this.getRiskState());
        }

        riskExposure() {
            return this.getRiskState().open_stake;
        }

        riskReport() {
            return riskSummary(this.getRiskState());
        }

        /**
         * Stake for a percentage of the account balance, clamped by the exposure limit. Answers 0
         * (and journals why, once) when there is no authorised balance or no percentage, so a
         * program can check for 0 instead of trading an amount nobody sized.
         */
        riskStake(percent) {
            const state = this.getRiskState();
            const share = Number(percent) > 0 ? Number(percent) : state.limits.risk_per_trade_percent;
            const result = stakeForRisk({
                balance: this.getBalance?.(),
                percent: share,
                max_exposure: state.limits.max_exposure,
                open_stake: state.open_stake,
            });

            if (!result.stake && result.reason && !this.risk_warnings.has(result.reason)) {
                this.risk_warnings.add(result.reason);
                journal(`Risk: ${result.reason}`, 'warn');
            }

            return result.stake;
        }
    };
