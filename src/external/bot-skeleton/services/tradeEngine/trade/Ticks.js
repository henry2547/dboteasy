/* eslint-disable no-promise-executor-return */
import debounce from 'lodash.debounce';
import { getLocalizedErrorMessage } from '@/constants/backend-error-messages';
import { localize } from '@deriv-com/translations';
import { getLast } from '../../../utils/binary-utils';
import { observer as globalObserver } from '../../../utils/observer';
import { api_base } from '../../api/api-base';
import { observerRuntime } from '../../observer';
import { getDirection, getLastDigit } from '../utils/helpers';
import { expectPositiveInteger } from '../utils/sanitize';
import * as constants from './state/constants';

let tickListenerKey;

export default Engine =>
    class Ticks extends Engine {
        async watchTicks(symbol) {
            if (symbol && this.symbol !== symbol) {
                this.symbol = symbol;
                const { ticksService } = this.$scope;

                await ticksService.stopMonitor({
                    symbol,
                    key: tickListenerKey,
                });
                const callback = ticks => {
                    if (this.is_proposal_subscription_required) {
                        this.checkProposalReady();
                    }
                    const lastTick = ticks.slice(-1)[0];
                    const { epoch } = lastTick;
                    // Observer blocks observe this same genuine tick stream — no separate feed.
                    observerRuntime.feedTick({
                        symbol,
                        price: lastTick.quote,
                        epoch,
                        pip_size: this.getPipSize(),
                    });
                    this.store.dispatch({ type: constants.NEW_TICK, payload: epoch });
                };

                const key = await ticksService.monitor({ symbol, callback });
                tickListenerKey = key;
            }
        }

        checkTicksPromiseExists() {
            return this.$scope.ticksService.ticks_history_promise;
        }

        getTicks(toString = false) {
            return new Promise(resolve => {
                this.$scope.ticksService.request({ symbol: this.symbol }).then(ticks => {
                    const ticks_list = ticks.map(tick => {
                        if (toString) {
                            return tick.quote.toFixed(this.getPipSize());
                        }
                        return tick.quote;
                    });

                    resolve(ticks_list);
                });
            });
        }

        getLastTick(raw, toString = false) {
            return new Promise((resolve, reject) =>
                this.$scope.ticksService
                    .request({ symbol: this.symbol })
                    .then(ticks => {
                        try {
                            let last_tick = raw ? getLast(ticks) : getLast(ticks).quote;
                            if (!raw && toString) {
                                last_tick = last_tick.toFixed(this.getPipSize());
                            }
                            resolve(last_tick);
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .catch(e => {
                        if (e.code === 'MarketIsClosed') {
                            const localizedError = {
                                ...e,
                                message: getLocalizedErrorMessage(e.code, e.details),
                            };
                            globalObserver.emit('Error', localizedError);
                            resolve(e.code);
                        }
                    })
            );
        }

        getLastDigit() {
            return new Promise(resolve => this.getLastTick(false, true).then(tick => resolve(getLastDigit(tick))));
        }

        getLastDigitList() {
            return new Promise(resolve => this.getTicks().then(ticks => resolve(this.getLastDigitsFromList(ticks))));
        }

        isLastDigitOver(digit) {
            return new Promise(resolve =>
                this.getLastDigit().then(last_digit => resolve(last_digit > Number(digit)))
            );
        }

        isLastDigitUnder(digit) {
            return new Promise(resolve =>
                this.getLastDigit().then(last_digit => resolve(last_digit < Number(digit)))
            );
        }

        isLastDigitParity(parity) {
            return new Promise(resolve =>
                this.getLastDigit().then(last_digit =>
                    resolve(parity === 'odd' ? last_digit % 2 === 1 : last_digit % 2 === 0)
                )
            );
        }

        isLastDigitMatches(digit) {
            return new Promise(resolve =>
                this.getLastDigit().then(last_digit => resolve(last_digit === Number(digit)))
            );
        }

        isLastDigitDiffers(digit) {
            return new Promise(resolve =>
                this.getLastDigit().then(last_digit => resolve(last_digit !== Number(digit)))
            );
        }

        getDigitFrequency(digit, sample) {
            return new Promise(resolve =>
                this.getLastDigitList().then(digits => {
                    const size = Math.max(1, Number(sample) || 100);
                    const recent_digits = digits.slice(-size);
                    const hits = recent_digits.filter(value => Number(value) === Number(digit)).length;
                    resolve(recent_digits.length ? (hits / recent_digits.length) * 100 : 0);
                })
            );
        }
        getDigitCount(digit, sample) {
            return new Promise(resolve =>
                this.getLastDigitList().then(digits => {
                    const size = Math.max(1, Number(sample) || 100);
                    const recent_digits = digits.slice(-size);
                    resolve(recent_digits.filter(value => Number(value) === Number(digit)).length);
                })
            );
        }

        getHotColdDigit(mode, sample) {
            return new Promise(resolve =>
                this.getLastDigitList().then(digits => {
                    const size = Math.max(1, Number(sample) || 100);
                    const counts = new Array(10).fill(0);
                    digits.slice(-size).forEach(value => {
                        const digit = Number(value);
                        if (digit >= 0 && digit <= 9) counts[digit] += 1;
                    });
                    const wants_coldest = mode === 'coldest';
                    const best_digit = counts.reduce(
                        (best, count, digit) =>
                            wants_coldest ? (count < counts[best] ? digit : best) : count > counts[best] ? digit : best,
                        0
                    );
                    resolve(best_digit);
                })
            );
        }

        /** True when the newest `count` digits are all of one parity — the digit-pair rule at 2. */
        isDigitParityRun(parity, count) {
            return new Promise(resolve =>
                this.getLastDigitList().then(digits => {
                    const size = Math.max(1, Math.floor(Number(count) || 2));
                    if (digits.length < size) {
                        resolve(false);
                        return;
                    }
                    const wants_even = String(parity).toLowerCase() !== 'odd';
                    resolve(digits.slice(-size).every(value => (Number(value) % 2 === 0) === wants_even));
                })
            );
        }

        getDigitStreak() {
            return new Promise(resolve =>
                this.getLastDigitList().then(digits => {
                    if (!digits.length) {
                        resolve(0);
                        return;
                    }
                    const latest_digit = Number(digits[digits.length - 1]);
                    let streak = 0;
                    for (let index = digits.length - 1; index >= 0; index -= 1) {
                        if (Number(digits[index]) !== latest_digit) break;
                        streak += 1;
                    }
                    resolve(streak);
                })
            );
        }

        getLastDigitsFromList(ticks) {
            const digits = ticks.map(tick => {
                return getLastDigit(tick.toFixed(this.getPipSize()));
            });
            return digits;
        }

        checkDirection(dir) {
            return new Promise(resolve =>
                this.$scope.ticksService
                    .request({ symbol: this.symbol })
                    .then(ticks => resolve(getDirection(ticks) === dir))
            );
        }

        getOhlc(args) {
            const { granularity = this.options.candleInterval || 60, field } = args || {};

            return new Promise(resolve =>
                this.$scope.ticksService
                    .request({ symbol: this.symbol, granularity })
                    .then(ohlc => resolve(field ? ohlc.map(o => o[field]) : ohlc))
            );
        }

        getOhlcFromEnd(args) {
            const { index: i = 1 } = args || {};

            const index = expectPositiveInteger(Number(i), localize('Index must be a positive integer'));

            return new Promise(resolve => this.getOhlc(args).then(ohlc => resolve(ohlc.slice(-index)[0])));
        }

        getPipSize() {
            return this.$scope.ticksService.pipSizes[this.symbol];
        }

        async requestAccumulatorStats() {
            const subscription_id = this.subscription_id_for_accumulators;
            const is_proposal_requested = this.is_proposal_requested_for_accumulators;
            const proposal_request = {
                ...window.Blockly.accumulators_request,
                amount: this?.tradeOptions?.amount,
                basis: this?.tradeOptions?.basis,
                contract_type: 'ACCU',
                currency: this?.tradeOptions?.currency,
                growth_rate: this?.tradeOptions?.growth_rate,
                proposal: 1,
                subscribe: 1,
                underlying_symbol: this?.tradeOptions?.symbol,
            };
            if (!subscription_id && !is_proposal_requested) {
                this.is_proposal_requested_for_accumulators = true;
                if (proposal_request) {
                    await api_base?.api?.send(proposal_request);
                }
            }
        }

        async handleOnMessageForAccumulators() {
            let ticks_stayed_in_list = [];
            return new Promise(resolve => {
                const subscription = api_base.api.onMessage().subscribe(({ data }) => {
                    if (data.msg_type === 'proposal') {
                        try {
                            this.subscription_id_for_accumulators = data.subscription.id;
                            // this was done because we can multile arrays in the respone and the list comes in reverse order
                            const stat_list = (data.proposal.contract_details.ticks_stayed_in || []).flat().reverse();
                            ticks_stayed_in_list = [...stat_list, ...ticks_stayed_in_list];
                            if (ticks_stayed_in_list.length > 0) resolve(ticks_stayed_in_list);
                        } catch (error) {
                            globalObserver.emit('Unexpected message type or no proposal found:', error);
                        }
                    }
                });
                api_base.pushSubscription(subscription);
            });
        }

        async fetchStatsForAccumulators() {
            try {
                // request stats for accumulators
                const debouncedAccumulatorsRequest = debounce(() => this.requestAccumulatorStats(), 300);
                debouncedAccumulatorsRequest();
                // wait for proposal response
                const ticks_stayed_in_list = await this.handleOnMessageForAccumulators();
                return ticks_stayed_in_list;
            } catch (error) {
                globalObserver.emit('Error in subscription promise:', error);
                throw error;
            } finally {
                // forget all proposal subscriptions so we can fetch new stats data on new call
                await api_base?.api?.send({ forget_all: 'proposal' });
                this.is_proposal_requested_for_accumulators = false;
                this.subscription_id_for_accumulators = null;
            }
        }

        async getCurrentStat() {
            try {
                const ticks_stayed_in = await this.fetchStatsForAccumulators();
                return ticks_stayed_in?.[0];
            } catch (error) {
                globalObserver.emit('Error fetching current stat:', error);
            }
        }

        async getStatList() {
            try {
                const ticks_stayed_in = await this.fetchStatsForAccumulators();
                // we need to send only lastest 100 ticks
                return ticks_stayed_in?.slice(0, 100);
            } catch (error) {
                globalObserver.emit('Error fetching current stat:', error);
            }
        }

        async getDelayTickValue(tick_value) {
            return new Promise((resolve, reject) => {
                try {
                    const ticks = [];
                    const symbol = this.symbol;

                    const resolveAndExit = () => {
                        this.$scope.ticksService.stopMonitor({
                            symbol,
                            key: '',
                        });
                        resolve(ticks);
                        ticks.length = 0;
                    };

                    const watchTicks = tick_list => {
                        ticks.push(tick_list);
                        const current_tick = ticks.length;
                        if (current_tick === tick_value) {
                            resolveAndExit();
                        }
                    };

                    const delayExecution = tick_list => watchTicks(tick_list);

                    if (Number(tick_value) <= 0) resolveAndExit();
                    this.$scope.ticksService.monitor({ symbol, callback: delayExecution });
                } catch (error) {
                    reject(new Error(`Failed to start tick monitoring: ${error.message}`));
                }
            });
        }
    };
