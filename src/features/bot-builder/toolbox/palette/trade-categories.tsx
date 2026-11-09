import { Block, Category, Example, Examples, Field, Mutation, Next, Shadow, Statement, Value, Xml } from './tags';
import { localize } from '@deriv-com/translations';

export const TradeCategories = () => (
    <>
            <Category id='trade_parameters' name={localize('Trade parameters')}>
                <Block type='trade_definition'>
                    <Field name='MODE_LIST'>CONTINUOUS</Field>
                    <Statement name='TRADE_OPTIONS'>
                        <Block type='trade_definition_market' deletable='false' movable='false'>
                            <Field name='MARKET_LIST' />
                            <Field name='SUBMARKET_LIST' />
                            <Field name='SYMBOL_LIST' />
                            <Next>
                                <Block type='trade_definition_tradetype' deletable='false' movable='false'>
                                    <Field name='TRADETYPECAT_LIST' />
                                    <Field name='TRADETYPE_LIST' />
                                    <Next>
                                        <Block type='trade_definition_contracttype' deletable='false' movable='false'>
                                            <Field name='TYPE_LIST' />
                                            <Next>
                                                <Block
                                                    type='trade_definition_candleinterval'
                                                    deletable='false'
                                                    movable='false'
                                                >
                                                    <Field name='CANDLEINTERVAL_LIST'>60</Field>
                                                    <Next>
                                                        <Block
                                                            type='trade_definition_restartbuysell'
                                                            deletable='false'
                                                            movable='false'
                                                        >
                                                            <Field name='TIME_MACHINE_ENABLED'>FALSE</Field>
                                                            <Next>
                                                                <Block
                                                                    type='trade_definition_restartonerror'
                                                                    deletable='false'
                                                                    movable='false'
                                                                >
                                                                    <Field name='RESTARTONERROR'>TRUE</Field>
                                                                </Block>
                                                            </Next>
                                                        </Block>
                                                    </Next>
                                                </Block>
                                            </Next>
                                        </Block>
                                    </Next>
                                </Block>
                            </Next>
                        </Block>
                    </Statement>
                </Block>
                <Block type='trade_definition_tradeoptions'>
                    <Mutation has_first_barrier='false' has_second_barrier='false' has_prediction='false' />
                    <Field name='DURATIONTYPE_LIST' />
                    <Field name='CURRENCY_LIST'>USD</Field>
                    <Value name='DURATION'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>1</Field>
                        </Shadow>
                    </Value>
                    <Value name='AMOUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>1</Field>
                        </Shadow>
                    </Value>
                    <Field name='AMOUNT_LIMITS' />
                </Block>
                <Block type='trade_definition_multiplier'>
                    <Field name='MULTIPLIERTYPE_LIST' />
                    <Field name='CURRENCY_LIST'>USD</Field>
                    <Value name='AMOUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>1</Field>
                        </Shadow>
                    </Value>
                    <Field name='AMOUNT_LIMITS' />
                </Block>
                <Block type='multiplier_take_profit'>
                    <Value name='AMOUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>0</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='multiplier_stop_loss'>
                    <Value name='AMOUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>0</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='trade_definition_accumulator'>
                    <Field name='GROWTHRATE_LIST' />
                    <Field name='CURRENCY_LIST'>USD</Field>
                    <Value name='AMOUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>1</Field>
                        </Shadow>
                    </Value>
                </Block>
                <Block type='accumulator_take_profit'>
                    <Value name='AMOUNT'>
                        <Shadow type='math_number'>
                            <Field name='NUM'>0</Field>
                        </Shadow>
                    </Value>
                </Block>
            </Category>
            <Category id='purchase_conditions' name={localize('Purchase conditions')}>
                <Block type='before_purchase' />
                <Block type='purchase' />
            </Category>
            <Category id='sell_conditions' name={localize('Sell conditions (optional)')}>
                <Block type='during_purchase' />
                <Block type='sell_at_market' />
            </Category>
            <Category id='trade_results' name={localize('Restart trading conditions')}>
                <Block type='after_purchase' />
                <Block type='trade_again' />
            </Category>
    </>
);
