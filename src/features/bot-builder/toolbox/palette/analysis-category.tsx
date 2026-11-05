import { Block, Category, Example, Examples, Field, Mutation, Next, Shadow, Statement, Value, Xml } from './tags';
import { localize } from '@deriv-com/translations';

export const AnalysisCategory = () => (
    <>
            <Category id='analysis' name={localize('Analysis')}>
                <Category id='indicators' name={localize('Indicators')}>
                    <Block type='sma_statement'>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='smaa_statement'>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='bb_statement'>
                        <Field name='BBRESULT_LIST'>0</Field>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                        <Next>
                                            <Block type='std_dev_multiplier_up' deletable='false' movable='false'>
                                                <Value name='UPMULTIPLIER'>
                                                    <Shadow type='math_number'>
                                                        <Field name='NUM'>5</Field>
                                                    </Shadow>
                                                </Value>
                                                <Next>
                                                    <Block type='std_dev_multiplier_down'>
                                                        <Value name='DOWNMULTIPLIER'>
                                                            <Shadow type='math_number'>
                                                                <Field name='NUM'>5</Field>
                                                            </Shadow>
                                                        </Value>
                                                    </Block>
                                                </Next>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='bba_statement'>
                        <Field name='BBRESULT_LIST'>0</Field>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                        <Next>
                                            <Block type='std_dev_multiplier_up' deletable='false' movable='false'>
                                                <Value name='UPMULTIPLIER'>
                                                    <Shadow type='math_number'>
                                                        <Field name='NUM'>5</Field>
                                                    </Shadow>
                                                </Value>
                                                <Next>
                                                    <Block type='std_dev_multiplier_down'>
                                                        <Value name='DOWNMULTIPLIER'>
                                                            <Shadow type='math_number'>
                                                                <Field name='NUM'>5</Field>
                                                            </Shadow>
                                                        </Value>
                                                    </Block>
                                                </Next>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='ema_statement'>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='emaa_statement'>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='rsi_statement'>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='rsia_statement'>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='period' deletable='false' movable='false'>
                                        <Value name='PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='macda_statement'>
                        <Field name='MACDFIELDS_LIST'>1</Field>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST' />
                                <Next>
                                    <Block type='fast_ema_period' deletable='false' movable='false'>
                                        <Value name='FAST_EMA_PERIOD'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>12</Field>
                                            </Shadow>
                                        </Value>
                                        <Next>
                                            <Block type='slow_ema_period' deletable='false' movable='false'>
                                                <Value name='SLOW_EMA_PERIOD'>
                                                    <Shadow type='math_number'>
                                                        <Field name='NUM'>26</Field>
                                                    </Shadow>
                                                </Value>
                                                <Next>
                                                    <Block type='signal_ema_period' deletable='false' movable='false'>
                                                        <Value name='SIGNAL_EMA_PERIOD'>
                                                            <Shadow type='math_number'>
                                                                <Field name='NUM'>9</Field>
                                                            </Shadow>
                                                        </Value>
                                                    </Block>
                                                </Next>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                </Category>

                <Category name={localize('Tick and candle analysis')} id='tick_analysis'>
                    <Block type='tick_analysis' />
                    <Block type='tick' />
                    <Block type='tick_string' />
                    <Block type='last_digit' />
                    <Block type='stat' />
                    <Block type='stat_list' />
                    <Block type='ticks' />
                    <Block type='ticks_string' />
                    <Block type='lastDigitList' />
                    <Block type='check_direction' />
                    <Block type='is_candle_black' />
                    <Block type='read_ohlc'>
                        <Field name='OHLCFIELD_LIST'>open</Field>
                        <Field name='CANDLEINTERVAL_LIST'>default</Field>
                        <Value name='CANDLEINDEX'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='read_ohlc_obj' />
                    <Block type='ohlc_values' />
                    <Block type='ohlc_values_in_list' />
                    <Block type='get_ohlc'>
                        <Field name='CANDLEINTERVAL_LIST'>default</Field>
                        <Value name='CANDLEINDEX'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='ohlc' />
                </Category>

                <Category name={localize('Contract')} id='contract_details'>
                    <Block type='contract_check_result' />
                    <Block type='read_details' />
                    <Block type='sell_price' />
                    <Block type='check_sell' />
                    <Block type='payout' />
                    <Block type='ask_price' />
                </Category>

                <Category name={localize('Stats')} id='stats'>
                    <Block type='balance' />
                    <Block type='total_profit' />
                    <Block type='total_profit_string' />
                    <Block type='total_runs' />
                </Category>
            </Category>
    </>
);
