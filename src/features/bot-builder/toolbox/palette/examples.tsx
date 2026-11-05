import { Arg, Block, Category, Example, Examples, Field, Mutation, Next, Shadow, Statement, Value, Xml } from './tags';
import { localize } from '@deriv-com/translations';

export const PaletteExamples = () => (
    <>
            <Examples id='examples'>
                <Example id='sell_available'>
                    <Block type='during_purchase'>
                        <Statement name='DURING_PURCHASE_STACK'>
                            <Block type='controls_if'>
                                <Value name='IF0'>
                                    <Block type='check_sell' />
                                </Value>
                                <Statement name='DO0'>
                                    <Block type='sell_at_market' />
                                </Statement>
                            </Block>
                        </Statement>
                    </Block>
                </Example>
                <Example id='trade_again'>
                    <Block type='after_purchase'>
                        <Statement name='AFTERPURCHASE_STACK'>
                            <Block type='controls_if'>
                                <Value name='IF0'>
                                    <Block type='logic_compare'>
                                        <Field name='OP'>EQ</Field>
                                        <Value name='A'>
                                            <Block type='total_profit' />
                                        </Value>
                                        <Value name='B'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    target_profit
                                                </Field>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Value>
                            </Block>
                        </Statement>
                    </Block>
                </Example>
                <Example id='sma_block_example'>
                    <Block type='sma_statement'>
                        <Field name='VARIABLE' variabletype=''>
                            sma
                        </Field>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST'>
                                    <Block type='ohlc_values'>
                                        <Field name='OHLCFIELD_LIST'>open</Field>
                                        <Field name='CANDLEINTERVAL_LIST'>default</Field>
                                    </Block>
                                </Value>
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
                </Example>
                <Example id='sma_array'>
                    <Block type='smaa_statement'>
                        <Field name='VARIABLE' variabletype=''>
                            smaa
                        </Field>
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
                </Example>
                <Example id='sma_block_example_1'>
                    <Block type='sma_statement'>
                        <Field name='VARIABLE' variabletype=''>
                            sma
                        </Field>
                        <Statement name='STATEMENT'>
                            <Block type='input_list' deletable='false' movable='false'>
                                <Value name='INPUT_LIST'>
                                    <Block type='ticks' />
                                </Value>
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
                </Example>
                <Example id='in_candle_list_read'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            op
                        </Field>
                        <Value name='VALUE'>
                            <Block type='read_ohlc'>
                                <Field name='OHLCFIELD_LIST'>open</Field>
                                <Field name='CANDLEINTERVAL_LIST'>default</Field>
                                <Value name='CANDLEINDEX'>
                                    <Shadow type='math_number'>
                                        <Field name='NUM'>1</Field>
                                    </Shadow>
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='read_candle_value'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            op
                        </Field>
                        <Value name='VALUE'>
                            <Block type='read_ohlc_obj'>
                                <Field name='OHLCFIELD_LIST'>open</Field>
                                <Value name='OHLCOBJ'>
                                    <Block type='read_ohlc'>
                                        <Field name='OHLCFIELD_LIST'>open</Field>
                                        <Field name='CANDLEINTERVAL_LIST'>default</Field>
                                        <Value name='CANDLEINDEX'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>1</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='candle_list'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            candle_list
                        </Field>
                        <Value name='VALUE'>
                            <Block type='ohlc_values'>
                                <Field name='OHLCFIELD_LIST'>open</Field>
                                <Field name='CANDLEINTERVAL_LIST'>default</Field>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='candle_list_1'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            cl
                        </Field>
                        <Value name='VALUE'>
                            <Block type='ohlc_values_in_list'>
                                <Field name='OHLCFIELD_LIST'>open</Field>
                                <Value name='OHLCLIST'>
                                    <Block type='ohlc'>
                                        <Field name='CANDLEINTERVAL_LIST'>default</Field>
                                    </Block>
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='get_candle'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            candle_open_price
                        </Field>
                        <Value name='VALUE'>
                            <Block type='read_ohlc_obj'>
                                <Field name='OHLCFIELD_LIST'>epoch</Field>
                                <Value name='OHLCOBJ'>
                                    <Block type='get_ohlc'>
                                        <Field name='CANDLEINTERVAL_LIST'>default</Field>
                                        <Value name='CANDLEINDEX'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>2</Field>
                                            </Shadow>
                                        </Value>
                                    </Block>
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='check_result'>
                    <Block type='after_purchase'>
                        <Statement name='AFTERPURCHASE_STACK'>
                            <Block type='controls_if'>
                                <Value name='IF0'>
                                    <Block type='contract_check_result'>
                                        <Field name='CHECK_RESULT'>win</Field>
                                    </Block>
                                </Value>
                                <Statement name='DO0'>
                                    <Block type='trade_again' />
                                </Statement>
                            </Block>
                        </Statement>
                    </Block>
                </Example>
                <Example id='sell_pl'>
                    <Block type='during_purchase'>
                        <Statement name='DURING_PURCHASE_STACK'>
                            <Block type='controls_if'>
                                <Value name='IF0'>
                                    <Block type='check_sell' />
                                </Value>
                                <Statement name='DO0'>
                                    <Block type='controls_if'>
                                        <Value name='IF0'>
                                            <Block type='logic_compare'>
                                                <Field name='OP'>EQ</Field>
                                                <Value name='A'>
                                                    <Block type='sell_price' />
                                                </Value>
                                                <Value name='B'>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            stake
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Value>
                                        <Statement name='DO0'>
                                            <Block type='sell_at_market' />
                                        </Statement>
                                    </Block>
                                </Statement>
                            </Block>
                        </Statement>
                    </Block>
                </Example>
                <Example id='if-return'>
                    <Block type='procedures_defreturn'>
                        <Mutation>
                            <Arg name='x' />
                        </Mutation>
                        <Field name='NAME'>do something</Field>
                        <Statement name='STACK'>
                            <Block type='procedures_ifreturn'>
                                <Mutation value='1' />
                                <Value name='CONDITION'>
                                    <Block type='logic_compare'>
                                        <Field name='OP'>EQ</Field>
                                        <Value name='A'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    x
                                                </Field>
                                            </Block>
                                        </Value>
                                        <Value name='B'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    x
                                                </Field>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Value>
                                <Value name='VALUE'>
                                    <Block type='text'>
                                        <Field name='TEXT'>x must be positive or zero</Field>
                                    </Block>
                                </Value>
                            </Block>
                        </Statement>
                        <Value name='RETURN'>
                            <Block type='math_single'>
                                <Field name='OP'>ROOT</Field>
                                <Value name='NUM'>
                                    <Shadow type='math_number'>
                                        <Field name='NUM'>9</Field>
                                    </Shadow>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            x
                                        </Field>
                                    </Block>
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='notify_telegram'>
                    <Block type='notify_telegram'>
                        <Value name='TELEGRAM_ACCESS_TOKEN'>
                            <Shadow type='text'>
                                <Field name='TEXT' />
                            </Shadow>
                            <Block type='variables_get'>
                                <Field name='VAR' variabletype=''>
                                    access_token
                                </Field>
                            </Block>
                        </Value>
                        <Value name='TELEGRAM_CHAT_ID'>
                            <Shadow type='text'>
                                <Field name='TEXT' />
                            </Shadow>
                            <Block type='variables_get'>
                                <Field name='VAR' variabletype=''>
                                    chat_id
                                </Field>
                            </Block>
                        </Value>
                        <Value name='TELEGRAM_MESSAGE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>Enjoy!</Field>
                            </Shadow>
                        </Value>
                    </Block>
                </Example>
                <Example id='epoch'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            candle
                        </Field>
                        <Value name='VALUE'>
                            <Block type='read_ohlc'>
                                <Field name='OHLCFIELD_LIST'>open</Field>
                                <Field name='CANDLEINTERVAL_LIST'>default</Field>
                                <Value name='CANDLEINDEX'>
                                    <Shadow type='math_number'>
                                        <Field name='NUM'>1</Field>
                                    </Shadow>
                                </Value>
                            </Block>
                        </Value>
                        <Next>
                            <Block type='variables_set'>
                                <Field name='VAR' variabletype=''>
                                    Open Time
                                </Field>
                                <Value name='VALUE'>
                                    <Block type='read_ohlc_obj'>
                                        <Field name='OHLCFIELD_LIST'>epoch</Field>
                                        <Value name='OHLCOBJ'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    candle
                                                </Field>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Value>
                                <Next>
                                    <Block type='variables_set'>
                                        <Field name='VAR' variabletype=''>
                                            Open Time
                                        </Field>
                                        <Value name='VALUE'>
                                            <Block type='math_arithmetic'>
                                                <Field name='OP'>MINUS</Field>
                                                <Value name='A'>
                                                    <Shadow type='math_number'>
                                                        <Field name='NUM'>1</Field>
                                                    </Shadow>
                                                    <Block type='epoch' />
                                                </Value>
                                                <Value name='B'>
                                                    <Shadow type='math_number'>
                                                        <Field name='NUM'>1</Field>
                                                    </Shadow>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            Open Time
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Value>
                                        <Next>
                                            <Block type='controls_if'>
                                                <Value name='IF0'>
                                                    <Block type='logic_compare'>
                                                        <Field name='OP'>GTE</Field>
                                                        <Value name='A'>
                                                            <Block type='variables_get'>
                                                                <Field name='VAR' variabletype=''>
                                                                    Time Since Candle Opened
                                                                </Field>
                                                            </Block>
                                                        </Value>
                                                        <Value name='B'>
                                                            <Block type='math_number'>
                                                                <Field name='NUM'>30</Field>
                                                            </Block>
                                                        </Value>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Next>
                            </Block>
                        </Next>
                    </Block>
                </Example>
                <Example id='totimestamp'>
                    <Block type='before_purchase'>
                        <Statement name='BEFOREPURCHASE_STACK'>
                            <Block type='controls_if'>
                                <Value name='IF0'>
                                    <Block type='logic_compare'>
                                        <Field name='OP'>EQ</Field>
                                        <Value name='A'>
                                            <Block type='epoch' />
                                        </Value>
                                        <Value name='B'>
                                            <Block type='totimestamp'>
                                                <Value name='DATETIME'>
                                                    <Shadow type='text'>
                                                        <Field name='TEXT'>1957-08-31 00:00:00</Field>
                                                    </Shadow>
                                                </Value>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Value>
                                <Statement name='DO0'>
                                    <Block type='purchase'>
                                        <Field name='PURCHASE_LIST'>CALL</Field>
                                    </Block>
                                </Statement>
                            </Block>
                        </Statement>
                    </Block>
                </Example>
                <Example id='todatetime'>
                    <Block type='notify'>
                        <Field name='NOTIFICATION_TYPE'>success</Field>
                        <Field name='NOTIFICATION_SOUND'>silent</Field>
                        <Value name='MESSAGE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                            <Block type='todatetime'>
                                <Value name='TIMESTAMP'>
                                    <Shadow type='math_number'>
                                        <Field name='NUM'>0</Field>
                                    </Shadow>
                                    <Block type='epoch' />
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='constrain'>
                    <Block type='math_constrain'>
                        <Value name='VALUE'>
                            <Block type='math_number'>
                                <Field name='NUM'>5</Field>
                            </Block>
                        </Value>
                        <Value name='LOW'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>10</Field>
                            </Shadow>
                        </Value>
                        <Value name='HIGH'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>20</Field>
                            </Shadow>
                        </Value>
                    </Block>
                </Example>
                <Example id='controls_if'>
                    <Block type='controls_if'>
                        <Mutation elseif='1' else='1' />
                        <Value name='IF0'>
                            <Block type='logic_compare'>
                                <Field name='OP'>EQ</Field>
                                <Value name='A'>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            var1
                                        </Field>
                                    </Block>
                                </Value>
                                <Value name='B'>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            var2
                                        </Field>
                                    </Block>
                                </Value>
                            </Block>
                        </Value>
                        <Value name='IF1'>
                            <Block type='logic_compare'>
                                <Field name='OP'>EQ</Field>
                                <Value name='A'>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            var3
                                        </Field>
                                    </Block>
                                </Value>
                                <Value name='B'>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            var4
                                        </Field>
                                    </Block>
                                </Value>
                            </Block>
                        </Value>
                    </Block>
                </Example>
                <Example id='compare_logic'>
                    <Block type='logic_compare'>
                        <Field name='OP'>EQ</Field>
                    </Block>
                </Example>
                <Example id='compare_logic_1'>
                    <Block type='logic_operation'>
                        <Field name='OP'>AND</Field>
                    </Block>
                </Example>
                <Example id='repeat_while'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            x
                        </Field>
                        <Value name='VALUE'>
                            <Block type='math_number'>
                                <Field name='NUM'>0</Field>
                            </Block>
                        </Value>
                        <Next>
                            <Block type='controls_whileUntil'>
                                <Field name='MODE'>WHILE</Field>
                                <Value name='BOOL'>
                                    <Block type='logic_compare'>
                                        <Field name='OP'>LTE</Field>
                                        <Value name='A'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    x
                                                </Field>
                                            </Block>
                                        </Value>
                                        <Value name='B'>
                                            <Block type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Value>
                                <Statement name='DO'>
                                    <Block type='math_change'>
                                        <Field name='VAR' variabletype=''>
                                            x
                                        </Field>
                                        <Value name='DELTA'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>1</Field>
                                            </Shadow>
                                        </Value>
                                        <Next>
                                            <Block type='notify'>
                                                <Field name='NOTIFICATION_TYPE'>success</Field>
                                                <Field name='NOTIFICATION_SOUND'>silent</Field>
                                                <Value name='MESSAGE'>
                                                    <Shadow type='text'>
                                                        <Field name='TEXT'>abc</Field>
                                                    </Shadow>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            x
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Statement>
                            </Block>
                        </Next>
                    </Block>
                </Example>
                <Example id='repeat_until'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            x
                        </Field>
                        <Value name='VALUE'>
                            <Block type='math_number'>
                                <Field name='NUM'>20</Field>
                            </Block>
                        </Value>
                        <Next>
                            <Block type='controls_whileUntil'>
                                <Field name='MODE'>UNTIL</Field>
                                <Value name='BOOL'>
                                    <Block type='logic_compare'>
                                        <Field name='OP'>EQ</Field>
                                        <Value name='A'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    x
                                                </Field>
                                            </Block>
                                        </Value>
                                        <Value name='B'>
                                            <Block type='math_number'>
                                                <Field name='NUM'>10</Field>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Value>
                                <Statement name='DO'>
                                    <Block type='math_change'>
                                        <Field name='VAR' variabletype=''>
                                            x
                                        </Field>
                                        <Value name='DELTA'>
                                            <Shadow type='math_number'>
                                                <Field name='NUM'>-1</Field>
                                            </Shadow>
                                        </Value>
                                        <Next>
                                            <Block type='notify'>
                                                <Field name='NOTIFICATION_TYPE'>success</Field>
                                                <Field name='NOTIFICATION_SOUND'>silent</Field>
                                                <Value name='MESSAGE'>
                                                    <Shadow type='text'>
                                                        <Field name='TEXT'>abc</Field>
                                                    </Shadow>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            x
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Statement>
                            </Block>
                        </Next>
                    </Block>
                </Example>
                <Example id='controls_for'>
                    <Block type='controls_for'>
                        <Field name='VAR' variabletype=''>
                            i
                        </Field>
                        <Value name='FROM'>
                            <Block type='math_number'>
                                <Field name='NUM'>0</Field>
                            </Block>
                        </Value>
                        <Value name='TO'>
                            <Block type='math_number'>
                                <Field name='NUM'>10</Field>
                            </Block>
                        </Value>
                        <Value name='BY'>
                            <Block type='math_number'>
                                <Field name='NUM'>2</Field>
                            </Block>
                        </Value>
                        <Statement name='DO'>
                            <Block type='notify'>
                                <Field name='NOTIFICATION_TYPE'>success</Field>
                                <Field name='NOTIFICATION_SOUND'>silent</Field>
                                <Value name='MESSAGE'>
                                    <Shadow type='text'>
                                        <Field name='TEXT'>abc</Field>
                                    </Shadow>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            i
                                        </Field>
                                    </Block>
                                </Value>
                            </Block>
                        </Statement>
                    </Block>
                </Example>
                <Example id='controls_forEach'>
                    <Block type='lists_create_with'>
                        <Field name='VARIABLE'>list</Field>
                        <Statement name='STACK'>
                            <Block type='lists_statement'>
                                <Value name='VALUE'>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            item1
                                        </Field>
                                    </Block>
                                </Value>
                                <Next>
                                    <Block type='lists_statement'>
                                        <Value name='VALUE'>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    item2
                                                </Field>
                                            </Block>
                                        </Value>
                                        <Next>
                                            <Block type='lists_statement'>
                                                <Value name='VALUE'>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            item3
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Next>
                            </Block>
                        </Statement>
                        <Next>
                            <Block type='controls_forEach'>
                                <Field name='VAR' variabletype=''>
                                    i
                                </Field>
                                <Value name='LIST'>
                                    <Block type='variables_get'>
                                        <Field name='VAR' variabletype=''>
                                            list
                                        </Field>
                                    </Block>
                                </Value>
                                <Statement name='DO'>
                                    <Block type='notify'>
                                        <Field name='NOTIFICATION_TYPE'>success</Field>
                                        <Field name='NOTIFICATION_SOUND'>silent</Field>
                                        <Value name='MESSAGE'>
                                            <Shadow type='text'>
                                                <Field name='TEXT'>abc</Field>
                                            </Shadow>
                                            <Block type='variables_get'>
                                                <Field name='VAR' variabletype=''>
                                                    i
                                                </Field>
                                            </Block>
                                        </Value>
                                    </Block>
                                </Statement>
                            </Block>
                        </Next>
                    </Block>
                </Example>
                <Example id='break_out'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            x
                        </Field>
                        <Value name='VALUE'>
                            <Block type='logic_boolean'>
                                <Field name='BOOL'>TRUE</Field>
                            </Block>
                        </Value>
                        <Next>
                            <Block type='controls_repeat'>
                                <Field name='TIMES'>10</Field>
                                <Statement name='DO'>
                                    <Block type='controls_if'>
                                        <Value name='IF0'>
                                            <Block type='logic_negate'>
                                                <Value name='BOOL'>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            x
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Value>
                                        <Statement name='DO0'>
                                            <Block type='controls_flow_statements'>
                                                <Field name='FLOW'>BREAK</Field>
                                            </Block>
                                        </Statement>
                                        <Next>
                                            <Block type='notify'>
                                                <Field name='NOTIFICATION_TYPE'>success</Field>
                                                <Field name='NOTIFICATION_SOUND'>silent</Field>
                                                <Value name='MESSAGE'>
                                                    <Shadow type='text'>
                                                        <Field name='TEXT'>abc</Field>
                                                    </Shadow>
                                                </Value>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Statement>
                            </Block>
                        </Next>
                    </Block>
                </Example>
                <Example id='continue'>
                    <Block type='variables_set'>
                        <Field name='VAR' variabletype=''>
                            x
                        </Field>
                        <Value name='VALUE'>
                            <Block type='logic_boolean'>
                                <Field name='BOOL'>FALSE</Field>
                            </Block>
                        </Value>
                        <Next>
                            <Block type='controls_repeat'>
                                <Field name='TIMES'>10</Field>
                                <Statement name='DO'>
                                    <Block type='controls_if'>
                                        <Value name='IF0'>
                                            <Block type='logic_negate'>
                                                <Value name='BOOL'>
                                                    <Block type='variables_get'>
                                                        <Field name='VAR' variabletype=''>
                                                            x
                                                        </Field>
                                                    </Block>
                                                </Value>
                                            </Block>
                                        </Value>
                                        <Statement name='DO0'>
                                            <Block type='variables_set'>
                                                <Field name='VAR' variabletype=''>
                                                    x
                                                </Field>
                                                <Value name='VALUE'>
                                                    <Block type='logic_boolean'>
                                                        <Field name='BOOL'>TRUE</Field>
                                                    </Block>
                                                </Value>
                                                <Next>
                                                    <Block type='controls_flow_statements'>
                                                        <Field name='FLOW'>CONTINUE</Field>
                                                    </Block>
                                                </Next>
                                            </Block>
                                        </Statement>
                                        <Next>
                                            <Block type='notify'>
                                                <Field name='NOTIFICATION_TYPE'>success</Field>
                                                <Field name='NOTIFICATION_SOUND'>silent</Field>
                                                <Value name='MESSAGE'>
                                                    <Shadow type='text'>
                                                        <Field name='TEXT'>abc</Field>
                                                    </Shadow>
                                                </Value>
                                            </Block>
                                        </Next>
                                    </Block>
                                </Statement>
                            </Block>
                        </Next>
                    </Block>
                </Example>
            </Examples>
    </>
);
