import { Block, Category, Example, Examples, Field, Mutation, Next, Shadow, Statement, Value, Xml } from './tags';
import { localize } from '@deriv-com/translations';

export const UtilityCategory = () => (
    <>
            <Category id='utility' name={localize('Utility')}>
                <Category name={localize('Custom functions')} id='custom_functions' dynamic='PROCEDURE' />

                <Category name={localize('Variables')} id='variables' dynamic='VARIABLE' />

                <Category name={localize('Notifications')} id='notifications'>
                    <Block type='text_print'>
                        <Value name='TEXT'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_prompt_ext'>
                        <Field name='TYPE'>TEXT</Field>
                        <Value name='TEXT'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='notify'>
                        <Field name='NOTIFICATION_TYPE'>success</Field>
                        <Value name='MESSAGE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='sweet_alert'>
                        <Field name='ALERT_ICON'>success</Field>
                        <Value name='TITLE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>Take profit reached</Field>
                            </Shadow>
                        </Value>
                        <Value name='MESSAGE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>The bot stopped at its take profit.</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='notify_telegram'>
                        <Value name='TELEGRAM_ACCESS_TOKEN'>
                            <Shadow type='text'>
                                <Field name='TEXT' />
                            </Shadow>
                        </Value>
                        <Value name='TELEGRAM_CHAT_ID'>
                            <Shadow type='text'>
                                <Field name='TEXT' />
                            </Shadow>
                        </Value>
                        <Value name='TELEGRAM_MESSAGE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                </Category>

                <Category name={localize('Time')} id='time'>
                    <Block type='epoch' />
                    <Block type='timeout' />
                    <Block type='tick_delay' />
                    <Block type='totimestamp'>
                        <Value name='DATETIME'>
                            <Shadow type='text'>
                                <Field name='TEXT'>yyyy-mm-dd hh:mm:ss</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='todatetime'>
                        <Value name='TIMESTAMP'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>0</Field>
                            </Shadow>
                        </Value>
                    </Block>
                </Category>

                <Category name={localize('Math')} id='math'>
                    <Block type='math_number' />
                    <Block type='math_arithmetic'>
                        <Field name='OP'>ADD</Field>
                        <Value name='A'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                        <Value name='B'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_single'>
                        <Field name='OP'>ROOT</Field>
                        <Value name='NUM'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>9</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_trig'>
                        <Field name='OP'>SIN</Field>
                        <Value name='NUM'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>45</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_constant' />
                    <Block type='math_number_property'>
                        <Mutation divisor_input='false' />
                        <Field name='PROPERTY'>EVEN</Field>
                        <Value name='NUMBER_TO_CHECK'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>0</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_change'>
                        <Field name='VAR' variabletype=''>
                            item
                        </Field>
                        <Value name='DELTA'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_on_list' />
                    <Block type='math_round'>
                        <Field name='OP'>ROUND</Field>
                        <Value name='NUM'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>3.1</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_modulo'>
                        <Value name='DIVIDEND'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>64</Field>
                            </Shadow>
                        </Value>
                        <Value name='DIVISOR'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>10</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_constrain'>
                        <Value name='Value'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>50</Field>
                            </Shadow>
                        </Value>
                        <Value name='LOW'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                        <Value name='HIGH'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>100</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_random_int'>
                        <Value name='FROM'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                        <Value name='TO'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>100</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='math_random_float' />
                </Category>

                <Category name={localize('Text')} id='text'>
                    <Block type='text'>
                        <Field name='TEXT'>abc</Field>
                    </Block>
                    <Block type='text_join'>
                        <Field name='VARIABLE' variabletype=''>
                            text
                        </Field>
                        <Statement name='STACK'>
                            <Block type='text_statement' movable='false'>
                                <Value name='TEXT'>
                                    <Shadow type='text'>
                                        <Field name='TEXT'>abc</Field>
                                    </Shadow>
                                </Value>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='text_append'>
                        <Field name='VAR' variabletype=''>
                            text
                        </Field>
                        <Value name='TEXT'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_length'>
                        <Value name='Value'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_isEmpty'>
                        <Value name='Value'>
                            <Shadow type='text'>
                                <Field name='TEXT' />
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_indexOf'>
                        <Field name='END'>FIRST</Field>
                        <Value name='Value'>
                            <Block type='variables_get'>
                                <Field name='VAR' variabletype=''>
                                    text
                                </Field>
                            </Block>
                        </Value>
                        <Value name='FIND'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_charAt'>
                        <Mutation at='true' />
                        <Field name='WHERE'>FROM_START</Field>
                        <Value name='Value'>
                            <Block type='variables_get'>
                                <Field name='VAR' variabletype=''>
                                    item
                                </Field>
                            </Block>
                        </Value>
                        <Value name='AT'>
                            <Shadow type='math_number_positive'>
                                <Field name='NUM'>1</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_getSubstring'>
                        <Mutation at1='true' at2='true' />
                        <Field name='WHERE1'>FROM_START</Field>
                        <Field name='WHERE2'>FROM_START</Field>
                        <Value name='STRING'>
                            <Block type='variables_get'>
                                <Field name='VAR' variabletype=''>
                                    text
                                </Field>
                            </Block>
                        </Value>
                        <Value name='AT1'>
                            <Shadow type='math_number_positive'>
                                <Field name='NUM'>0</Field>
                            </Shadow>
                        </Value>
                        <Value name='AT2'>
                            <Shadow type='math_number_positive'>
                                <Field name='NUM'>2</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_changeCase'>
                        <Field name='CASE'>UPPERCASE</Field>
                        <Value name='TEXT'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='text_trim'>
                        <Field name='MODE'>BOTH</Field>
                        <Value name='TEXT'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                </Category>

                <Category name={localize('Logic')} id='logic'>
                    <Block type='controls_if' />
                    <Block type='logic_compare' />
                    <Block type='logic_operation' />
                    <Block type='logic_negate' />
                    <Block type='logic_boolean' />
                    <Block type='logic_null' />
                    <Block type='logic_ternary' />
                </Category>

                <Category name={localize('Lists')} id='lists'>
                    <Block type='lists_create_with'>
                        <Field name='VARIABLE' variabletype=''>
                            list
                        </Field>
                        <Statement name='STACK'>
                            <Block type='lists_statement' movable='false'>
                                <Next>
                                    <Block type='lists_statement' movable='false' />
                                </Next>
                            </Block>
                        </Statement>
                    </Block>
                    <Block type='lists_repeat'>
                        <Value name='NUM'>
                            <Shadow type='math_number'>
                                <Field name='NUM'>5</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='lists_length' />
                    <Block type='lists_isEmpty' />
                    <Block type='lists_indexOf' />
                    <Block type='lists_getIndex' />
                    <Block type='lists_setIndex' />
                    <Block type='lists_getSublist' />
                    <Block type='lists_split'>
                        <Mutation mode='SPLIT' />
                        <Field name='MODE'>SPLIT</Field>
                        <Value name='DELIM'>
                            <Shadow type='text'>
                                <Field name='TEXT'>,</Field>
                            </Shadow>
                        </Value>
                    </Block>
                    <Block type='lists_sort' />
                </Category>

                <Category name={localize('Loops')} id='loops'>
                    <Block type='controls_repeat' />
                    <Block type='controls_repeat_ext' />
                    <Block type='controls_whileUntil' />
                    <Block type='controls_for' />
                    <Block type='controls_forEach' />
                    <Block type='controls_flow_statements' />
                </Category>

                <Category name={localize('Miscellaneous')} id='misc'>
                    <Block type='loader' />
                    <Block type='block_holder' />
                    <Block type='console'>
                        <Value name='MESSAGE'>
                            <Shadow type='text'>
                                <Field name='TEXT'>abc</Field>
                            </Shadow>
                        </Value>
                    </Block>
                </Category>
            </Category>
    </>
);
