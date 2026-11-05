import { Block, Category, Example, Examples, Field, Mutation, Next, Shadow, Statement, Value, Xml } from './tags';
import { localize } from '@deriv-com/translations';

export const TradingCategories = () => (
    <>
            <Category id='digits' name={localize('Digits')}>
                <Block type='digits_over_under'>
                    <Field name='SIDE'>over</Field>
                    <Field name='DIGIT'>1</Field>
                </Block>
                <Block type='digits_even_odd'>
                    <Field name='PARITY'>even</Field>
                </Block>
                <Block type='digits_matches_differs'>
                    <Field name='MODE'>matches</Field>
                    <Field name='DIGIT'>1</Field>
                </Block>
                <Block type='digits_high_run'>
                    <Value name='COUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>3</Field>
                        </Shadow>
                    </Value>
                    <Field name='MODE'>at_or_above</Field>
                    <Field name='DIGIT'>6</Field>
                </Block>
                <Block type='digits_shares_below'>
                    <Field name='FIRST'>0</Field>
                    <Field name='SECOND'>1</Field>
                    <Value name='PERCENT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>10.5</Field>
                        </Shadow>
                    </Value>
                    <Value name='SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>1000</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='digits_frequency'>
                    <Field name='DIGIT'>3</Field>
                    <Value name='SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>100</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='digits_hot_cold'>
                    <Field name='MODE'>hottest</Field>
                    <Value name='SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>100</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='digits_bar_neutral'>
                    <Field name='DIGIT'>6</Field>
                    <Value name='SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>100</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='digits_streak' />
                {/* The cold-run pair reads: the losing pair in a row (0/1 or 8/9) and its "no red bar" guard. */}
                <Block type='digits_run_in_set'>
                    <Value name='COUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>3</Field>
                        </Shadow>
                    </Value>
                    <Field name='SET'>0_1</Field>
                </Block>
                <Block type='digits_no_red_bar'>
                    <Field name='DIGIT'>0</Field>
                    <Value name='SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>100</Field>
                        </Shadow>
                    </Value>
                </Block>
                {/* The observed pair setup: a pair from the losing digits, then a confirmation digit a
                    few ticks later (other digits may pass in between). */}
                <Block type='digits_pair_confirmation'>
                    <Field name='SET'>0_1</Field>
                </Block>
                <Block type='digits_cold_pair_entry'>
                    <Field name='PRIMARY'>over_1</Field>
                    <Value name='PERCENT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>10.2</Field>
                        </Shadow>
                    </Value>
                    <Value name='SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>100</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='switch_active_market'>
                    <Field name='ORDER'>sequential</Field>
                    <Value name='MAX_SWITCHES'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>4</Field>
                        </Shadow>
                    </Value>
                </Block>
                {/* The parity scan: it measures every eligible market's own recent ticks and keeps the
                    most lopsided one, instead of stopping at the first market whose condition passes. */}
                <Block type='switch_best_parity_market'>
                    <Value name='TICKS'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>100</Field>
                        </Shadow>
                    </Value>
                </Block>
                {/* The two-leg entry: the Over 1 / Under 8 digit trade first, then the reversal of the
                    newest digits after a settled loss. */}
                <Block type='digits_parity_recovery'>
                    <Field name='PRIMARY'>over_1</Field>
                    <Field name='PARITY'>both</Field>
                    <Field name='RUN'>2</Field>
                </Block>
                {/* The observed pair setup with the Even/Odd reversal after a loss: the pair stays
                    under 10.2% with no red bar, is confirmed a few ticks later, then a settled loss
                    reverses on the same market. */}
                <Block type='digits_cold_run_recovery'>
                    <Field name='PRIMARY'>over_1</Field>
                    <Field name='PERCENT'>10.2</Field>
                    <Field name='SAMPLE'>100</Field>
                    <Field name='PARITY'>both</Field>
                    <Field name='REVERSAL'>2</Field>
                </Block>
                {/* Even/Odd strategy: configure the window it reads, then the conditions above the
                    two entries. Every value is the engine call the block generates. */}
                <Block type='eo_configure'>
                    <Field name='TICKS'>20</Field>
                    <Field name='PERCENT'>65</Field>
                    <Field name='DIRECTION'>both</Field>
                </Block>
                <Block type='eo_monitor_ticks'>
                    <Value name='TICKS'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>20</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='eo_window_ready' />
                <Block type='eo_even_percentage' />
                <Block type='eo_odd_percentage' />
                <Block type='eo_even_meets'>
                    <Value name='PERCENT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>65</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='eo_odd_meets'>
                    <Value name='PERCENT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>65</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='eo_signal_direction' />
                <Block type='eo_buy_even' />
                <Block type='eo_buy_odd' />
                <Block type='eo_one_entry_per_signal' />
                {/* One block for the reversal entry: it journals the newest digits and buys the
                    opposite parity through the engine's own purchase path. */}
                <Block type='eo_journal_reverse'>
                    <Field name='RUN'>2</Field>
                </Block>
                <Block type='eo_wait_tick' />
            </Category>
            {/* Market intelligence: discovery, readiness, ranking and cooldowns. Every block reads
                the app's own market-discovery service and the trade engine's own tick data. */}
            <Category id='market_intelligence' name={localize('Market Intelligence')}>
                <Block type='market_discover_eligible'>
                    <Field name='CATEGORY'>all</Field>
                    <Field name='VERIFY'>no</Field>
                    <Value name='MIN_HISTORY'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>20</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='market_eligible_count' />
                <Block type='market_readiness'>
                    <Field name='SYMBOL'></Field>
                </Block>
                <Block type='market_readiness_report'>
                    <Field name='SYMBOL'></Field>
                </Block>
                <Block type='market_rank'>
                    <Field name='CRITERION'>readiness</Field>
                    <Value name='MIN_SAMPLE'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>30</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='market_top_ranked' />
                <Block type='market_cooldown'>
                    <Field name='SYMBOL'></Field>
                    <Field name='CYCLES'>1</Field>
                    <Field name='MINUTES'>0</Field>
                    <Field name='REASON'>Cooling down after the configured event</Field>
                </Block>
                <Block type='market_is_cooling'>
                    <Field name='SYMBOL'></Field>
                </Block>
                <Block type='market_excluded_report' />
            </Category>
            {/* Risk management: session guards measured from settled contracts, and stake sizing
                from the authorised balance. Limits are opt-in (0 = off). */}
            <Category id='risk_management' name={localize('Risk Management')}>
                <Block type='risk_can_trade' />
                <Block type='risk_block_reason' />
                <Block type='risk_consecutive_losses' />
                <Block type='risk_give_back' />
                <Block type='risk_exposure' />
                <Block type='risk_stake'>
                    <Value name='RISK_PERCENT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>1</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='risk_set_limits'>
                    <Field name='MAX_LOSSES'>3</Field>
                    <Field name='MAX_GIVE_BACK'>0</Field>
                    <Field name='MAX_EXPOSURE'>0</Field>
                    <Field name='RISK_PERCENT'>1</Field>
                </Block>
                <Block type='risk_reset_session' />
                <Block type='risk_report' />
            </Category>
            {/* Strategy learning: per-label hit rate, streaks and profit measured from contracts
                this run really settled. Names must match the "Learn following trades" block. */}
            <Category id='strategy_learning' name={localize('Strategy Learning')}>
                <Block type='learn_set_strategy'>
                    <Field name='NAME'>strategy 1</Field>
                </Block>
                <Block type='learn_hit_rate'>
                    <Field name='NAME' />
                </Block>
                <Block type='learn_sample_size'>
                    <Field name='NAME' />
                </Block>
                <Block type='learn_streak'>
                    <Field name='KIND'>wins</Field>
                    <Field name='NAME' />
                </Block>
                <Block type='learn_best_strategy'>
                    <Field name='CRITERION'>hit_rate</Field>
                    <Field name='MIN_SAMPLE'>10</Field>
                </Block>
                <Block type='learn_compare'>
                    <Field name='FIRST'>strategy 1</Field>
                    <Field name='SECOND'>strategy 2</Field>
                    <Field name='MIN_SAMPLE'>10</Field>
                </Block>
                <Block type='learn_report' />
                <Block type='learn_reset' />
            </Category>
            {/* Execution reads: what the engine really bought, what it settled last, and what is
                still open. Every value comes from the trades this run actually made. */}
            <Category id='trading_execution' name={localize('Trading & Execution')}>
                <Block type='exec_last_result' />
                <Block type='exec_last_profit' />
                <Block type='exec_session_profit' />
                <Block type='exec_session_trades' />
                <Block type='exec_open_contracts' />
                <Block type='exec_has_open_contract' />
                <Block type='exec_wait_settlement' />
            </Category>
            {/* Bot control: stop through the same path as the Stop button, and a session trade cap. */}
            <Category id='bot_control' name={localize('Bot Control')}>
                <Block type='bot_stop'>
                    <Value name='REASON'>
                        <Shadow type='text'>
                            <Field name='TEXT'>Session limit reached</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='bot_trade_limit_reached'>
                    <Value name='LIMIT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>10</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='entry_check'>
                    <Value name='REASON'>
                        <Shadow type='text'>
                            <Field name='TEXT'>Entry conditions no longer met</Field>
                        </Shadow>
                    </Value>
                </Block>
            </Category>
            {/* Reporting: one measured summary line, and a note in the run log. */}
            <Category id='session_reporting' name={localize('Reporting')}>
                <Block type='report_session' />
                <Block type='report_journal'>
                    <Value name='MESSAGE'>
                        <Shadow type='text'>
                            <Field name='TEXT'>Entry skipped</Field>
                        </Shadow>
                    </Value>
                </Block>
            </Category>
    </>
);
